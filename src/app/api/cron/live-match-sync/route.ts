import { NextResponse } from "next/server";

import { syncLiveMatches } from "@/lib/live-match-sync";

/**
 * Why: Vercel Cron hits this route with a shared secret so the job is not public.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncLiveMatches();
  return NextResponse.json(result);
}
