import "server-only";

import { getMatchData } from "@/lib/espncricinfo";

// ---------------------------------------------------------------------------
// cricinfo.ts — public façade for live match data consumed by the live-score
// API route and standings scraper.
//
// All data fetching and caching is now delegated to espncricinfo.ts, which
// uses the stored espncricinfoUrl to call the consumer API details endpoint
// directly (no current-matches search, no cricketdata.org, no Gemini).
//
// Why kept as a separate file: the live-score route, standings-scraper, and
// match-poller import from here. Keeping this boundary means those callers
// require no changes. New code should import from espncricinfo.ts directly.
// ---------------------------------------------------------------------------

// Re-export normShort so callers (standings-scraper, match-poller) keep
// working without touching their imports.
export { normShort } from "@/lib/espncricinfo";

// ---------------------------------------------------------------------------
// Public DTOs — shapes expected by the live-score API route and its client
// component. Kept identical to the previous version for zero caller changes.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// getLiveScore — fetch current match state and map to CricinfoLiveScore.
//
// The signature now accepts espncricinfoUrl as the primary key. The team
// short names are kept as fallback for the case where no URL is stored yet.
// ---------------------------------------------------------------------------

export async function getLiveScore(
  espncricinfoUrl: string | null,
  team1Short: string,
  team2Short: string,
): Promise<CricinfoLiveScore> {
  const data = await getMatchData(espncricinfoUrl, team1Short, team2Short);
  if (!data) return NOT_LIVE;

  return {
    isLive: data.isLive,
    statusText: data.statusText,
    toss: data.toss,
    innings: data.innings.map((inn) => ({
      inningsNumber: inn.inningsNumber,
      // Why rename: CricinfoInnings uses battingTeamShort; EspnInnings uses
      // battingTeamShortName. Map explicitly to keep the public shape stable.
      battingTeamShort: inn.battingTeamShortName,
      runs: inn.runs,
      wickets: inn.wickets,
      overs: inn.overs,
      isComplete: inn.isComplete,
    })),
    isFirstInningsComplete: data.isFirstInningsComplete,
    matchEnded: data.matchEnded,
    cricinfoMatchId: data.matchId,
    cricinfoSeriesId: data.seriesId,
  };
}

// ---------------------------------------------------------------------------
// getMatchUpdates — derive key events from the match state.
//
// Previously this fetched commentary from the consumer API's detailed
// commentary endpoint. Now we derive updates from the already-cached match
// data (toss, completed innings, live status) — no extra network call.
//
// Why: commentary parsing was fragile and the user's requirement is simply
// to show the score from the last update, not a full commentary feed.
// ---------------------------------------------------------------------------

export async function getMatchUpdates(
  espncricinfoUrl: string | null,
  team1Short: string,
  team2Short: string,
  limit = 5,
): Promise<MatchUpdate[]> {
  const data = await getMatchData(espncricinfoUrl, team1Short, team2Short);
  if (!data) return [];

  const updates: MatchUpdate[] = [];

  // Toss is always the first useful event.
  if (data.toss) {
    updates.push({ type: "toss", text: data.toss });
  }

  // Show a summary line for each completed innings.
  for (const inn of data.innings) {
    if (inn.isComplete) {
      updates.push({
        type: "innings_end",
        text: `${inn.battingTeamShortName}: ${inn.runs}/${inn.wickets} (${inn.overs} ov)`,
      });
    }
  }

  // Add the current status text as an info update when it adds context
  // beyond what's already in the innings lines (e.g. "MI need 45 off 30 balls").
  if (
    data.statusText &&
    data.isLive &&
    updates.length < limit
  ) {
    updates.push({ type: "info", text: data.statusText });
  }

  return updates.slice(0, limit);
}
