import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { MatchResult, MatchStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/scoring";

// ---------------------------------------------------------------------------
// Claude live IPL data — login-triggered match sync + 30-min cache.
//
// Why: Replaces Gemini-based sync with Claude (Anthropic). Uses Claude
// Messages API for structured data extraction. Required env: ANTHROPIC_API_KEY
//
// Note: Unlike Gemini, Claude does not have built-in Google Search grounding.
// Live data extraction relies on Claude's training knowledge. For truly
// real-time scores during live matches, consider supplementing with a
// dedicated cricket data API.
// ---------------------------------------------------------------------------

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const LIVE_DATA_TTL_MS = 30 * 60 * 1_000; // 30 minutes

// ---------------------------------------------------------------------------
// Public DTOs — kept identical so downstream consumers don't need changes.
// ---------------------------------------------------------------------------

export interface ClaudeMatchLiveData {
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

export interface ClaudeStandingsRow {
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

export interface ClaudeLiveDataResponse {
  matches: ClaudeMatchLiveData[];
  standings: ClaudeStandingsRow[];
  fetchedAt: string;
}

const ClaudeMatchLiveDataSchema = z.object({
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

const ClaudeStandingsRowSchema = z.object({
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

const ClaudeLiveDataResponseSchema = z.object({
  matches: z.array(ClaudeMatchLiveDataSchema),
  standings: z.array(ClaudeStandingsRowSchema),
  fetchedAt: z.string(),
});

interface CacheEntry {
  data: ClaudeLiveDataResponse;
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

async function resolveLeagueId(
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

Based on your knowledge of IPL ${seasonYear} results and standings, provide the current scorelines, toss results, match statuses, and the full season points table.

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

async function callClaude(leagueId: string): Promise<ClaudeLiveDataResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Why: surface misconfiguration immediately instead of silently returning null.
    console.error("[claude-live-data] ANTHROPIC_API_KEY is not set");
    return null;
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { name: true, seasonYear: true },
  });
  if (!league) {
    console.error(`[claude-live-data] League not found: ${leagueId}`);
    return null;
  }

  const scheduleLines = await getScheduleLines(leagueId);
  const prompt = buildPrompt(league.name, league.seasonYear, scheduleLines);

  // Why: Claude uses header-based auth and a different request body structure than Gemini.
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  };

  let res: Response;
  try {
    res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    // Why: network errors (DNS, timeout) should be visible in dev logs.
    console.error("[claude-live-data] Claude API fetch failed:", err);
    return null;
  }

  if (!res.ok) {
    // Why: surface HTTP-level failures (quota, auth, server error) with status + body.
    const errBody = await res.text().catch(() => "(unreadable)");
    console.error(
      `[claude-live-data] Claude API error ${res.status}: ${errBody.slice(0, 500)}`,
    );
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;

  // Why: Claude response shape: { content: [{ type: "text", text: "..." }] }
  const content = Array.isArray(data.content) ? data.content : [];
  const firstBlock =
    content[0] !== null && typeof content[0] === "object"
      ? (content[0] as Record<string, unknown>)
      : {};
  const text = typeof firstBlock.text === "string" ? firstBlock.text : "";

  const raw = extractJsonObject(text);
  if (raw === null) {
    // Why: Claude returned text that isn't parseable JSON — log it to debug prompt issues.
    console.error(
      "[claude-live-data] Could not extract JSON from Claude response:",
      text.slice(0, 500),
    );
    return null;
  }

  const parsed = ClaudeLiveDataResponseSchema.safeParse(raw);
  if (!parsed.success) {
    // Why: JSON parsed but doesn't match expected schema — log validation errors.
    console.error(
      "[claude-live-data] Schema validation failed:",
      parsed.error.issues,
    );
    return null;
  }

  const fetchedAt =
    parsed.data.fetchedAt.length > 0
      ? parsed.data.fetchedAt
      : new Date().toISOString();

  console.info(
    `[claude-live-data] Fetched ${parsed.data.matches.length} matches, ${parsed.data.standings.length} standings rows`,
  );
  return { ...parsed.data, fetchedAt };
}

// ---------------------------------------------------------------------------
// DB — match lifecycle + scoring (parity with former match-poller)
// ---------------------------------------------------------------------------

type PollableMatch = {
  id: string;
  leagueId: string;
  matchNumber: number;
  status: MatchStatus;
  firstInningsCompleteTimeUtc: Date | null;
  team1: { id: string; shortName: string };
  team2: { id: string; shortName: string };
};

type Phase =
  | "not_started"
  | "first_innings"
  | "second_innings"
  | "completed"
  | "abandoned";

function derivePhase(g: ClaudeMatchLiveData): Phase {
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

function teamsAlign(m: PollableMatch, g: ClaudeMatchLiveData): boolean {
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
  g: ClaudeMatchLiveData,
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
  rows: ClaudeStandingsRow[],
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

async function processOneMatch(
  m: PollableMatch,
  g: ClaudeMatchLiveData,
): Promise<void> {
  if (!teamsAlign(m, g) || m.matchNumber !== g.matchNumber) {
    return;
  }

  if (m.status === "completed" || m.status === "abandoned") {
    return;
  }

  const phase = derivePhase(g);

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

  if (
    phase === "second_innings" &&
    (m.status === "upcoming" || m.status === "live_first_innings")
  ) {
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

async function syncResponseToDatabase(
  leagueId: string,
  data: ClaudeLiveDataResponse,
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
): Promise<ClaudeLiveDataResponse | null> {
  console.info(`[claude-live-data] fetchAndSync starting for league ${leagueId}`);
  const fresh = await callClaude(leagueId);
  if (!fresh) {
    console.error(`[claude-live-data] callClaude returned null for league ${leagueId}`);
    return null;
  }
  await syncResponseToDatabase(leagueId, fresh);
  liveDataCache.set(leagueId, { data: fresh, cachedAt: Date.now() });
  console.info(`[claude-live-data] fetchAndSync complete — cached ${fresh.matches.length} matches`);
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
): Promise<ClaudeLiveDataResponse | null> {
  const id = await resolveLeagueId(leagueId);
  if (!id) {
    return null;
  }
  // Why: any auth event should drop all cached league snapshots so concurrent
  // readers never see another league's stale payload after a different user signs in.
  bustLiveDataCache();
  return fetchAndSync(id);
}

export async function getCachedLiveData(
  leagueId: string,
): Promise<ClaudeLiveDataResponse | null> {
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
 * Map a schedule row to one Claude response row; used by cricinfo live-score.
 * Why: shared matching rules (match number + both short names) in one place.
 */
export function findClaudeRowForMatch(
  response: ClaudeLiveDataResponse,
  matchNumber: number,
  team1Short: string,
  team2Short: string,
): ClaudeMatchLiveData | null {
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
