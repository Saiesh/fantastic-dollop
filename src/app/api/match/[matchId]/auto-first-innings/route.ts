import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Why: force-dynamic — this is a write endpoint and must never be cached.
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ matchId: string }>;
}

/**
 * POST /api/match/[matchId]/auto-first-innings
 *
 * Called by the LiveScore client component when Cricinfo data shows the
 * first innings has ended. This auto-closes the Palat window without
 * requiring manual admin action, but only if:
 *   - The match exists.
 *   - firstInningsCompleteTimeUtc has not already been set.
 *   - The match is currently in live_first_innings status.
 *
 * Why no auth check: The DB update is idempotent (guarded by the
 * firstInningsCompleteTimeUtc null check) and only ever advances status
 * — it cannot be used to reverse results or award points.
 */
export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { matchId } = await context.params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      leagueId: true,
      status: true,
      firstInningsCompleteTimeUtc: true,
    },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Idempotency guard — already marked, nothing to do.
  if (match.firstInningsCompleteTimeUtc !== null) {
    return NextResponse.json({ alreadyMarked: true });
  }

  // Only auto-advance during live_first_innings.
  // If the admin hasn't started the match yet (status = upcoming),
  // we skip to avoid prematurely closing the Palat window.
  if (match.status !== "live_first_innings") {
    return NextResponse.json({ skipped: true, reason: "not in first innings" });
  }

  // Why: Setting firstInningsCompleteTimeUtc closes the Palat window across
  // all groups in the same way the admin action does. We advance status to
  // live_second_innings to stay in sync with the match progress page UI.
  await prisma.match.update({
    where: { id: matchId },
    data: {
      firstInningsCompleteTimeUtc: new Date(),
      status: "live_second_innings",
    },
  });

  // Revalidate so the match detail server component picks up the new status.
  revalidatePath(`/group/[groupId]/match/${matchId}`, "page");

  return NextResponse.json({ marked: true });
}
