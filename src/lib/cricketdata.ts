import "server-only";

// ---------------------------------------------------------------------------
// cricketdata.org (CricAPI v1) — structured live match data for IPL.
//
// Why: The CricAPI provides reliable, key-authenticated JSON for current
// matches without HTML scraping, undocumented consumer APIs, or Gemini quota.
// Using an official API key means stable rate limits and no IP blocking.
//
// Architecture note: this module has zero imports from cricinfo.ts or
// match-scraper.ts to prevent circular dependency chains. Callers map the
// CricketDataMatchState DTO into whatever shape they need locally.
// ---------------------------------------------------------------------------

const CRICKETDATA_BASE = "https://api.cricapi.com/v1";

// Why 30 s: aggressive enough to reflect live score changes within a polling
// cycle while keeping API quota consumption low (cron runs every 2 min).
const CACHE_TTL_MS = 30_000;

// ---------------------------------------------------------------------------
// Raw API response types (only the fields we actually use)
// ---------------------------------------------------------------------------

interface RawTeamInfo {
  name: string;
  shortname: string;
}

interface RawInningsScore {
  r: number;      // runs
  w: number;      // wickets
  o: number;      // overs as float, e.g. 18.4
  inning: string; // e.g. "Mumbai Indians Inning 1"
}

interface RawMatch {
  id: string;
  name: string;
  matchType: string;
  status: string;
  teams: string[];
  teamInfo?: RawTeamInfo[];
  score?: RawInningsScore[];
  tossWinner?: string;
  tossChoice?: string;   // "bat" or "field"
  matchWinner?: string;
  series_id?: string;
  matchStarted: boolean;
  matchEnded: boolean;
}

interface RawCurrentMatchesResponse {
  data: RawMatch[];
  status: string;
}

// ---------------------------------------------------------------------------
// Public DTOs — what callers receive from this module
// ---------------------------------------------------------------------------

export interface CricketDataInnings {
  inningsNumber: number;
  battingTeamShortName: string;
  runs: number;
  wickets: number;
  /** Formatted as "18.4" (string) for UI / DB consistency. */
  overs: string;
  isComplete: boolean;
}

export interface CricketDataMatchState {
  /** UUID from CricAPI — not a Cricinfo numeric ID. */
  matchId: string;
  seriesId: string;
  /** True when match has started and has not ended yet. */
  isLive: boolean;
  matchStarted: boolean;
  matchEnded: boolean;
  /** Human-readable status string from the API (e.g. "MI need 45 off 60 balls"). */
  statusText: string;
  /** e.g. "MI won the toss and elected to bat" — null if not yet known. */
  toss: string | null;
  innings: CricketDataInnings[];
  /**
   * Short name of the winning team (e.g. "MI"), or null if no result.
   * Populated once matchEnded === true and a winner exists.
   */
  matchWinnerShortName: string | null;
  matchPhase: "not_started" | "first_innings" | "second_innings" | "completed" | "abandoned";
}

// ---------------------------------------------------------------------------
// In-process cache — one entry per sorted team-pair key
// ---------------------------------------------------------------------------

interface CachedState {
  data: CricketDataMatchState | null;
  cachedAt: number;
}

const matchCache = new Map<string, CachedState>();

function cacheKey(t1: string, t2: string): string {
  // Why sort: MI vs RCB and RCB vs MI should share one cache entry.
  return [t1, t2].map((s) => s.toUpperCase()).sort().join("|");
}

// ---------------------------------------------------------------------------
// Normalisation — strip everything except lowercase letters for fuzzy
// team name matching (same logic as cricinfo.ts normShort).
// ---------------------------------------------------------------------------

