import "server-only";

import {
  findGeminiRowForMatch,
  type GeminiMatchLiveData,
  tryParseGeminiLiveDataResponse,
} from "@/lib/gemini-live-data";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// cricinfo.ts — live score + updates for the match page.
//
// Why: Read-through `MatchSyncCache` (live: then details:) so serverless
// instances share the same payload without gemini-live-data’s in-memory map.
// ---------------------------------------------------------------------------

// Why: shared team short-name key for any caller that still needs fuzzy keys.
export function normShort(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

export interface CricinfoInnings {
  inningsNumber: number;
  battingTeamShort: string;
  runs: number;
  wickets: number;
  overs: string;
  isComplete: boolean;
}

export interface CricinfoLiveScore {
  isLive: boolean;
  statusText: string;
  toss: string | null;
  innings: CricinfoInnings[];
  isFirstInningsComplete: boolean;
  matchEnded: boolean;
  cricinfoMatchId: number | null;
  cricinfoSeriesId: number | null;
}

export interface MatchUpdate {
  type: "toss" | "wicket" | "milestone" | "innings_end" | "info";
  text: string;
}

const NOT_LIVE: CricinfoLiveScore = {
  isLive: false,
  statusText: "",
  toss: null,
  innings: [],
  isFirstInningsComplete: false,
  matchEnded: false,
  cricinfoMatchId: null,
  cricinfoSeriesId: null,
};

/**
 * Why: `live:` is fresher (cron) when present; `details:` comes from login-scoped
 * sync and covers the rest of the scoreboard.
 */
async function findRowFromMatchSyncCache(
  leagueId: string,
  matchId: string,
  matchNumber: number,
  team1Short: string,
  team2Short: string,
): Promise<GeminiMatchLiveData | null> {
  const now = new Date();
  const live = await prisma.matchSyncCache.findUnique({
    where: { cacheKey: `live:${matchId}` },
  });
  if (live && live.expiresAt > now) {
    const parsed = tryParseGeminiLiveDataResponse(live.payload);
    if (parsed) {
      const found = findGeminiRowForMatch(
        parsed,
        matchNumber,
        team1Short,
        team2Short,
      );
      if (found) {
        return found;
      }
    }
  }
  const details = await prisma.matchSyncCache.findUnique({
    where: { cacheKey: `details:${leagueId}` },
  });
  if (!details || details.expiresAt <= now) {
    return null;
  }
  const parsed = tryParseGeminiLiveDataResponse(details.payload);
  if (!parsed) {
    return null;
  }
  return findGeminiRowForMatch(
    parsed,
    matchNumber,
    team1Short,
    team2Short,
  );
}

/**
 * Returns true when the live:<matchId> cache row is absent or expired.
 * Why: lets the route schedule a background sync without importing live-match-sync
 * into cricinfo, which would create a circular dependency.
 */
export async function isLiveCacheStale(matchId: string): Promise<boolean> {
  const row = await prisma.matchSyncCache.findUnique({
    where: { cacheKey: `live:${matchId}` },
    select: { expiresAt: true },
  });
  return !row || row.expiresAt <= new Date();
}

/**
 * Return a live score snapshot for a match, backed by the league Gemini cache.
 * Why: `matchId` selects the per-fixture `live:` row; details cache is the fallback.
 */
export async function getLiveScore(
  leagueId: string,
  matchId: string,
  matchNumber: number,
  team1Short: string,
  team2Short: string,
): Promise<CricinfoLiveScore> {
  const row = await findRowFromMatchSyncCache(
    leagueId,
    matchId,
    matchNumber,
    team1Short,
    team2Short,
  );
  if (!row) return NOT_LIVE;

  const statusText = row.matchScore.trim() || (row.resultText ?? "").trim();
  const matchEnded =
    !row.matchOngoing &&
    Boolean(
      row.winningTeamShortName ||
        (row.resultText && row.resultText.trim().length > 0),
    );

  // Why: map Gemini's structured innings array to the UI's CricinfoInnings shape.
  // Rows without innings (cached before this schema change) default to [] via Zod.
  const innings: CricinfoInnings[] = (row.innings ?? []).map((inn) => ({
    inningsNumber: inn.inningsNumber,
    battingTeamShort: inn.battingTeamShort,
    runs: inn.runs,
    wickets: inn.wickets,
    overs: inn.overs,
    isComplete: inn.isComplete,
  }));

  return {
    isLive: row.matchOngoing,
    statusText,
    toss: row.tossResult,
    innings,
    isFirstInningsComplete: row.firstInningsComplete,
    matchEnded,
    cricinfoMatchId: null,
    cricinfoSeriesId: null,
  };
}

/**
 * Short update lines derived from the same Gemini row (toss + score/status).
 * Why: commentary APIs are gone; we surface high-signal strings only.
 */
export async function getMatchUpdates(
  leagueId: string,
  matchId: string,
  matchNumber: number,
  team1Short: string,
  team2Short: string,
  limit = 5,
): Promise<MatchUpdate[]> {
  const row = await findRowFromMatchSyncCache(
    leagueId,
    matchId,
    matchNumber,
    team1Short,
    team2Short,
  );
  if (!row) return [];

  const updates: MatchUpdate[] = [];
  if (row.tossResult) {
    updates.push({ type: "toss", text: row.tossResult });
  }
  const line = row.matchScore.trim() || (row.resultText ?? "").trim();
  if (line) {
    updates.push({ type: "info", text: line });
  }
  if (row.resultText && row.resultText !== line) {
    updates.push({ type: "info", text: row.resultText });
  }
  return updates.slice(0, limit);
}
