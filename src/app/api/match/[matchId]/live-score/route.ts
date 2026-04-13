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

  // Only fetch detailed commentary updates for actively live matches.
  // Upcoming (before start): no live data yet.
  // Completed/abandoned: no need to poll further.
  const isLiveOrRecent =
    match.status === "live_first_innings" ||
    match.status === "live_second_innings";

  // Why sequential: getLiveScore populates the espncricinfo cache keyed by
  // series/match IDs; getMatchUpdates reuses that same cache entry — running
  // them in parallel would race to populate the cache twice.
  const liveScore = await getLiveScore(
    match.espncricinfoUrl,
    match.team1.shortName,
    match.team2.shortName,
  );
  const updates = isLiveOrRecent
    ? await getMatchUpdates(
        match.espncricinfoUrl,
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
        // Allow the browser to cache for up to 60 s; aligns with the 2-minute
        // server-side espncricinfo cache for a smooth stale-while-revalidate
        // experience without hammering the consumer API.
        "Cache-Control": "public, max-age=60, stale-while-revalidate=30",
      },
    },
  );
}
