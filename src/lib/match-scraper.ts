import "server-only";

import { getMatchData } from "@/lib/espncricinfo";

// ---------------------------------------------------------------------------
// match-scraper — thin adapter between the ESPNCricinfo data layer and the
// match poller's ScrapedMatchData interface.
//
// Why kept as a separate file: match-poller.ts imports scrapeMatchData() and
// MatchScrapeTarget from here; keeping the same module boundary means the
// poller needs no changes. The heavy lifting (API calls, caching, parsing)
// now lives entirely in espncricinfo.ts.
// ---------------------------------------------------------------------------

export interface ScrapedMatchData {
  matchPhase:
    | "not_started"
    | "first_innings"
    | "second_innings"
    | "completed"
    | "abandoned";
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
}

export interface MatchScrapeTarget {
  id: string;
  matchNumber: number;
  team1ShortName: string;
  team2ShortName: string;
  espncricinfoUrl: string | null;
}

interface ScrapeResult {
  data: ScrapedMatchData | null;
}

/**
 * Fetches current match state for the given target.
 *
 * Primary path: uses the stored espncricinfoUrl to call the consumer API
 *   details endpoint directly (series/match IDs embedded in the URL).
 * Fallback: searches the current-matches list by team short names.
 *
 * Returns { data: null } when the match is not found or the API is down.
 */
export async function scrapeMatchData(
  target: MatchScrapeTarget,
): Promise<ScrapeResult> {
  const data = await getMatchData(
    target.espncricinfoUrl,
    target.team1ShortName,
    target.team2ShortName,
  );

  if (!data) return { data: null };

  return {
    data: {
      matchPhase: data.matchPhase,
      innings: data.innings.map((inn) => ({
        battingTeamShortName: inn.battingTeamShortName,
        runs: inn.runs,
        wickets: inn.wickets,
        overs: inn.overs,
        isComplete: inn.isComplete,
      })),
      resultText: data.resultText,
      winningTeamShortName: data.winningTeamShortName,
      toss: data.toss,
    },
  };
}
