import "server-only";

import { findCurrentIPLMatch } from "@/lib/cricketdata";

// ---------------------------------------------------------------------------
// ESPNCricinfo consumer API — live score polling for IPL matches.
//
// Why kept: The Cricinfo consumer API is used as a fallback when cricketdata.org
// does not have the match yet (e.g. very early polling, quota exhausted).
// getLiveScore() now tries cricketdata first; this file handles the fallback
// path and the getMatchUpdates() commentary feature.
// ---------------------------------------------------------------------------

const CRICINFO_BASE = "https://hs-consumer-api.espncricinfo.com/v1";
const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.espncricinfo.com",
  Referer: "https://www.espncricinfo.com/",
};

// ---------------------------------------------------------------------------
// Public DTOs
// ---------------------------------------------------------------------------

export interface CricinfoInnings {
  inningsNumber: number;
  battingTeamShort: string;
  runs: number;
  wickets: number;
  overs: string;
  /** True when innings has ended (all out or declared or target exceeded). */
  isComplete: boolean;
}

export interface CricinfoLiveScore {
  /** False when match hasn't started or data unavailable. */
  isLive: boolean;
  /** e.g. "MI need 45 runs from 60 balls" — Cricinfo status string. */
  statusText: string;
  /** e.g. "RCB won the toss and elected to bat" — null if unknown. */
  toss: string | null;
  innings: CricinfoInnings[];
  /** True once the 1st innings is fully complete (use to lock Palat). */
  isFirstInningsComplete: boolean;
  /** True when the match result has been decided. */
  matchEnded: boolean;
  /** Numeric IDs used for future detailed queries; null if match not found. */
  cricinfoMatchId: number | null;
  cricinfoSeriesId: number | null;
}

// ---------------------------------------------------------------------------
// In-process caches — survive across requests in the same server process.
// Keyed by "<team1Short>|<team2Short>" (sorted alphabetically for symmetry).
// ---------------------------------------------------------------------------

interface CachedMatchIds {
  objectId: number;
  seriesId: number;
  cachedAt: number;
}

interface CachedScore {
  data: CricinfoLiveScore;
  cachedAt: number;
}

const matchIdCache = new Map<string, CachedMatchIds>();
const scoreCache = new Map<string, CachedScore>();

const MATCH_ID_TTL_MS = 5 * 60 * 1_000; // 5 min — Cricinfo IDs don't change
const SCORE_TTL_MS = 20_000; // 20 s — fast enough for live updates

function cacheKey(t1: string, t2: string): string {
  return [t1, t2].map((s) => s.toUpperCase()).sort().join("|");
}

// ---------------------------------------------------------------------------
// Helpers — safe property access from unknown API shapes
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
// ESPNCricinfo "current matches" fetch
// ---------------------------------------------------------------------------

