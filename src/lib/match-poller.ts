import "server-only";

import { revalidatePath } from "next/cache";

import type { MatchResult, MatchStatus } from "@/generated/prisma";
import { normShort } from "@/lib/cricinfo";
import { type MatchScrapeTarget, scrapeMatchData } from "@/lib/match-scraper";
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/scoring";

const LOOKAHEAD_MS = 30 * 60 * 1_000;

interface PollableMatch {
  id: string;
  leagueId: string;
  matchNumber: number;
  status: MatchStatus;
  firstInningsCompleteTimeUtc: Date | null;
  espncricinfoUrl: string | null;
  team1: { id: string; shortName: string };
  team2: { id: string; shortName: string };
}

export interface PollResultDetail {
  matchId: string;
  previousStatus: MatchStatus;
  nextStatus: MatchStatus;
  action: "no_change" | "status_advanced" | "completed" | "abandoned" | "skipped";
  reason: string;
}

export interface MatchPollSummary {
  polled: number;
  updated: number;
  skipped: number;
  failed: number;
  details: PollResultDetail[];
}

export async function pollAndUpdateMatches(): Promise<MatchPollSummary> {
  const matches = await getPollableMatches();
  const details: PollResultDetail[] = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const match of matches) {
    try {
      const detail = await processMatch(match);
      details.push(detail);
      if (detail.action === "skipped" || detail.action === "no_change") skipped += 1;
      else updated += 1;
    } catch {
      failed += 1;
      details.push(makeDetail(match, "skipped", match.status, "Unhandled poll error."));
    }
  }

  return { polled: matches.length, updated, skipped, failed, details };
}

async function getPollableMatches(): Promise<PollableMatch[]> {
  const lookahead = new Date(Date.now() + LOOKAHEAD_MS);
  // Why: poll near-start upcoming matches so lifecycle auto-opens without admin clicks.
  return prisma.match.findMany({
    where: {
      OR: [
        { status: { in: ["live_first_innings", "live_second_innings"] } },
        { status: "upcoming", startTimeUtc: { lte: lookahead } },
      ],
    },
    orderBy: [{ startTimeUtc: "asc" }, { matchNumber: "asc" }],
    select: {
      id: true,
      leagueId: true,
      matchNumber: true,
      status: true,
      firstInningsCompleteTimeUtc: true,
      espncricinfoUrl: true,
      team1: { select: { id: true, shortName: true } },
      team2: { select: { id: true, shortName: true } },
    },
  });
}

async function processMatch(match: PollableMatch): Promise<PollResultDetail> {
  const target: MatchScrapeTarget = {
    id: match.id,
    matchNumber: match.matchNumber,
    team1ShortName: match.team1.shortName,
    team2ShortName: match.team2.shortName,
    espncricinfoUrl: match.espncricinfoUrl,
  };
  const scraped = await scrapeMatchData(target);
  if (!scraped.data) return makeDetail(match, "skipped", match.status, "Scrape failed.");
  if (scraped.data.matchPhase === "not_started") return makeDetail(match, "no_change", match.status, "Not started.");

  if (scraped.data.matchPhase === "first_innings" && match.status === "upcoming") {
    await prisma.match.update({ where: { id: match.id }, data: { status: "live_first_innings" } });
    revalidate(match.leagueId);
    return makeDetail(match, "status_advanced", "live_first_innings", "Advanced to first innings.");
  }

  if (scraped.data.matchPhase === "second_innings" && (match.status === "upcoming" || match.status === "live_first_innings")) {
    await prisma.match.update({
      where: { id: match.id },
      data: {
        status: "live_second_innings",
        // Why: innings 2 start means first innings complete, so Palat must close.
        firstInningsCompleteTimeUtc: match.firstInningsCompleteTimeUtc ?? new Date(),
      },
    });
    revalidate(match.leagueId);
    return makeDetail(match, "status_advanced", "live_second_innings", "Advanced to second innings.");
  }

  if (scraped.data.matchPhase === "abandoned") {
    await prisma.match.update({ where: { id: match.id }, data: { status: "abandoned", result: "abandoned", winnerId: null } });
    await scoreMatch(match.id, "abandoned", null);
    revalidate(match.leagueId);
    return makeDetail(match, "abandoned", "abandoned", "Marked abandoned.");
  }

  const resolved = resolveCompletedResult(match, scraped.data.winningTeamShortName, scraped.data.resultText);
  if (!resolved) return makeDetail(match, "skipped", match.status, "Unable to resolve completed result.");

  const nextStatus: MatchStatus = resolved.result === "abandoned" ? "abandoned" : "completed";
  await prisma.match.update({
    where: { id: match.id },
    data: {
      status: nextStatus,
      result: resolved.result,
      winnerId: resolved.winnerId,
      firstInningsCompleteTimeUtc: match.firstInningsCompleteTimeUtc ?? new Date(),
    },
  });
  await scoreMatch(match.id, resolved.result, resolved.winnerId);
  revalidate(match.leagueId);
  return makeDetail(match, nextStatus === "abandoned" ? "abandoned" : "completed", nextStatus, "Completed and scored.");
}

function resolveCompletedResult(
  match: PollableMatch,
  winningTeamShortName: string | null,
  resultText: string | null,
): { result: MatchResult; winnerId: string | null } | null {
  const winnerShort = (winningTeamShortName ?? "").trim();
  if (winnerShort) {
    // Why: normalized comparison handles punctuation/case differences safely.
    const normalized = normShort(winnerShort);
    if (normalized === normShort(match.team1.shortName)) return { result: "team1_win", winnerId: match.team1.id };
    if (normalized === normShort(match.team2.shortName)) return { result: "team2_win", winnerId: match.team2.id };
  }

  const text = (resultText ?? "").toLowerCase();
  if (text.includes("abandon") || text.includes("no result")) return { result: "abandoned", winnerId: null };
  if (text.includes("draw") || text.includes("tie") || text.includes("tied")) return { result: "draw", winnerId: null };
  return null;
}

function makeDetail(
  match: PollableMatch,
  action: PollResultDetail["action"],
  nextStatus: MatchStatus,
  reason: string,
): PollResultDetail {
  return { matchId: match.id, previousStatus: match.status, nextStatus, action, reason };
}

function revalidate(leagueId: string): void {
  // Why: these pages depend on match status/result and should refresh after cron writes.
  revalidatePath(`/admin/league/${leagueId}`);
  revalidatePath(`/admin/league/${leagueId}/groups`);
  revalidatePath(`/admin/league/${leagueId}/players`);
}
