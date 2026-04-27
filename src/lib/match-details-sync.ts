import "server-only";

import { Prisma } from "@/generated/prisma";
import {
  callGeminiWithPrompt,
  type GeminiLiveDataResponse,
  resolveLeagueId,
  syncResponseToDatabase,
} from "@/lib/gemini-live-data";
import { prisma } from "@/lib/prisma";

// Why: 18h TTL so login does not re-hit Gemini on every return visit the same day.
const DETAILS_CACHE_TTL_MS = 18 * 60 * 60 * 1_000;

/**
 * Why: single convention for the row key so cricinfo and this module agree (see also live key).
 */
function detailsCacheKey(leagueId: string): string {
  return `details:${leagueId}`;
}

/**
 * Why: "today" and "yesterday" are interpreted in India Standard Time, matching
 * how the IPL schedule is discussed locally; offset is fixed (no DST in IST).
 */
function getIstTodayParts(from: Date): { y: number; m: number; d: number } {
  const s = from.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/**
 * Why: instants (UTC) for “yesterday 00:00 IST” and “tomorrow 00:00 IST”
 * bound the [yesterday, today] window in local calendar days.
 */
function getYesterdayTodayIstWindow(from: Date): { start: Date; end: Date } {
  const { y, m, d } = getIstTodayParts(from);
  const todayMidnightIst = new Date(
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+05:30`,
  );
  const start = new Date(todayMidnightIst.getTime() - 24 * 60 * 60 * 1_000);
  const end = new Date(todayMidnightIst.getTime() + 24 * 60 * 60 * 1_000);
  return { start, end };
}

/**
 * Why: only send fixtures in the “recent” window to Gemini to cut input tokens
 * versus the full-season list used by admin full sync.
 */
function buildDetailsPrompt(
  leagueName: string,
  seasonYear: number,
  scheduleLines: string[],
): string {
  const schedule = scheduleLines.length
    ? scheduleLines.join("\n")
    : "(no fixtures in this two-day window in the database.)";

  return `You are a data extraction assistant for the Indian Premier League.

Target league: **${leagueName}** (${seasonYear}).
Only these fixtures matter for this request (yesterday and today, IST); align all match numbers and team abbreviations to this list:
${schedule}

Use Google Search for current scorelines, toss, and match status for these fixtures only.
Return **"standings": []** (empty array) — standings are synced separately with the full season admin job.

Return **only** valid JSON (no markdown) in this exact shape:
{
  "matches": [
    {
      "matchNumber": <number>,
      "team1ShortName": "<e.g. MI>",
      "team2ShortName": "<e.g. CSK>",
      "matchOngoing": <boolean>,
      "matchStarted": <boolean>,
      "matchScore": "<one line summary or empty string>",
      "isFirstInnings": <boolean>,
      "firstInningsComplete": <boolean>,
      "tossResult": <string or null>,
      "winningTeamShortName": <string or null>,
      "resultText": <string or null>,
      "innings": [
        {
          "inningsNumber": <1 or 2>,
          "battingTeamShort": "<e.g. MI>",
          "runs": <number>,
          "wickets": <number>,
          "overs": "<e.g. 20.0>",
          "isComplete": <boolean>
        }
      ]
    }
  ],
  "standings": [],
  "fetchedAt": "<ISO-8601 UTC>"
}`;
}

/**
 * Why: after login, refresh only recent fixtures from Gemini and store in DB
 * so the live-score route can read a durable cache across serverless invocations.
 */
export async function syncMatchDetailsOnLogin(
  leagueId: string | undefined,
): Promise<void> {
  const id = await resolveLeagueId(leagueId);
  if (!id) {
    return;
  }

  const key = detailsCacheKey(id);
  const now = new Date();
  const existing = await prisma.matchSyncCache.findUnique({
    where: { cacheKey: key },
    select: { expiresAt: true },
  });
  if (existing && existing.expiresAt > now) {
    // Why: DB cache is still valid — avoid another Gemini run on every sign-in.
    return;
  }

  const { start, end } = getYesterdayTodayIstWindow(now);
  const rows = await prisma.match.findMany({
    where: {
      leagueId: id,
      startTimeUtc: { gte: start, lt: end },
    },
    orderBy: { matchNumber: "asc" },
    select: {
      matchNumber: true,
      startTimeUtc: true,
      team1: { select: { shortName: true } },
      team2: { select: { shortName: true } },
    },
  });

  if (rows.length === 0) {
    // Why: no schedule rows in range — still upsert a tiny payload so the cache
    // TTL is extended and we do not call Gemini for an empty list.
    const emptyPayload: GeminiLiveDataResponse = {
      matches: [],
      standings: [],
      fetchedAt: now.toISOString(),
    };
    // Why: Prisma `Json` input types are structurally open; the response DTO is JSON-serialisable.
    const asJson = emptyPayload as unknown as Prisma.InputJsonValue;
    await prisma.matchSyncCache.upsert({
      where: { cacheKey: key },
      create: {
        cacheKey: key,
        payload: asJson,
        fetchedAt: now,
        expiresAt: new Date(now.getTime() + DETAILS_CACHE_TTL_MS),
      },
      update: {
        payload: asJson,
        fetchedAt: now,
        expiresAt: new Date(now.getTime() + DETAILS_CACHE_TTL_MS),
      },
    });
    return;
  }

  const league = await prisma.league.findUnique({
    where: { id },
    select: { name: true, seasonYear: true },
  });
  if (!league) {
    return;
  }

  const scheduleLines = rows.map(
    (r) =>
      `Match ${r.matchNumber} (${r.startTimeUtc.toISOString()}): ${r.team1.shortName} vs ${r.team2.shortName}`,
  );
  const prompt = buildDetailsPrompt(
    league.name,
    league.seasonYear,
    scheduleLines,
  );
  const fresh = await callGeminiWithPrompt(prompt);
  if (!fresh) {
    return;
  }

  await syncResponseToDatabase(id, fresh);

  const fetchedAt = new Date();
  const payloadJson = fresh as unknown as Prisma.InputJsonValue; // Why: see empty-payload note above
  await prisma.matchSyncCache.upsert({
    where: { cacheKey: key },
    create: {
      cacheKey: key,
      payload: payloadJson,
      fetchedAt,
      expiresAt: new Date(fetchedAt.getTime() + DETAILS_CACHE_TTL_MS),
    },
    update: {
      payload: payloadJson,
      fetchedAt,
      expiresAt: new Date(fetchedAt.getTime() + DETAILS_CACHE_TTL_MS),
    },
  });
}