async function fetchCurrentMatches(): Promise<unknown> {
  try {
    const res = await fetch(
      `${CRICINFO_BASE}/pages/matches/current?lang=en`,
      {
        headers: REQUEST_HEADERS,
        // Why: disable Next.js data cache so we always get fresh live data
        // from Cricinfo; our own scoreCache provides the server-level TTL.
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Network or JSON parse error — not fatal; caller returns null.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cricinfo detailed match page fetch (commentary + detailed scorecard)
// ---------------------------------------------------------------------------

async function fetchMatchDetails(
  seriesId: number,
  matchId: number,
): Promise<unknown> {
  try {
    const url =
      `${CRICINFO_BASE}/pages/match/details?lang=en&seriesId=${seriesId}&matchId=${matchId}`;
    const res = await fetch(url, {
      headers: REQUEST_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Team-name matching — normalise to lowercase alphanumeric for comparison.
// Why: Cricinfo sometimes uses "RCB" and sometimes "Royal Challengers Bengaluru";
// short names are reliable for IPL.
// ---------------------------------------------------------------------------

export function normShort(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function shortNamesMatch(cricinfoShort: string, ourShort: string): boolean {
  return normShort(cricinfoShort) === normShort(ourShort);
}

// ---------------------------------------------------------------------------
// Parse a single innings object from Cricinfo response
// ---------------------------------------------------------------------------

function parseInnings(
  raw: Record<string, unknown>,
  inningsNumber: number,
): CricinfoInnings {
  // The batting team can live in different shapes depending on API version.
  const teamRaw = obj(raw.team ?? raw.battingTeam);
  const battingTeamShort =
    str(teamRaw.shortName ?? teamRaw.shortDisplayName ?? raw.shortName) ||
    "?";

  const runs = num(raw.runs ?? raw.score);
  const wickets = num(raw.wickets);
  // overs can be a float (18.3) or a string
  const rawOvers = raw.overs ?? raw.currentOvers ?? 0;
  const overs =
    typeof rawOvers === "number"
      ? rawOvers.toFixed(1)
      : str(rawOvers) || "0.0";

  // Why: treat an innings as complete when the API says so, or when wickets
  // have hit 10, or when overs have reached 20 for a T20.
  const isDeclared = bool(raw.isDeclared);
  const allOut = wickets >= 10;
  const oversNum = parseFloat(overs);
  const isComplete =
    bool(raw.isCompleted ?? raw.isClosed) || isDeclared || allOut || oversNum >= 20;

  return { inningsNumber, battingTeamShort, runs, wickets, overs, isComplete };
}

// ---------------------------------------------------------------------------
// Parse one Cricinfo match object into our typed shape
// ---------------------------------------------------------------------------

function parseCricinfoMatch(raw: Record<string, unknown>): {
  team1Short: string;
  team2Short: string;
  objectId: number;
  seriesId: number;
  statusText: string;
  toss: string | null;
  innings: CricinfoInnings[];
  matchEnded: boolean;
} {
  const team1 = obj(raw.team1);
  const team2 = obj(raw.team2);
  const team1Short = str(team1.shortName ?? team1.shortDisplayName);
  const team2Short = str(team2.shortName ?? team2.shortDisplayName);

  const objectId = num(raw.objectId ?? raw.matchId ?? raw.id);
  const seriesObj = obj(raw.series);
  const seriesId = num(raw.seriesId ?? seriesObj.id);

  const statusText = str(raw.statusText ?? raw.status ?? raw.matchStatusText);

  // Toss can come from several possible keys
  const summary = obj(raw.matchSummary ?? raw.summary ?? raw.result);
  const toss =
    str(raw.toss ?? summary.toss ?? raw.tossInfo) || null;

  // Live innings data
  const liveDetails = obj(raw.liveDetails ?? raw.liveData ?? raw.live);
  const scorecardObj = obj(raw.scorecard);
  const inningsArr = arr(
    raw.innings ??
    liveDetails.innings ??
    scorecardObj.innings ??
    [],
  );

  const innings: CricinfoInnings[] = inningsArr
    .slice(0, 2)
    .map((inn, idx) => parseInnings(obj(inn), idx + 1));

  const matchEnded =
    bool(summary.matchEnded ?? raw.matchEnded) ||
    str(raw.status).toLowerCase().includes("won") ||
    str(statusText).toLowerCase().includes("won");

  return {
    team1Short,
    team2Short,
    objectId,
    seriesId,
    statusText,
    toss,
    innings,
    matchEnded,
  };
}

type ParsedCricinfoMatch = ReturnType<typeof parseCricinfoMatch>;

interface CricinfoMatchFindResult {
  parsed: ParsedCricinfoMatch;
  raw: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Locate a fixture in Cricinfo "current matches" — shared by score + IDs.
// ---------------------------------------------------------------------------

function extractMatchesArrayFromPayload(root: unknown): unknown[] {
  const o = obj(root as Record<string, unknown>);
  const content = obj(o.content);
  return arr(
    content.matches ?? o.matches ?? content.currentMatches ?? [],
  );
}

function findTeamMatchInList(
  matchesRaw: unknown[],
  team1Short: string,
  team2Short: string,
): CricinfoMatchFindResult | null {
  for (const m of matchesRaw) {
    const raw = obj(m);
    const parsed = parseCricinfoMatch(raw);
    const t1Matches =
      shortNamesMatch(parsed.team1Short, team1Short) ||
      shortNamesMatch(parsed.team1Short, team2Short);
    const t2Matches =
      shortNamesMatch(parsed.team2Short, team1Short) ||
      shortNamesMatch(parsed.team2Short, team2Short);
    if (t1Matches && t2Matches) {
      return { parsed, raw };
    }
  }
  return null;
}

/**
 * Fetches Cricinfo current-matches JSON and returns the row for this pair.
 * Why: one shared lookup powers score fallback, ID caching for commentary,
 * and optional enrichment when cricketdata.org supplies the score.
 */
async function findCricinfoMatchForTeams(
  team1Short: string,
  team2Short: string,
): Promise<CricinfoMatchFindResult | null> {
  const raw = await fetchCurrentMatches();
  if (!raw) return null;
  const matchesRaw = extractMatchesArrayFromPayload(raw);
  return findTeamMatchInList(matchesRaw, team1Short, team2Short);
}

/**
 * Derive whether the fixture is actively in progress (vs scheduled/completed).
 * Why: the fallback path previously set isLive: true for every list hit, which
 * mis-labelled upcoming or finished games that still appear in the feed.
 */
function inferIsLiveFromCricinfoRaw(
  raw: Record<string, unknown>,
  parsed: ParsedCricinfoMatch,
): boolean {
  if (parsed.matchEnded) return false;

  const state = str(raw.state ?? raw.matchState ?? "").toLowerCase();
  if (state === "post" || state === "complete" || state === "finished") {
    return false;
  }
  if (state === "live" || state === "in") {
    return true;
  }

  const combined = `${parsed.statusText} ${str(raw.status)} ${str(raw.statusText)}`.toLowerCase();
  if (/\b(abandoned|won by|match tied|no result)\b/iu.test(combined)) {
    return false;
  }
  if (combined.includes("scheduled") && !combined.includes("live")) {
    return false;
  }

  if (parsed.innings.some((inn) => !inn.isComplete)) return true;

  if (parsed.innings.length === 0) {
    return (
      state === "live" ||
      state === "in" ||
      combined.includes("opt to") ||
      combined.includes("toss")
    );
  }

  return !parsed.innings.every((inn) => inn.isComplete);
}

/**
 * Best-effort Cricinfo ID cache when commentary runs but getLiveScore returned
 * a cached cricketdata payload (IDs were never resolved in that process).
 */
async function ensureCricinfoIdsCached(
  team1Short: string,
  team2Short: string,
): Promise<void> {
  const key = cacheKey(team1Short, team2Short);
  const now = Date.now();
  const existing = matchIdCache.get(key);
  if (existing && now - existing.cachedAt < MATCH_ID_TTL_MS) return;

  const found = await findCricinfoMatchForTeams(team1Short, team2Short);
  if (!found || !found.parsed.objectId || !found.parsed.seriesId) return;

  matchIdCache.set(key, {
    objectId: found.parsed.objectId,
    seriesId: found.parsed.seriesId,
    cachedAt: now,
  });
}

// ---------------------------------------------------------------------------
// Main export — find and return live score for a match by team short names
// ---------------------------------------------------------------------------

export async function getLiveScore(
  team1Short: string,
  team2Short: string,
): Promise<CricinfoLiveScore> {
  const key = cacheKey(team1Short, team2Short);
  const now = Date.now();

  // Return cached score if still fresh.
  const cached = scoreCache.get(key);
  if (cached && now - cached.cachedAt < SCORE_TTL_MS) {
    return cached.data;
  }

  const notLive: CricinfoLiveScore = {
    isLive: false,
    statusText: "",
    toss: null,
    innings: [],
    isFirstInningsComplete: false,
    matchEnded: false,
    cricinfoMatchId: null,
    cricinfoSeriesId: null,
  };

  // ---------------------------------------------------------------------------
  // Primary path: cricketdata.org API (authenticated, structured, no scraping).
  //
  // Why prefer this: Vercel server IPs are sometimes blocked by the Cricinfo
  // Akamai CDN. The cricketdata.org API is accessed via an API key and is
  // immune to IP-level blocking, making it the more reliable source.
  // ---------------------------------------------------------------------------
  const apiState = await findCurrentIPLMatch(team1Short, team2Short);

  if (apiState) {
    // Why: resolve numeric Cricinfo IDs in parallel so getMatchUpdates() can
    // load commentary even though cricketdata uses its own UUID match ids.
    const cricinfoRow = await findCricinfoMatchForTeams(team1Short, team2Short);
    if (cricinfoRow && cricinfoRow.parsed.objectId && cricinfoRow.parsed.seriesId) {
      matchIdCache.set(key, {
        objectId: cricinfoRow.parsed.objectId,
        seriesId: cricinfoRow.parsed.seriesId,
        cachedAt: now,
      });
    }

    const innings: CricinfoInnings[] = apiState.innings.map((inn) => ({
      inningsNumber: inn.inningsNumber,
      // Why rename: CricinfoInnings uses battingTeamShort; CricketDataInnings
      // uses battingTeamShortName. Map explicitly to keep public shape stable.
      battingTeamShort: inn.battingTeamShortName,
      runs: inn.runs,
      wickets: inn.wickets,
      overs: inn.overs,
      isComplete: inn.isComplete,
    }));

    const isFirstInningsComplete =
      innings.length >= 2 ||
      (innings.length === 1 && innings[0].isComplete);

    const result: CricinfoLiveScore = {
      isLive: apiState.isLive,
      statusText: apiState.statusText,
      toss: apiState.toss,
      innings,
      isFirstInningsComplete,
      matchEnded: apiState.matchEnded,
      cricinfoMatchId: cricinfoRow?.parsed.objectId ?? null,
      cricinfoSeriesId: cricinfoRow?.parsed.seriesId ?? null,
    };

    scoreCache.set(key, { data: result, cachedAt: now });
    return result;
  }

  // ---------------------------------------------------------------------------
  // Fallback: ESPNCricinfo consumer API (unauthenticated, may be IP-blocked).
  // ---------------------------------------------------------------------------
  const found = await findCricinfoMatchForTeams(team1Short, team2Short);
  if (!found) {
    scoreCache.set(key, { data: notLive, cachedAt: now });
    return notLive;
  }

  const { parsed, raw } = found;

  // Cache Cricinfo IDs so getMatchUpdates() can fetch commentary without
  // re-searching the full current-matches list.
  matchIdCache.set(key, {
    objectId: parsed.objectId,
    seriesId: parsed.seriesId,
    cachedAt: now,
  });

  const isFirstInningsComplete =
    parsed.innings.length >= 2 ||
    (parsed.innings.length === 1 && parsed.innings[0].isComplete);

  const result: CricinfoLiveScore = {
    isLive: inferIsLiveFromCricinfoRaw(raw, parsed),
    statusText: parsed.statusText,
    toss: parsed.toss,
    innings: parsed.innings,
    isFirstInningsComplete,
    matchEnded: parsed.matchEnded,
    cricinfoMatchId: parsed.objectId || null,
    cricinfoSeriesId: parsed.seriesId || null,
  };

  scoreCache.set(key, { data: result, cachedAt: now });
  return result;
}

// ---------------------------------------------------------------------------
// Detailed match updates — commentary highlights (toss, wickets, milestones)
// ---------------------------------------------------------------------------

export interface MatchUpdate {
  type: "toss" | "wicket" | "milestone" | "innings_end" | "info";
  text: string;
}

/**
 * Fetch recent key match events from Cricinfo's detailed endpoint.
 * Returns up to `limit` highlights. Never throws — returns [] on error.
 */
export async function getMatchUpdates(
  team1Short: string,
  team2Short: string,
  limit = 5,
): Promise<MatchUpdate[]> {
  const key = cacheKey(team1Short, team2Short);
  const now = Date.now();

  // Ensure we have Cricinfo IDs; if not found in current matches, bail.
  let ids = matchIdCache.get(key);
  if (!ids || now - ids.cachedAt > MATCH_ID_CACHE_TTL_MS) {
    // Piggyback on getLiveScore to populate the cache
    await getLiveScore(team1Short, team2Short);
    ids = matchIdCache.get(key);
  }
  // Why: a hot scoreCache hit skips getLiveScore's network path, so IDs may
  // still be missing — run a dedicated ID lookup for commentary.
  if (!ids || !ids.objectId || !ids.seriesId) {
    await ensureCricinfoIdsCached(team1Short, team2Short);
    ids = matchIdCache.get(key);
  }
  if (!ids || !ids.objectId || !ids.seriesId) return [];

  const raw = await fetchMatchDetails(ids.seriesId, ids.objectId);
  if (!raw) return [];

  const updates: MatchUpdate[] = [];
  const data = obj((raw as Record<string, unknown>).content ?? raw);

  // Pull toss from matchSummary
  const summary = obj(data.matchSummary ?? data.summary ?? {});
  const tossText = str(summary.toss ?? data.toss ?? "");
  if (tossText) {
    updates.push({ type: "toss", text: tossText });
  }

  // Pull innings end messages
  const inningsArr = arr(
    data.innings ??
    obj(data.scorecard).innings ??
    [],
  );
  for (const inn of inningsArr) {
    const parsed = obj(inn);
    const score = `${num(parsed.runs)}/${num(parsed.wickets)} (${parsed.overs ?? "0.0"} ov)`;
    const team = str(obj(parsed.team ?? parsed.battingTeam).shortName);
    if (team) {
      updates.push({
        type: "innings_end",
        text: `${team}: ${score}`,
      });
    }
  }

  // Pull recent milestones from commentary (wickets, fifties, centuries)
  const commentaryArr = arr(data.commentary ?? data.comments ?? []);
  for (const item of commentaryArr.slice(0, 20)) {
    const c = obj(item);
    const commentItems = arr(c.commentTextItems);
    const firstCommentItem = obj(commentItems[0]);
    const text = str(firstCommentItem.text ?? c.displayText ?? c.text ?? "");
    if (!text) continue;

    const lower = text.toLowerCase();
    if (lower.includes("wicket") || lower.includes("out")) {
      updates.push({ type: "wicket", text: text.slice(0, 120) });
    } else if (
      lower.includes("fifty") ||
      lower.includes("hundred") ||
      lower.includes("century") ||
      lower.includes("milestone")
    ) {
      updates.push({ type: "milestone", text: text.slice(0, 120) });
    }

    if (updates.length >= limit + 1) break; // +1 accounts for toss entry
  }

  return updates.slice(0, limit);
}

const MATCH_ID_CACHE_TTL_MS = MATCH_ID_TTL_MS;
