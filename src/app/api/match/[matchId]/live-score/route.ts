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

  // Only poll Cricinfo for live or recently-started matches.
  // Upcoming (before start): no live data yet.
  // Completed/abandoned: no need to poll.
  const isLiveOrRecent =
    match.status === "live_first_innings" ||
    match.status === "live_second_innings";

  // We still try even for "upcoming" status in case Cricinfo has data
  // (e.g. toss has happened but admin hasn't set status to live yet).
  // The getLiveScore call is cheap (cached 20 s server-side).
  const [liveScore, updates] = await Promise.all([
    getLiveScore(match.team1.shortName, match.team2.shortName),
    isLiveOrRecent
      ? getMatchUpdates(match.team1.shortName, match.team2.shortName, 5)
      : Promise.resolve([]),
  ]);

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
        // Allow the browser to cache for up to 20 s; align with server TTL.
        "Cache-Control": "public, max-age=20, stale-while-revalidate=10",
      },
    },
  );
}
