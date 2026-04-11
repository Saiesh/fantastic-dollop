import "server-only";

import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import type { MatchDTO, TeamBriefDTO } from "@/types/bets";

// --------------------------------------------------------------------------
// Match queries — all reads go through this module so components never import
// Prisma directly. Returns DTOs safe for the client boundary.
// --------------------------------------------------------------------------

const TEAM_BRIEF_SELECT = {
  id: true,
  name: true,
  shortName: true,
  logoUrl: true,
  primaryColor: true,
} as const;

const MATCH_SELECT = {
  id: true,
  leagueId: true,
  matchNumber: true,
  startTimeUtc: true,
  stage: true,
  status: true,
  winnerId: true,
  firstInningsCompleteTimeUtc: true,
  team1Id: true,
  team2Id: true,
  team1: { select: TEAM_BRIEF_SELECT },
  team2: { select: TEAM_BRIEF_SELECT },
} as const;

// Inferred row shape from the Prisma select so the DTO mapper stays in sync
// with the query shape without manual type duplication.
type MatchRow = Prisma.MatchGetPayload<{ select: typeof MATCH_SELECT }>;

function toMatchDTO(row: MatchRow): MatchDTO {
  return {
    id: row.id,
    leagueId: row.leagueId,
    matchNumber: row.matchNumber,
    team1: row.team1 as TeamBriefDTO,
    team2: row.team2 as TeamBriefDTO,
    startTimeUtc: row.startTimeUtc.toISOString(),
    stage: row.stage,
    status: row.status,
    winnerId: row.winnerId,
    firstInningsCompleteTimeUtc:
      row.firstInningsCompleteTimeUtc?.toISOString() ?? null,
  };
}

export async function getMatchById(matchId: string): Promise<MatchDTO | null> {
  const row = await prisma.match.findUnique({
    where: { id: matchId },
    select: MATCH_SELECT,
  });

  if (!row) return null;
  return toMatchDTO(row);
}

// Why: Admin panel needs ALL matches for the league with team names and
// current status to display the full match management list.
export async function getMatchesForLeague(leagueId: string) {
  return prisma.match.findMany({
    where: { leagueId },
    select: {
      id: true,
      matchNumber: true,
      // Why: admin needs to view/edit the source URL used by cron scraping.
      espncricinfoUrl: true,
      startTimeUtc: true,
      stage: true,
      status: true,
      result: true,
      winnerId: true,
      firstInningsCompleteTimeUtc: true,
      team1: { select: TEAM_BRIEF_SELECT },
      team2: { select: TEAM_BRIEF_SELECT },
      winner: { select: { id: true, name: true, shortName: true } },
    },
    orderBy: { matchNumber: "asc" },
  });
}

/** Upcoming matches for a league, ordered by start time (soonest first). */
export async function getUpcomingMatches(
  leagueId: string,
): Promise<MatchDTO[]> {
  const rows = await prisma.match.findMany({
    where: { leagueId, result: "upcoming" },
    orderBy: { startTimeUtc: "asc" },
    select: MATCH_SELECT,
  });

  return rows.map(toMatchDTO);
}

// --------------------------------------------------------------------------
// Deadline helpers — pure functions so they can be unit-tested without a DB.
// --------------------------------------------------------------------------

const BET_DEADLINE_MS = 60 * 60 * 1000; // 1 hour before match start

/** The UTC instant after which no new bets / edits are accepted. */
export function getBetDeadline(matchStartUtc: Date): Date {
  return new Date(matchStartUtc.getTime() - BET_DEADLINE_MS);
}

/** True when `now` is still before the bet deadline for a match. */
export function isBettingOpen(matchStartUtc: Date, now: Date = new Date()): boolean {
  return now < getBetDeadline(matchStartUtc);
}

/**
 * True when the Palat window is open:
 *   - The bet deadline has passed (can't Palat before bets lock).
 *   - The first innings has NOT yet been marked complete.
 */
export function isPalatWindowOpen(
  matchStartUtc: Date,
  firstInningsCompleteTimeUtc: Date | null,
  now: Date = new Date(),
): boolean {
  const deadlinePassed = now >= getBetDeadline(matchStartUtc);
  const firstInningsStillGoing =
    firstInningsCompleteTimeUtc === null || now < firstInningsCompleteTimeUtc;
  return deadlinePassed && firstInningsStillGoing;
}
