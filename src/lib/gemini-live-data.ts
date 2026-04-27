import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { MatchResult, MatchStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/scoring";

// ---------------------------------------------------------------------------
// Gemini live IPL data — login-triggered match sync + 30-min cache.
//
// Why: Replaces cron + ESPNCricinfo; gemini.ts trivia stays separate. Uses
// REST + Google Search like gemini.ts. Required env: GEMINI_API_KEY
// ---------------------------------------------------------------------------

// Why: gemini-2.0-flash was deprecated; 2.5-flash is the current replacement.
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const LIVE_DATA_TTL_MS = 30 * 60 * 1_000; // 30 minutes

// ---------------------------------------------------------------------------
// Public DTOs
// ---------------------------------------------------------------------------

export interface GeminiMatchLiveData {
  matchNumber: number;
  team1ShortName: string;
  team2ShortName: string;
  matchOngoing: boolean;
  matchStarted: boolean;
  matchScore: string;
  isFirstInnings: boolean;
  firstInningsComplete: boolean;
  tossResult: string | null;
  winningTeamShortName: string | null;
  resultText: string | null;
}

export interface GeminiStandingsRow {
  teamShortName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  noResults: number;
  netRunRate: number;
  points: number;
  rank: number;
}

export interface GeminiLiveDataResponse {
  matches: GeminiMatchLiveData[];
  standings: GeminiStandingsRow[];
  fetchedAt: string;
}

const GeminiMatchLiveDataSchema = z.object({
  matchNumber: z.number(),
  team1ShortName: z.string(),
  team2ShortName: z.string(),
  matchOngoing: z.boolean(),
  matchStarted: z.boolean(),
  matchScore: z.string(),
  isFirstInnings: z.boolean(),
  firstInningsComplete: z.boolean(),
  tossResult: z.string().nullable(),
  winningTeamShortName: z.string().nullable(),
  resultText: z.string().nullable(),
});

const GeminiStandingsRowSchema = z.object({
  teamShortName: z.string(),
  matchesPlayed: z.number(),
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  noResults: z.number(),
  netRunRate: z.number(),
  points: z.number(),
  rank: z.number(),
});

export const GeminiLiveDataResponseSchema = z.object({
  matches: z.array(GeminiMatchLiveDataSchema),
  standings: z.array(GeminiStandingsRowSchema),
  fetchedAt: z.string(),
});

/**
 * Why: MatchSyncCache stores `Json` — validate at the boundary when reading
 * from the database so bad rows never reach live-score.
 */
export function tryParseGeminiLiveDataResponse(
  payload: unknown,
): GeminiLiveDataResponse | null {
  const parsed = GeminiLiveDataResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

interface CacheEntry {
  data: GeminiLiveDataResponse;
  cachedAt: number;
}

const liveDataCache = new Map<string, CacheEntry>();

// Why: avoid importing cricinfo (cricinfo imports this module).
function normShort(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function extractJsonObject(text: string): unknown {
  const stripped = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function revalidateAfterMatchUpdate(leagueId: string, matchId: string): void {
  revalidatePath(`/admin/league/${leagueId}`);
  revalidatePath(`/admin/league/${leagueId}/groups`);
  revalidatePath(`/admin/league/${leagueId}/players`);
  revalidatePath(`/group/[groupId]/match/${matchId}`, "page");
  revalidatePath(`/group/[groupId]`, "page");
}

export async function resolveLeagueId(
  explicitLeagueId: string | undefined,
): Promise<string | null> {
  if (explicitLeagueId) {
    const found = await prisma.league.findFirst({
      where: { id: explicitLeagueId },
      select: { id: true },
    });
    return found?.id ?? null;
  }
  const active = await prisma.league.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return active?.id ?? null;
}

function buildPrompt(
  leagueName: string,
  seasonYear: number,
  scheduleLines: string[],
): string {
  const schedule = scheduleLines.length
    ? scheduleLines.join("\n")
    : "(use official IPL fixtures for the same season year.)";

  return `You are a data extraction assistant for the Indian Premier League.

Target league: **${leagueName}** (${seasonYear}).
Official match list (align match numbers and teams to this list only):
${schedule}

Use Google Search for current scorelines, toss, match status, and the full season points table.

Return **only** valid JSON (no markdown) in this exact shape:
{
  "matches": [
    {
      "matchNumber": <number>,
      "team1ShortName": "<e.g. MI>",
      "team2ShortName": "<e.g. CSK>",
      "matchOngoing": <boolean>,
      "matchStarted": <boolean>,
      "matchScore": "<one line or empty string>",
      "isFirstInnings": <boolean>,
      "firstInningsComplete": <boolean>,
      "tossResult": <string or null>,
      "winningTeamShortName": <string or null>,
      "resultText": <string or null>
    }
  ],
  "standings": [
    {
      "teamShortName": "<abbrev>",
      "matchesPlayed": <number>,
      "wins": <number>,
      "losses": <number>,
      "draws": <number>,
      "noResults": <number>,
      "netRunRate": <number>,
      "points": <number>,
      "rank": <number>
    }
  ],
  "fetchedAt": "<ISO-8601 UTC>"
}`;
}

async function getScheduleLines(leagueId: string): Promise<string[]> {
  const rows = await prisma.match.findMany({
    where: { leagueId },
    orderBy: { matchNumber: "asc" },
    select: {
      matchNumber: true,
      team1: { select: { shortName: true } },
      team2: { select: { shortName: true } },
    },
  });
  return rows.map(
    (r) =>
      `Match ${r.matchNumber}: ${r.team1.shortName} vs ${r.team2.shortName}`,
  );
}

/**
 * Why: one place for POST + body parsing so full-response and single-row prompts
 * stay consistent and error handling is not copy-pasted. Returns null on
 * transport/auth errors; on success, the model’s text (possibly empty string).
 */
async function fetchGeminiResponseText(
  prompt: string,
  maxOutputTokens: number,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Why: surface misconfiguration immediately instead of silently returning null.
    console.error("[gemini-live-data] GEMINI_API_KEY is not set");
    return null;
  }

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 0.2, maxOutputTokens },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    // Why: network errors (DNS, timeout) should be visible in dev logs.
    console.error("[gemini-live-data] Gemini API fetch failed:", err);
    return null;
  }

  if (!res.ok) {
    // Why: surface HTTP-level failures (quota, auth, server error) with status + body.
    const errBody = await res.text().catch(() => "(unreadable)");
    console.error(
      `[gemini-live-data] Gemini API error ${res.status}: ${errBody.slice(0, 500)}`,
    );
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const firstCandidate =
    candidates[0] !== null && typeof candidates[0] === "object"
      ? (candidates[0] as Record<string, unknown>)
      : {};
  const content =
    firstCandidate.content !== null &&
    typeof firstCandidate.content === "object"
      ? (firstCandidate.content as Record<string, unknown>)
      : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const firstPart =
    parts[0] !== null && typeof parts[0] === "object"
      ? (parts[0] as Record<string, unknown>)
      : {};
  return typeof firstPart.text === "string" ? firstPart.text : "";
}

/**
 * Run Gemini for a fully-built prompt. Exported so match-details (scoped schedule)
 * can share the same HTTP + JSON contract as the admin full sync.
 * Why: avoids duplicating fetch, parsing, and schema validation in another module.
 */
export async function callGeminiWithPrompt(
  prompt: string,
): Promise<GeminiLiveDataResponse | null> {
  const text = await fetchGeminiResponseText(prompt, 8192);
  if (text === null) {
    return null;
  }

  const raw = extractJsonObject(text);
  if (raw === null) {
    // Why: Gemini returned text that isn't parseable JSON — log it to debug prompt issues.
    console.error(
      "[gemini-live-data] Could not extract JSON from Gemini response:",
      text.slice(0, 500),
    );
    return null;
  }

  const parsed = GeminiLiveDataResponseSchema.safeParse(raw);
  if (!parsed.success) {
    // Why: JSON parsed but doesn't match expected schema — log validation errors.
    console.error(
      "[gemini-live-data] Schema validation failed:",
      parsed.error.issues,
    );
    return null;
  }

  const fetchedAt =
    parsed.data.fetchedAt.length > 0
      ? parsed.data.fetchedAt
      : new Date().toISOString();

  console.info(
    `[gemini-live-data] Fetched ${parsed.data.matches.length} matches, ${parsed.data.standings.length} standings rows`,
  );
  return { ...parsed.data, fetchedAt };
}

/**
 * Why: live-match-sync asks for one match object only; same fields as a row in
 * `callGeminiWithPrompt`’s `matches` array, validated in isolation.
 */
export async function callGeminiWithMatchPrompt(
  prompt: string,
): Promise<GeminiMatchLiveData | null> {
  const text = await fetchGeminiResponseText(prompt, 4096);
  if (text === null) {
    return null;
  }
  const raw = extractJsonObject(text);
  if (raw === null) {
    console.error(
      "[gemini-live-data] Could not extract JSON (single match):",
      text.slice(0, 500),
    );
    return null;
  }
  const parsed = GeminiMatchLiveDataSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      "[gemini-live-data] Single-match schema validation failed:",
      parsed.error.issues,
    );
    return null;
  }
  return parsed.data;
}

