import { NextResponse } from "next/server";
import { getMatchById } from "@/lib/matches";
import { getLiveScore, getMatchUpdates } from "@/lib/cricinfo";

// Why: force-dynamic so Next.js never statically caches this route —
// live score must always be a real-time fetch.
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ matchId: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { matchId } = await context.params;

  const match = await getMatchById(matchId);
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Only fetch pseudo-updates for actively live matches.
  const isLiveOrRecent =
    match.status === "live_first_innings" ||
    match.status === "live_second_innings";

  // Why: both use `MatchSyncCache` (no extra Gemini on this route).
  const liveScore = await getLiveScore(
    match.leagueId,
    matchId,
    match.matchNumber,
    match.team1.shortName,
    match.team2.shortName,
  );
  const updates = isLiveOrRecent
    ? await getMatchUpdates(
        match.leagueId,
        matchId,
        match.matchNumber,
        match.team1.shortName,
        match.team2.shortName,
        5,
      )
    : [];

  return NextResponse.json(
    {
      matchId,
      matchStatus: match.status,
      firstInningsCompleteInDb: match.firstInningsCompleteTimeUtc !== null,
      liveScore,
      updates,
    },
    {
      headers: {
      // Why: short browser cache; server-side data comes from DB-backed match sync.
        "Cache-Control": "public, max-age=60, stale-while-revalidate=30",
      },
    },
  );
}
