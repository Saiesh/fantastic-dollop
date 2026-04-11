import { NextRequest, NextResponse } from "next/server";

import { findGroupByInviteCode } from "@/lib/auth/resolve-group";
import { getEligibleHomeTeams } from "@/lib/groups";

/**
 * GET /api/league-teams?code=INVITE_CODE
 *
 * Why a route instead of a server action: programmatic server action calls use the
 * Next.js RSC wire-format streaming protocol, which iOS WebKit stalls on indefinitely.
 * A plain JSON API route is handled correctly by all browsers.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  if (code.length === 0) {
    return NextResponse.json({ ok: false, error: "INVALID_INVITE" });
  }

  const group = await findGroupByInviteCode(code);
  if (!group) {
    return NextResponse.json({ ok: false, error: "INVALID_INVITE" });
  }

  const teams = await getEligibleHomeTeams(group.leagueId);
  return NextResponse.json({ ok: true, teams });
}