async function callGemini(
  leagueId: string,
): Promise<GeminiLiveDataResponse | null> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { name: true, seasonYear: true },
  });
  if (!league) {
    // Why: admin sync and poll paths require a real league row.
    console.error(`[gemini-live-data] League not found: ${leagueId}`);
    return null;
  }

  const scheduleLines = await getScheduleLines(leagueId);
  const prompt = buildPrompt(league.name, league.seasonYear, scheduleLines);
  return callGeminiWithPrompt(prompt);
}

// ---------------------------------------------------------------------------
// DB — match lifecycle + scoring (parity with former match-poller)
// ---------------------------------------------------------------------------

export type PollableMatch = {
  id: string;
  leagueId: string;
  matchNumber: number;
  status: MatchStatus;
  firstInningsCompleteTimeUtc: Date | null;
  /** Why: gate LLM-driven status on the fixture clock so bad search results cannot mark a match live hours before start. */
  startTimeUtc: Date;
  team1: { id: string; shortName: string };
  team2: { id: string; shortName: string };
};

type Phase =
  | "not_started"
  | "first_innings"
  | "second_innings"
  | "completed"
  | "abandoned";

// Why: allow sync from ~toss onward; blocks “second innings” hallucinations earlier in the day.
const PRE_START_LIVE_LEEWAY_MS = 60 * 60 * 1_000;