function normShort(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

// ---------------------------------------------------------------------------
// Fetch current matches from cricketdata.org
// ---------------------------------------------------------------------------

async function fetchCurrentMatches(): Promise<RawMatch[]> {
  const apiKey = process.env.CRICKETDATA_API_KEY;
  // Why: fail fast and silently if key is missing — callers fall back to Cricinfo.
  if (!apiKey) return [];

  try {
    const url = `${CRICKETDATA_BASE}/currentMatches?apikey=${apiKey}&offset=0`;
    const res = await fetch(url, {
      // Why no-store: our own matchCache owns the TTL — Next.js data cache
      // must not add an extra layer on top.
      cache: "no-store",
    });
    if (!res.ok) return [];

    const json = (await res.json()) as RawCurrentMatchesResponse;
    if (json.status !== "success" || !Array.isArray(json.data)) return [];
    return json.data;
  } catch {
    // Network error or parse failure — non-fatal, caller falls back.
    return [];
  }
}

// ---------------------------------------------------------------------------
// Resolve the batting team's short name from the inning string.
//
// Why: CricAPI puts the full team name in score[i].inning ("Mumbai Indians
// Inning 1") rather than the abbreviated form. We cross-reference teamInfo
// to get the short name that matches our DB's Team.shortName field.
// ---------------------------------------------------------------------------

function resolveBattingShortName(
  inningStr: string,
  teamInfos: RawTeamInfo[],
): string {
  const lower = inningStr.toLowerCase();

  // Primary: find teamInfo whose full name is a prefix of the inning string.
  for (const ti of teamInfos) {
    if (lower.startsWith(ti.name.toLowerCase())) {
      return ti.shortname;
    }
  }

  // Secondary: normalized equality on the name portion before " Inning".
  const nameOnly = inningStr.replace(/\s+Inning\s*\d+/i, "").trim();
  for (const ti of teamInfos) {
    if (normShort(ti.name) === normShort(nameOnly)) {
      return ti.shortname;
    }
  }

  // Last resort: return whatever is before " Inning" as-is.
  return nameOnly || inningStr;
}

// ---------------------------------------------------------------------------
// Build a toss description string
// ---------------------------------------------------------------------------

function buildTossText(
  tossWinner: string | undefined,
  tossChoice: string | undefined,
  teamInfos: RawTeamInfo[],
): string | null {
  if (!tossWinner) return null;

  // Resolve full name → short name for the toss winner.
  const shortName =
    teamInfos.find(
      (ti) => normShort(ti.name) === normShort(tossWinner),
    )?.shortname ?? tossWinner;

  const elected =
    tossChoice === "bat"
      ? "elected to bat"
      : tossChoice === "field"
        ? "elected to field"
        : (tossChoice ?? "");

  return `${shortName} won the toss and ${elected}`.trim();
}

// ---------------------------------------------------------------------------
// Determine match phase from raw API fields
// ---------------------------------------------------------------------------

function deriveMatchPhase(
  match: RawMatch,
): CricketDataMatchState["matchPhase"] {
  if (!match.matchStarted) return "not_started";

  if (match.matchEnded) {
    // Why: matchEnded with no matchWinner = abandoned / no result (rain, etc.)
    return match.matchWinner ? "completed" : "abandoned";
  }

  // Why: innings count in score[] is the most reliable phase indicator —
  // once the second inning starts, CricAPI adds a second score entry.
  const scoreCount = match.score?.length ?? 0;
  if (scoreCount >= 2) return "second_innings";
  // Match started but score not yet populated counts as first innings opening.
  return "first_innings";
}

// ---------------------------------------------------------------------------
// Parse one raw innings entry into our typed shape
// ---------------------------------------------------------------------------

function parseInnings(
  raw: RawInningsScore,
  index: number,
  totalInnings: number,
  matchEnded: boolean,
  teamInfos: RawTeamInfo[],
): CricketDataInnings {
  const battingTeamShortName = resolveBattingShortName(raw.inning, teamInfos);

  // Why: an innings is complete when any of these is true:
  //   • There is a subsequent innings already in the score (it's not the last).
  //   • The match has ended (the last innings is always complete on end).
  //   • All 10 wickets have fallen.
  //   • 20 overs have been bowled (T20 maximum).
  const isComplete =
    index < totalInnings - 1 ||
    matchEnded ||
    raw.w >= 10 ||
    raw.o >= 20;

  return {
    inningsNumber: index + 1,
    battingTeamShortName,
    runs: raw.r,
    wickets: raw.w,
    // Why: format as fixed 1 decimal ("18.4") to match how DB + UI expect overs.
    overs: raw.o.toFixed(1),
    isComplete,
  };
}

// ---------------------------------------------------------------------------
// Map one RawMatch → CricketDataMatchState
// ---------------------------------------------------------------------------

function mapMatch(raw: RawMatch): CricketDataMatchState {
  const teamInfos = raw.teamInfo ?? [];
  const scoreArr = raw.score ?? [];

  const innings: CricketDataInnings[] = scoreArr.map((s, idx) =>
    parseInnings(s, idx, scoreArr.length, raw.matchEnded, teamInfos),
  );

  // Resolve winner full name → short name.
  const matchWinnerShortName = raw.matchWinner
    ? (teamInfos.find(
        (ti) => normShort(ti.name) === normShort(raw.matchWinner!),
      )?.shortname ?? raw.matchWinner)
    : null;

  return {
    matchId: raw.id,
    seriesId: raw.series_id ?? "",
    isLive: raw.matchStarted && !raw.matchEnded,
    matchStarted: raw.matchStarted,
    matchEnded: raw.matchEnded,
    statusText: raw.status,
    toss: buildTossText(raw.tossWinner, raw.tossChoice, teamInfos),
    innings,
    matchWinnerShortName,
    matchPhase: deriveMatchPhase(raw),
  };
}

// ---------------------------------------------------------------------------
// Team matching — check if both our teams appear in a raw match entry.
//
// Why two strategies: CricAPI sometimes uses full names in `teams[]` and
// short names in `teamInfo[].shortname`. We check both to maximise coverage.
// ---------------------------------------------------------------------------

function matchHasTeams(
  raw: RawMatch,
  ourTeam1Short: string,
  ourTeam2Short: string,
): boolean {
  const n1 = normShort(ourTeam1Short);
  const n2 = normShort(ourTeam2Short);

  // Build a set of all normalised identifiers available in this match entry.
  const allNorm = new Set<string>();
  for (const t of raw.teams) allNorm.add(normShort(t));
  for (const ti of raw.teamInfo ?? []) {
    allNorm.add(normShort(ti.name));
    allNorm.add(normShort(ti.shortname));
  }

  return allNorm.has(n1) && allNorm.has(n2);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Looks up the current match between two IPL teams from cricketdata.org.
 *
 * Why cached: the cron polls every 2 minutes but this function is also called
 * from the live-score API route on every browser request. The 30 s in-process
 * cache prevents redundant API calls within the same server instance.
 *
 * Returns null when:
 *   - The API key is missing.
 *   - The match is not yet appearing in currentMatches (e.g. hours before start).
 *   - A network error occurred.
 */
export async function findCurrentIPLMatch(
  team1Short: string,
  team2Short: string,
): Promise<CricketDataMatchState | null> {
  const key = cacheKey(team1Short, team2Short);
  const now = Date.now();

  const cached = matchCache.get(key);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const matches = await fetchCurrentMatches();
  const found = matches.find((m) => matchHasTeams(m, team1Short, team2Short)) ?? null;

  const data = found ? mapMatch(found) : null;
  matchCache.set(key, { data, cachedAt: now });
  return data;
}

/**
 * Converts a CricketDataMatchState into a ScrapedMatchData-compatible shape
 * so match-scraper.ts callers get a drop-in replacement value.
 *
 * Why colocated here: the mapping is tightly coupled to CricketDataMatchState
 * fields, and keeping it here avoids a second import layer in match-scraper.ts.
 */
export function toScrapedMatchData(state: CricketDataMatchState): {
  matchPhase: "not_started" | "first_innings" | "second_innings" | "completed" | "abandoned";
  innings: Array<{
    battingTeamShortName: string;
    runs: number;
    wickets: number;
    overs: string;
    isComplete: boolean;
  }>;
  resultText: string | null;
  winningTeamShortName: string | null;
  toss: string | null;
} {
  return {
    matchPhase: state.matchPhase,
    innings: state.innings.map((inn) => ({
      battingTeamShortName: inn.battingTeamShortName,
      runs: inn.runs,
      wickets: inn.wickets,
      overs: inn.overs,
      isComplete: inn.isComplete,
    })),
    // Why: use statusText as resultText when match has ended — it's the
    // human-readable result string (e.g. "MI won by 6 wickets").
    resultText: state.matchEnded ? state.statusText : null,
    winningTeamShortName: state.matchWinnerShortName,
    toss: state.toss,
  };
}
