import { NextResponse } from "next/server";

import { getLeagueTeamsForInvite } from "@/lib/actions/auth";

// Why: invite-to-team resolution must not be served from a static cache — codes and rosters can change.
export const dynamic = "force-dynamic";

/**
 * GET /api/teams?inviteCode=...
 * Why: plain JSON over standard HTTP so clients (e.g. iOS Safari) avoid React server-action transport.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const inviteCode = new URL(request.url).searchParams.get("inviteCode");

  if (inviteCode === null || inviteCode.trim() === "") {
    return NextResponse.json(
      { ok: false as const, error: "MISSING_INVITE_CODE" },
      { status: 400 },
    );
  }

  const result = await getLeagueTeamsForInvite(inviteCode);

  if (result.ok) {
    return NextResponse.json(result);
  }

  const status =
    result.error === "INVALID_INVITE"
      ? 404
      : result.error === "NO_TEAMS"
        ? 422
        : 503;

  return NextResponse.json(result, { status });
}