function derivePhase(g: GeminiMatchLiveData): Phase {
  const resultLower = (g.resultText ?? "").toLowerCase();
  if (resultLower.includes("abandon") || resultLower.includes("no result")) {
    return "abandoned";
  }
  if (g.winningTeamShortName && !g.matchOngoing) {
    return "completed";
  }
  if (
    g.matchStarted &&
    !g.matchOngoing &&
    (resultLower.includes("tie") ||
      resultLower.includes("tied") ||
      resultLower.includes("draw"))
  ) {
    return "completed";
  }
  if (!g.matchStarted) {
    return "not_started";
  }
  if (g.matchOngoing && g.isFirstInnings && !g.firstInningsComplete) {
    return "first_innings";
  }
  if (g.matchOngoing) {
    return "second_innings";
  }
  if (!g.matchOngoing && g.winningTeamShortName) {
    return "completed";
  }
  return "not_started";
}

function teamsAlign(m: PollableMatch, g: GeminiMatchLiveData): boolean {
  const a = [normShort(m.team1.shortName), normShort(m.team2.shortName)]
    .sort()
    .join("");
  const b = [normShort(g.team1ShortName), normShort(g.team2ShortName)]
    .sort()
    .join("");
  return a === b;
}

function resolveCompletedResult(
  m: PollableMatch,
  g: GeminiMatchLiveData,
): { result: MatchResult; winnerId: string | null } | null {
  const w = (g.winningTeamShortName ?? "").trim();
  if (w) {
    const n = normShort(w);
    if (n === normShort(m.team1.shortName)) {
      return { result: "team1_win", winnerId: m.team1.id };
    }
    if (n === normShort(m.team2.shortName)) {
      return { result: "team2_win", winnerId: m.team2.id };
    }
  }
  const text = (g.resultText ?? "").toLowerCase();
  if (text.includes("abandon") || text.includes("no result")) {
    return { result: "abandoned", winnerId: null };
  }
  if (text.includes("tie") || text.includes("tied") || text.includes("draw")) {
    return { result: "draw", winnerId: null };
  }
  return null;
}

