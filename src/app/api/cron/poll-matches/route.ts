import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { pollAndUpdateMatches } from "@/lib/match-poller";
import { prisma } from "@/lib/prisma";
import { updateStandingsFromCricinfo } from "@/lib/standings-scraper";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await pollAndUpdateMatches();

    // Why: update IPL standings from Cricinfo alongside match polling so the
    // team points table stays current without a separate cron job.
    let standingsSummary = null;
    try {
      const activeLeague = await prisma.league.findFirst({
        where: { status: "active" },
        select: { id: true },
      });
      if (activeLeague) {
        standingsSummary = await updateStandingsFromCricinfo(activeLeague.id);

        // Why: revalidate all group leaderboard pages so users see fresh standings
        // without waiting for the next full page build.
        if (standingsSummary.updated) {
          const groups = await prisma.group.findMany({
            where: { leagueId: activeLeague.id },
            select: { id: true },
          });
          for (const g of groups) {
            revalidatePath(`/group/${g.id}/leaderboard`);
          }
        }
      }
    } catch {
      // Why: standings failure should not block the match poll response —
      // match lifecycle is higher priority than the points table.
    }

    return NextResponse.json({ ok: true, summary, standings: standingsSummary });
  } catch {
    // Why: this keeps failure signals visible in cron logs while avoiding stack leaks.
    return NextResponse.json(
      { ok: false, error: "Failed to poll and update matches" },
      { status: 500 },
    );
  }
}
