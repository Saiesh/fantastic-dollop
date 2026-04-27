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
  // Why: optional admin override URL (legacy); live scores use gemini-live-data.
  espncricinfoUrl: true,
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
    espncricinfoUrl: row.espncricinfoUrl,
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

/** Team short names for deadline overrides that depend on the fixture identity. */
export interface MatchBettingTeams {
  team1Short: string;
  team2Short: string;
}

/**
 * DC vs RCB on 27 Apr 2026 (IST): keep betting open until 8:00 PM IST instead of
 * the usual 1 h before start — why: one-day ops override requested for that slate.
 * Applies only when `now` is still that same IST calendar day so the rule expires automatically.
 */
const PROMO_DC_RCB_2026_04_27_EIGHT_PM_IST_MS = Date.UTC(2026, 3, 27, 14, 30, 0);

function istCalendarDate(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const n = (type: Intl.DateTimeFormatPart["type"]) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: n("year"), month: n("month"), day: n("day") };
}

function extendedDcRcb27Apr2026Deadline(
  matchStartUtc: Date,
  teams: MatchBettingTeams | undefined,
  now: Date,
): Date | null {
  if (!teams) return null;
  const shorts = new Set([teams.team1Short, teams.team2Short]);
  if (!shorts.has("DC") || !shorts.has("RCB")) return null;

  const matchIst = istCalendarDate(matchStartUtc);
  if (matchIst.year !== 2026 || matchIst.month !== 4 || matchIst.day !== 27) {
    return null;
  }

  const nowIst = istCalendarDate(now);
  if (nowIst.year !== 2026 || nowIst.month !== 4 || nowIst.day !== 27) {
    return null;
  }

  return new Date(PROMO_DC_RCB_2026_04_27_EIGHT_PM_IST_MS);
}

/**
 * The UTC instant after which no new bets / edits are accepted.
 * When `teams`/`now` trigger a promo fixture, the deadline is the later of the
 * standard (T−1h) time and the promo close — why: extended window without shifting Palat earlier.
 */
export function getBetDeadline(
  matchStartUtc: Date,
  teams?: MatchBettingTeams,
  now: Date = new Date(),
): Date {
  const standard = new Date(matchStartUtc.getTime() - BET_DEADLINE_MS);
  const extended = extendedDcRcb27Apr2026Deadline(matchStartUtc, teams, now);
  if (!extended) return standard;
  return new Date(Math.max(standard.getTime(), extended.getTime()));
}

/** True when `now` is still before the bet deadline for a match. */
export function isBettingOpen(
  matchStartUtc: Date,
  now: Date = new Date(),
  teams?: MatchBettingTeams,
): boolean {
  return now < getBetDeadline(matchStartUtc, teams, now);
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
  teams?: MatchBettingTeams,
): boolean {
  const deadlinePassed = now >= getBetDeadline(matchStartUtc, teams, now);
  const firstInningsStillGoing =
    firstInningsCompleteTimeUtc === null || now < firstInningsCompleteTimeUtc;
  return deadlinePassed && firstInningsStillGoing;
}