async function upsertStandingsFromRows(
  leagueId: string,
  rows: GeminiStandingsRow[],
): Promise<void> {
  const leagueTeams = await prisma.leagueTeam.findMany({
    where: { leagueId },
    select: { teamId: true, team: { select: { shortName: true } } },
  });
  const teamMap = new Map<string, string>();
  for (const lt of leagueTeams) {
    teamMap.set(normShort(lt.team.shortName), lt.teamId);
  }

  for (const row of rows) {
    const teamId = teamMap.get(normShort(row.teamShortName));
    if (!teamId) continue;

    await prisma.teamPointsTable.upsert({
      where: { leagueId_teamId: { leagueId, teamId } },
      update: {
        matchesPlayed: row.matchesPlayed,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        noResults: row.noResults,
        netRunRate: row.netRunRate,
        points: row.points,
        rank: row.rank,
      },
      create: {
        leagueId,
        teamId,
        matchesPlayed: row.matchesPlayed,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        noResults: row.noResults,
        netRunRate: row.netRunRate,
        points: row.points,
        rank: row.rank,
      },
    });
  }
}

export async function processOneMatch(
  m: PollableMatch,
  g: GeminiMatchLiveData,
): Promise<void> {
  if (!teamsAlign(m, g) || m.matchNumber !== g.matchNumber) {
    return;
  }

  if (m.status === "completed" || m.status === "abandoned") {
    return;
  }

  const now = new Date();
  const phase = derivePhase(g);
  const scheduleAllowsLive =
    now.getTime() >= m.startTimeUtc.getTime() - PRE_START_LIVE_LEEWAY_MS;
  const scheduledStartInFuture = now < m.startTimeUtc;

  // Why: more than an hour before start, a live* row can only be bad data; drop back to upcoming.
  if (!scheduleAllowsLive) {
    if (m.status === "live_first_innings" || m.status === "live_second_innings") {
      await prisma.match.update({
        where: { id: m.id },
        data: { status: "upcoming", firstInningsCompleteTimeUtc: null },
      });
      revalidateAfterMatchUpdate(m.leagueId, m.id);
    }
    return;
  }

  // Why: inside the pre-start window, still reset if the clock has not passed scheduled start and the model says not started.
  if (
    phase === "not_started" &&
    scheduledStartInFuture &&
    (m.status === "live_first_innings" || m.status === "live_second_innings")
  ) {
    await prisma.match.update({
      where: { id: m.id },
      data: { status: "upcoming", firstInningsCompleteTimeUtc: null },
    });
    revalidateAfterMatchUpdate(m.leagueId, m.id);
    return;
  }

  if (phase === "not_started") {
    return;
  }

  if (phase === "first_innings" && m.status === "upcoming") {
    await prisma.match.update({
      where: { id: m.id },
      data: { status: "live_first_innings" },
    });
    revalidateAfterMatchUpdate(m.leagueId, m.id);
    return;
  }

  // Why: do not let the model jump straight to second innings (common when isFirstInnings is wrong).
  if (phase === "second_innings" && m.status === "live_first_innings") {
    await prisma.match.update({
      where: { id: m.id },
      data: {
        status: "live_second_innings",
        firstInningsCompleteTimeUtc:
          m.firstInningsCompleteTimeUtc ?? new Date(),
      },
    });
    revalidateAfterMatchUpdate(m.leagueId, m.id);
    return;
  }

  if (phase === "abandoned") {
    await prisma.match.update({
      where: { id: m.id },
      data: { status: "abandoned", result: "abandoned", winnerId: null },
    });
    await scoreMatch(m.id, "abandoned", null);
    revalidateAfterMatchUpdate(m.leagueId, m.id);
    return;
  }

  if (phase === "completed") {
    const resolved = resolveCompletedResult(m, g);
    if (!resolved) {
      return;
    }
    if (resolved.result === "abandoned") {
      await prisma.match.update({
        where: { id: m.id },
        data: { status: "abandoned", result: "abandoned", winnerId: null },
      });
      await scoreMatch(m.id, "abandoned", null);
      revalidateAfterMatchUpdate(m.leagueId, m.id);
      return;
    }
    if (resolved.result === "draw") {
      await prisma.match.update({
        where: { id: m.id },
        data: {
          status: "completed",
          result: "draw",
          winnerId: null,
          firstInningsCompleteTimeUtc:
            m.firstInningsCompleteTimeUtc ?? new Date(),
        },
      });
      await scoreMatch(m.id, "draw", null);
      revalidateAfterMatchUpdate(m.leagueId, m.id);
      return;
    }
    await prisma.match.update({
      where: { id: m.id },
      data: {
        status: "completed",
        result: resolved.result,
        winnerId: resolved.winnerId,
        firstInningsCompleteTimeUtc:
          m.firstInningsCompleteTimeUtc ?? new Date(),
      },
    });
    await scoreMatch(m.id, resolved.result, resolved.winnerId);
    revalidateAfterMatchUpdate(m.leagueId, m.id);
  }
}

