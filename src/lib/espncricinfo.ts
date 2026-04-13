import "server-only";

// ---------------------------------------------------------------------------
// ESPNCricinfo live match data — the single source of truth for all match
// state in the cron poller, live-score API route, and standings updater.
//
// Strategy:
//   Primary:  The espncricinfoUrl stored in the DB encodes the series ID and
//             match ID. We extract them and call the consumer API details
//             endpoint directly — no search, no Gemini, no HTML parsing.
//   Fallback: If no URL is stored yet, we search the current-matches list by
//             team short names and resolve IDs from the first hit.
//
// Cache TTL: 2 minutes — fast enough for real-time browser score display,
//   light enough for the hourly cron cadence.
// ---------------------------------------------------------------------------

const CONSUMER_API = "https://hs-consumer-api.espncricinfo.com/v1";
const CACHE_TTL_MS = 2 * 60 * 1_000; // 2 minutes

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.espncricinfo.com",
  Referer: "https://www.espncricinfo.com/",
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EspnInnings {
  inningsNumber: number;
  battingTeamShortName: string;
  runs: number;
  wickets: number;
  overs: string;
  isComplete: boolean;
}

export interface EspnMatchData {
  matchPhase:
    | "not_started"
    | "first_innings"
    | "second_innings"
    | "completed"
    | "abandoned";
  isLive: boolean;
  matchEnded: boolean;
  statusText: string;
  toss: string | null;
  innings: EspnInnings[];
  winningTeamShortName: string | null;
  resultText: string | null;
  isFirstInningsComplete: boolean;
  seriesId: number | null;
  matchId: number | null;
}

// ---------------------------------------------------------------------------
// In-process cache — keyed by "seriesId:matchId" (primary) or sorted team
// pair "TEAM1|TEAM2" (fallback). Shared across cron and browser requests.
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: EspnMatchData | null;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

function idKey(seriesId: number, matchId: number): string {
  return `${seriesId}:${matchId}`;
}

function teamKey(t1: string, t2: string): string {
  return [t1, t2]
    .map((s) => s.toUpperCase())
    .sort()
    .join("|");
}

// ---------------------------------------------------------------------------
// Normalisation — strip to lowercase letters for fuzzy team name matching.
// ---------------------------------------------------------------------------

