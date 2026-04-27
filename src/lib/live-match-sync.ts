import "server-only";

import { Prisma, type MatchStatus } from "@/generated/prisma";
import {
  callGeminiWithMatchPrompt,
  type GeminiLiveDataResponse,
  resolveLeagueId,
  syncResponseToDatabase,
} from "@/lib/gemini-live-data";
import { prisma } from "@/lib/prisma";

// Why: live rows refresh every ~10m via cron; short TTL still bounds stale reads
// on cricinfo if a cron is skipped.
const LIVE_CACHE_TTL_MS = 12 * 60 * 1_000;

// Why: must match the key read in `cricinfo` / written in this module.
function liveCacheKey(matchId: string): string {
  return `live:${matchId}`;
}

const LIVE_STATUS: MatchStatus[] = [
  "upcoming",
  "live_first_innings",
  "live_second_innings",
];

/**
 * Why: a focused one-match prompt is cheaper and more accurate than a full
 * league call when the cron only needs to nudge a single in-window fixture.
 */
function buildSingleMatchPrompt(
  leagueName: string,
  seasonYear: number,
  matchNumber: number,
  team1Short: string,
  team2Short: string,
): string {
  return `You are a data extraction assistant for the Indian Premier League.

Context: **${leagueName}** (${seasonYear}), **Match ${matchNumber}** — ${team1Short} vs ${team2Short}.

Use Google Search for the current score, toss, and live status of this one fixture.

Return **only** valid JSON (no markdown) for a single object with these exact fields:
{
  "matchNumber": ${matchNumber},
  "team1ShortName": "${team1Short}",
  "team2ShortName": "${team2Short}",
  "matchOngoing": <boolean>,
  "matchStarted": <boolean>,
  "matchScore": "<one line or empty string>",
  "isFirstInnings": <boolean>,
  "firstInningsComplete": <boolean>,
  "tossResult": <string or null>,
  "winningTeamShortName": <string or null>,
  "resultText": <string or null>
}`;
}

/**
 * Why: Vercel cron calls this to advance live matches and back the
 * `MatchSyncCache` `live:` row the live-score API reads.
 */
export async function syncLiveMatches(
  leagueIdArg?: string,
): Promise<{ synced: number }> {
  const scopeId = await resolveLeagueId(leagueIdArg);
  if (!scopeId) {
    return { synced: 0 };
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - 6 * 60 * 60 * 1_000);
  const windowEnd = new Date(now.getTime() + 30 * 60 * 1_000);

  const where: Prisma.MatchWhereInput = {
    leagueId: scopeId,
    status: { in: LIVE_STATUS },
    startTimeUtc: { gte: windowStart, lte: windowEnd },
  };

  const candidates = await prisma.match.findMany({
    where,
    orderBy: { startTimeUtc: "asc" },
    select: {
      id: true,
      matchNumber: true,
      leagueId: true,
      league: { select: { name: true, seasonYear: true } },
      team1: { select: { shortName: true } },
      team2: { select: { shortName: true } },
    },
  });

  if (candidates.length === 0) {
    return { synced: 0 };
  }

  let synced = 0;
  for (const m of candidates) {
    const prompt = buildSingleMatchPrompt(
      m.league.name,
      m.league.seasonYear,
      m.matchNumber,
      m.team1.shortName,
      m.team2.shortName,
    );
    const one = await callGeminiWithMatchPrompt(prompt);
    if (!one) {
      // Why: continue with other live windows even if a single call fails.
      continue;
    }

    const data: GeminiLiveDataResponse = {
      matches: [one],
      standings: [],
      fetchedAt: new Date().toISOString(),
    };
    await syncResponseToDatabase(m.leagueId, data);

    const fetchedAt = new Date();
    const key = liveCacheKey(m.id);
    // Why: same Prisma Json column bridge as match-details-sync.
    const payloadJson = data as unknown as Prisma.InputJsonValue;
    await prisma.matchSyncCache.upsert({
      where: { cacheKey: key },
      create: {
        cacheKey: key,
        payload: payloadJson,
        fetchedAt,
        expiresAt: new Date(fetchedAt.getTime() + LIVE_CACHE_TTL_MS),
      },
      update: {
        payload: payloadJson,
        fetchedAt,
        expiresAt: new Date(fetchedAt.getTime() + LIVE_CACHE_TTL_MS),
      },
    });
    synced += 1;
  }

  return { synced };
}