/**
 * Why: Shared by full admin sync, login-scoped details sync, and per-match live sync
 * so match status and standings updates stay consistent everywhere.
 */
export async function syncResponseToDatabase(
  leagueId: string,
  data: GeminiLiveDataResponse,
): Promise<void> {
  const matches: PollableMatch[] = await prisma.match.findMany({
    where: { leagueId },
    orderBy: { matchNumber: "asc" },
    select: {
      id: true,
      leagueId: true,
      matchNumber: true,
      status: true,
      firstInningsCompleteTimeUtc: true,
      startTimeUtc: true,
      team1: { select: { id: true, shortName: true } },
      team2: { select: { id: true, shortName: true } },
    },
  });

  for (const g of data.matches) {
    const m = matches.find(
      (row) => row.matchNumber === g.matchNumber && teamsAlign(row, g),
    );
    if (m) {
      await processOneMatch(m, g);
    }
  }

  if (data.standings.length > 0) {
    await upsertStandingsFromRows(leagueId, data.standings);
    revalidatePath(`/group/[groupId]/leaderboard`, "page");
    revalidatePath(`/group/[groupId]`, "page");
  }
}

async function fetchAndSync(
  leagueId: string,
): Promise<GeminiLiveDataResponse | null> {
  console.info(`[gemini-live-data] fetchAndSync starting for league ${leagueId}`);
  const fresh = await callGemini(leagueId);
  if (!fresh) {
    console.error(`[gemini-live-data] callGemini returned null for league ${leagueId}`);
    return null;
  }
  await syncResponseToDatabase(leagueId, fresh);
  liveDataCache.set(leagueId, { data: fresh, cachedAt: Date.now() });
  console.info(`[gemini-live-data] fetchAndSync complete — cached ${fresh.matches.length} matches`);
  return fresh;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Why: allows manual cache invalidation without a network round-trip.
 */
export function bustLiveDataCache(): void {
  liveDataCache.clear();
}

export async function bustAndRefreshLiveData(
  leagueId?: string,
): Promise<GeminiLiveDataResponse | null> {
  const id = await resolveLeagueId(leagueId);
  if (!id) {
    return null;
  }
  // Why: any auth event should drop all cached league snapshots so concurrent
  // readers never see another league’s stale payload after a different user signs in.
  bustLiveDataCache();
  return fetchAndSync(id);
}

export async function getCachedLiveData(
  leagueId: string,
): Promise<GeminiLiveDataResponse | null> {
  const id = await resolveLeagueId(leagueId);
  if (!id) {
    return null;
  }
  const entry = liveDataCache.get(id);
  if (entry && Date.now() - entry.cachedAt < LIVE_DATA_TTL_MS) {
    return entry.data;
  }
  return fetchAndSync(id);
}

/**
 * Map a schedule row to one Gemini response row; used by cricinfo live-score.
 * Why: shared matching rules (match number + both short names) in one place.
 */
export function findGeminiRowForMatch(
  response: GeminiLiveDataResponse,
  matchNumber: number,
  team1Short: string,
  team2Short: string,
): GeminiMatchLiveData | null {
  const a = [normShort(team1Short), normShort(team2Short)].sort().join("");
  for (const g of response.matches) {
    if (g.matchNumber !== matchNumber) {
      continue;
    }
    const b = [normShort(g.team1ShortName), normShort(g.team2ShortName)]
      .sort()
      .join("");
    if (a === b) {
      return g;
    }
  }
  return null;
}