export function normShort(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

// ---------------------------------------------------------------------------
// Safe property accessors
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function bool(v: unknown): boolean {
  return v === true;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

// ---------------------------------------------------------------------------
// URL parsing — extract series and match IDs from a stored ESPNCricinfo URL.
//
// URL format:
//   https://www.espncricinfo.com/series/{series-slug}-{seriesId}/{match-slug}-{matchId}/...
// Example:
//   https://www.espncricinfo.com/series/ipl-2026-1510719/mi-vs-rcb-20th-match-1527693/live-cricket-score
//   → seriesId=1510719, matchId=1527693
// ---------------------------------------------------------------------------

export function parseEspncricinfoUrl(
  url: string,
): { seriesId: number; matchId: number } | null {
  // Why: the last numeric segment in the series path is the seriesId; the last
  // numeric segment in the match path is the matchId.
  const m = url.match(/\/series\/[^/]+-(\d+)\/[^/]+-(\d+)\//);
  if (!m) return null;
  const seriesId = parseInt(m[1], 10);
  const matchId = parseInt(m[2], 10);
  if (!seriesId || !matchId) return null;
  return { seriesId, matchId };
}

// ---------------------------------------------------------------------------
// HTTP fetch — returns parsed JSON or null on any failure.
// ---------------------------------------------------------------------------

async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Innings parsing helpers
// ---------------------------------------------------------------------------

function oversStr(raw: unknown): string {
  if (typeof raw === "number") return raw.toFixed(1);
  const s = str(raw);
  return s || "0.0";
}

function parseInningsIsComplete(
  idx: number,
  total: number,
  isMatchComplete: boolean,
  wickets: number,
  overs: string,
  isDeclared: boolean,
): boolean {
  const isLastInnings = idx === total - 1;
  const oversNum = parseFloat(overs);
  // Why: an innings is complete when it is not the last one still in play,
  // or when the match is over, or when a standard completion condition holds.
  return (
    !isLastInnings ||
    isMatchComplete ||
    isDeclared ||
    wickets >= 10 ||
    oversNum >= 20
  );
}

// Parse innings from miniscore.matchScoreDetails.matchTeamInfo (most current during play).
function parseInningsFromTeamInfo(
  teamInfoArr: unknown[],
  isMatchComplete: boolean,
): EspnInnings[] {
  return teamInfoArr.map((item, idx) => {
    const inn = obj(item);
    const shortName = str(
      inn.batTeamShortName ?? inn.teamShortName ?? inn.shortName ?? "?",
    );
    const runs = num(inn.score ?? inn.runs ?? 0);
    const wickets = num(inn.wickets ?? 0);
    const overs = oversStr(inn.overs ?? inn.currentOvers ?? 0);
    const isDeclared = bool(inn.isDeclared);
    return {
      inningsNumber: num(inn.inningsId ?? idx + 1),
      battingTeamShortName: shortName,
      runs,
      wickets,
      overs,
      isComplete: parseInningsIsComplete(
        idx,
        teamInfoArr.length,
        isMatchComplete,
        wickets,
        overs,
        isDeclared,
      ),
    };
  });
}

// Parse innings from scorecard array (fallback when miniscore absent).
function parseInningsFromScorecard(
  scorecard: unknown[],
  isMatchComplete: boolean,
): EspnInnings[] {
  return scorecard.map((item, idx) => {
    const sc = obj(item);
    const batTeam = obj(sc.batTeamDetails ?? sc.battingTeam ?? {});
    const scoreDetails = obj(sc.scoreDetails ?? sc.score ?? sc);
    const shortName = str(
      batTeam.batTeamShortName ??
        batTeam.shortName ??
        batTeam.shortDisplayName ??
        "?",
    );
    const runs = num(scoreDetails.runs ?? scoreDetails.score ?? 0);
    const wickets = num(scoreDetails.wickets ?? 0);
    const overs = oversStr(scoreDetails.overs ?? scoreDetails.currentOvers ?? 0);
    const isDeclared = bool(scoreDetails.isDeclared);
    return {
      inningsNumber: num(sc.inningsId ?? idx + 1),
      battingTeamShortName: shortName,
      runs,
      wickets,
      overs,
      isComplete: parseInningsIsComplete(
        idx,
        scorecard.length,
        isMatchComplete,
        wickets,
        overs,
        isDeclared,
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// Toss text builder
// ---------------------------------------------------------------------------

function buildTossText(header: Record<string, unknown>): string | null {
  const tossR = obj(header.tossResults ?? header.toss ?? {});
  const winnerName = str(tossR.tossWinnerName ?? tossR.winnerName ?? "");
  if (!winnerName) return null;
  const dec = str(tossR.decision ?? tossR.tossChoice ?? "");
  const elected =
    dec === "bat"
      ? "elected to bat"
      : dec === "field" || dec === "bowl"
        ? "elected to field"
        : dec;
  return elected ? `${winnerName} ${elected}`.trim() : winnerName;
}

// ---------------------------------------------------------------------------
// Winner resolution — map full team name → short name using matchHeader teams.
//
// Why: the result.winningTeam field returns the full name ("Mumbai Indians")
// while our DB stores short names ("MI"). We cross-reference matchHeader
// team entries to get the canonical short name.
// ---------------------------------------------------------------------------

function resolveWinnerShortName(
  resultObj: Record<string, unknown>,
  header: Record<string, unknown>,
): string | null {
  const winnerFull = str(resultObj.winningTeam ?? resultObj.winner ?? "");
  if (!winnerFull) return null;

  const team1 = obj(header.team1 ?? header.homeTeam ?? {});
  const team2 = obj(header.team2 ?? header.awayTeam ?? {});
  const t1Short = str(team1.shortName ?? team1.shortDisplayName ?? "");
  const t2Short = str(team2.shortName ?? team2.shortDisplayName ?? "");
  const t1Full = str(team1.name ?? team1.longName ?? t1Short);
  const t2Full = str(team2.name ?? team2.longName ?? t2Short);

  const nw = normShort(winnerFull);
  if (t1Short && (nw === normShort(t1Short) || nw === normShort(t1Full))) {
    return t1Short;
  }
  if (t2Short && (nw === normShort(t2Short) || nw === normShort(t2Full))) {
    return t2Short;
  }

  // Why: return as-is if no match found — resolveCompletedResult in
  // match-poller will still normalise both sides before comparing.
  return winnerFull;
}

// ---------------------------------------------------------------------------
// Parse the consumer API match-details response.
//
// Response shape:
//   { content: { matchHeader: {...}, scorecard: [...], miniscore: {...} } }
// ---------------------------------------------------------------------------

function parseDetailsResponse(
  raw: unknown,
  seriesId: number,
  matchId: number,
): EspnMatchData | null {
  if (!raw) return null;

  const root = obj(raw);
  const content = obj(root.content ?? root);
  const header = obj(content.matchHeader ?? content.header ?? {});

  // Why: if there is neither a status field nor a matchId, the response is
  // not a valid match details payload (could be a 200 with an error body).
  if (!header.status && !header.matchId) return null;

  const statusText = str(header.status ?? content.statusText ?? "");
  const statusLower = statusText.toLowerCase();

  const isComplete =
    bool(header.complete) ||
    statusLower.includes(" won ") ||
    statusLower.includes("match tied");
  const isAbandoned =
    bool(header.abandoned) ||
    statusLower.includes("no result") ||
    statusLower.includes("abandoned");
  const isLive = bool(header.live);

  const toss = buildTossText(header);

  const resultObj = obj(header.result ?? content.result ?? {});
  const winningTeamShortName = resolveWinnerShortName(resultObj, header);

  // Build innings array — prefer miniscore.matchScoreDetails.matchTeamInfo
  // as it reflects the live state; fall back to scorecard.
  const miniscore = obj(content.miniscore ?? {});
  const msd = obj(miniscore.matchScoreDetails ?? {});
  const teamInfoArr = arr(msd.matchTeamInfo ?? []);
  const scorecard = arr(content.scorecard ?? []);

  let innings: EspnInnings[];
  if (teamInfoArr.length > 0) {
    innings = parseInningsFromTeamInfo(teamInfoArr, isComplete);
  } else if (scorecard.length > 0) {
    innings = parseInningsFromScorecard(scorecard, isComplete);
  } else {
    innings = [];
  }

  // Derive the canonical match phase.
  let matchPhase: EspnMatchData["matchPhase"];
  if (isAbandoned) {
    matchPhase = "abandoned";
  } else if (isComplete) {
    matchPhase = "completed";
  } else if (!isLive && innings.length === 0) {
    matchPhase = "not_started";
  } else if (innings.length >= 2) {
    matchPhase = "second_innings";
  } else {
    matchPhase = "first_innings";
  }

  const matchEnded = matchPhase === "completed" || matchPhase === "abandoned";
  const isFirstInningsComplete =
    innings.length >= 2 || (innings.length === 1 && innings[0].isComplete);

  return {
    matchPhase,
    isLive,
    matchEnded,
    statusText,
    toss,
    innings,
    winningTeamShortName,
    // Why: resultText is only meaningful once a match has a definitive outcome.
    resultText: matchEnded ? statusText : null,
    isFirstInningsComplete,
    seriesId,
    matchId,
  };
}

// ---------------------------------------------------------------------------
// Parse a single entry from the current-matches list to extract IDs for the
// fallback path (when no URL is stored yet).
// ---------------------------------------------------------------------------

function parseCurrentMatchEntry(m: Record<string, unknown>): {
  team1Short: string;
  team2Short: string;
  seriesId: number;
  matchId: number;
} | null {
  const team1 = obj(m.team1);
  const team2 = obj(m.team2);
  const t1Short = str(team1.shortName ?? team1.shortDisplayName ?? "");
  const t2Short = str(team2.shortName ?? team2.shortDisplayName ?? "");
  const seriesObj = obj(m.series);
  const seriesId = num(m.seriesId ?? seriesObj.id ?? 0);
  const matchId = num(m.objectId ?? m.matchId ?? m.id ?? 0);
  if (!t1Short || !t2Short || !seriesId || !matchId) return null;
  return { team1Short: t1Short, team2Short: t2Short, seriesId, matchId };
}

// ---------------------------------------------------------------------------
// Fetch by IDs — primary path when URL is stored.
// ---------------------------------------------------------------------------

async function fetchByIds(
  seriesId: number,
  matchId: number,
): Promise<EspnMatchData | null> {
  const key = idKey(seriesId, matchId);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) return cached.data;

  const url = `${CONSUMER_API}/pages/match/details?lang=en&seriesId=${seriesId}&matchId=${matchId}`;
  const raw = await fetchJson(url);
  const data = parseDetailsResponse(raw, seriesId, matchId);
  cache.set(key, { data, cachedAt: now });
  return data;
}

// ---------------------------------------------------------------------------
// Fetch by team names — fallback when no URL is stored yet.
// ---------------------------------------------------------------------------

async function fetchByTeamNames(
  team1Short: string,
  team2Short: string,
): Promise<EspnMatchData | null> {
  const key = teamKey(team1Short, team2Short);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) return cached.data;

  const raw = await fetchJson(`${CONSUMER_API}/pages/matches/current?lang=en`);
  if (!raw) {
    cache.set(key, { data: null, cachedAt: now });
    return null;
  }

  const root = obj(raw);
  const content = obj(root.content);
  const matches = arr(
    content.matches ?? root.matches ?? content.currentMatches ?? [],
  );

  const n1 = normShort(team1Short);
  const n2 = normShort(team2Short);

  for (const m of matches) {
    const entry = parseCurrentMatchEntry(obj(m));
    if (!entry) continue;
    const e1 = normShort(entry.team1Short);
    const e2 = normShort(entry.team2Short);
    if ((e1 === n1 || e1 === n2) && (e2 === n1 || e2 === n2)) {
      const data = await fetchByIds(entry.seriesId, entry.matchId);
      cache.set(key, { data, cachedAt: now });
      return data;
    }
  }

  cache.set(key, { data: null, cachedAt: now });
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns live match data for the given ESPNCricinfo match.
 *
 * Primary path: the stored URL contains series/match IDs → direct details
 *   API call, no searching required.
 * Fallback: if no URL is stored, search the current-matches list by team
 *   short names (covers the early period before URLs are set).
 *
 * Returns null when the match is not found or the API is unavailable.
 */
export async function getMatchData(
  espncricinfoUrl: string | null,
  team1Short?: string,
  team2Short?: string,
): Promise<EspnMatchData | null> {
  if (espncricinfoUrl) {
    const ids = parseEspncricinfoUrl(espncricinfoUrl);
    if (ids) return fetchByIds(ids.seriesId, ids.matchId);
  }

  if (team1Short && team2Short) {
    return fetchByTeamNames(team1Short, team2Short);
  }

  return null;
}
