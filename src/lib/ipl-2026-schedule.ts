/**
 * Canonical IPL 2026 league-stage schedule (70 matches) and results through the
 * current point in the season. Used by `prisma/seed.ts` and
 * `prisma/sync-ipl-2026-league.ts` so dev seed data and production league syncs
 * do not diverge.
 *
 * Outcomes for completed fixtures are aligned with the official order on
 * ESPNcricinfo / IPL; dates use actual double-header times (3:30 PM IST first,
 * 7:30 PM IST second) expressed in UTC.
 */

export const IPL_2026_TEAM_KEYS = [
  "CSK",
  "MI",
  "RCB",
  "KKR",
  "DC",
  "SRH",
  "PBKS",
  "RR",
  "GT",
  "LSG",
] as const;

export type IplTeamKey = (typeof IPL_2026_TEAM_KEYS)[number];

export type IplFixtureOutcome =
  | "team1_win"
  | "team2_win"
  | "abandoned"
  | "upcoming"
  | "live_first_innings";

export interface Ipl2026Fixture {
  matchNumber: number;
  team1: IplTeamKey;
  team2: IplTeamKey;
  startTimeUtc: Date;
  outcome: IplFixtureOutcome;
}

/** Build a UTC `Date` in the IPL 2026 window (late March–May). */
export function ipl2026MatchDate(
  month: number,
  day: number,
  hourUtc: number,
): Date {
  return new Date(Date.UTC(2026, month - 1, day, hourUtc, 0, 0));
}

/**
 * Full league stage: 70 matches. Completed results updated through 2026-04-26
 * (match 38). Match 39+ remain `upcoming` until the next sync after those
 * fixtures finish (e.g. DC vs RCB on 2026-04-27 was still pre-result when this
 * was last verified against ESPNcricinfo).
 */
export function buildIpl2026Fixtures(): Ipl2026Fixture[] {
  const d = ipl2026MatchDate;
  return [
    { matchNumber: 1, team1: "RCB", team2: "SRH", startTimeUtc: d(3, 28, 14), outcome: "team1_win" },
    { matchNumber: 2, team1: "KKR", team2: "MI", startTimeUtc: d(3, 29, 14), outcome: "team2_win" },
    { matchNumber: 3, team1: "CSK", team2: "RR", startTimeUtc: d(3, 30, 14), outcome: "team2_win" },
    { matchNumber: 4, team1: "GT", team2: "PBKS", startTimeUtc: d(3, 31, 14), outcome: "team2_win" },
    { matchNumber: 5, team1: "DC", team2: "LSG", startTimeUtc: d(4, 1, 14), outcome: "team1_win" },
    { matchNumber: 6, team1: "KKR", team2: "SRH", startTimeUtc: d(4, 2, 14), outcome: "team2_win" },
    { matchNumber: 7, team1: "CSK", team2: "PBKS", startTimeUtc: d(4, 3, 14), outcome: "team2_win" },
    { matchNumber: 8, team1: "DC", team2: "MI", startTimeUtc: d(4, 4, 10), outcome: "team1_win" },
    { matchNumber: 9, team1: "GT", team2: "RR", startTimeUtc: d(4, 4, 14), outcome: "team2_win" },
    { matchNumber: 10, team1: "LSG", team2: "SRH", startTimeUtc: d(4, 5, 10), outcome: "team1_win" },
    { matchNumber: 11, team1: "CSK", team2: "RCB", startTimeUtc: d(4, 5, 14), outcome: "team2_win" },
    { matchNumber: 12, team1: "KKR", team2: "PBKS", startTimeUtc: d(4, 6, 14), outcome: "abandoned" },
    { matchNumber: 13, team1: "MI", team2: "RR", startTimeUtc: d(4, 7, 14), outcome: "team2_win" },
    { matchNumber: 14, team1: "DC", team2: "GT", startTimeUtc: d(4, 8, 14), outcome: "team2_win" },
    { matchNumber: 15, team1: "KKR", team2: "LSG", startTimeUtc: d(4, 9, 14), outcome: "team2_win" },
    { matchNumber: 16, team1: "RCB", team2: "RR", startTimeUtc: d(4, 10, 14), outcome: "team2_win" },
    { matchNumber: 17, team1: "PBKS", team2: "SRH", startTimeUtc: d(4, 11, 10), outcome: "team1_win" },
    { matchNumber: 18, team1: "CSK", team2: "DC", startTimeUtc: d(4, 11, 14), outcome: "team1_win" },
    { matchNumber: 19, team1: "GT", team2: "LSG", startTimeUtc: d(4, 12, 10), outcome: "team1_win" },
    { matchNumber: 20, team1: "MI", team2: "RCB", startTimeUtc: d(4, 12, 14), outcome: "team2_win" },
    { matchNumber: 21, team1: "RR", team2: "SRH", startTimeUtc: d(4, 13, 14), outcome: "team2_win" },
    { matchNumber: 22, team1: "CSK", team2: "KKR", startTimeUtc: d(4, 14, 14), outcome: "team1_win" },
    { matchNumber: 23, team1: "LSG", team2: "RCB", startTimeUtc: d(4, 15, 14), outcome: "team2_win" },
    { matchNumber: 24, team1: "MI", team2: "PBKS", startTimeUtc: d(4, 16, 14), outcome: "team2_win" },
    { matchNumber: 25, team1: "GT", team2: "KKR", startTimeUtc: d(4, 17, 14), outcome: "team2_win" },
    { matchNumber: 26, team1: "DC", team2: "RCB", startTimeUtc: d(4, 18, 10), outcome: "team1_win" },
    { matchNumber: 27, team1: "CSK", team2: "SRH", startTimeUtc: d(4, 18, 14), outcome: "team2_win" },
    { matchNumber: 28, team1: "KKR", team2: "RR", startTimeUtc: d(4, 19, 10), outcome: "team1_win" },
    { matchNumber: 29, team1: "LSG", team2: "PBKS", startTimeUtc: d(4, 19, 14), outcome: "team2_win" },
    { matchNumber: 30, team1: "GT", team2: "MI", startTimeUtc: d(4, 20, 14), outcome: "team2_win" },
    { matchNumber: 31, team1: "DC", team2: "SRH", startTimeUtc: d(4, 21, 14), outcome: "team2_win" },
    { matchNumber: 32, team1: "LSG", team2: "RR", startTimeUtc: d(4, 22, 14), outcome: "team2_win" },
    { matchNumber: 33, team1: "CSK", team2: "MI", startTimeUtc: d(4, 23, 14), outcome: "team1_win" },
    { matchNumber: 34, team1: "GT", team2: "RCB", startTimeUtc: d(4, 24, 14), outcome: "team2_win" },
    { matchNumber: 35, team1: "DC", team2: "PBKS", startTimeUtc: d(4, 25, 10), outcome: "team2_win" },
    { matchNumber: 36, team1: "RR", team2: "SRH", startTimeUtc: d(4, 25, 14), outcome: "team2_win" },
    { matchNumber: 37, team1: "CSK", team2: "GT", startTimeUtc: d(4, 26, 10), outcome: "team2_win" },
    { matchNumber: 38, team1: "KKR", team2: "LSG", startTimeUtc: d(4, 26, 14), outcome: "team1_win" },
    { matchNumber: 39, team1: "DC", team2: "RCB", startTimeUtc: d(4, 27, 14), outcome: "upcoming" },
    { matchNumber: 40, team1: "PBKS", team2: "RR", startTimeUtc: d(4, 28, 14), outcome: "upcoming" },
    { matchNumber: 41, team1: "MI", team2: "SRH", startTimeUtc: d(4, 29, 14), outcome: "upcoming" },
    { matchNumber: 42, team1: "GT", team2: "RCB", startTimeUtc: d(4, 30, 14), outcome: "upcoming" },
    { matchNumber: 43, team1: "DC", team2: "RR", startTimeUtc: d(5, 1, 14), outcome: "upcoming" },
    { matchNumber: 44, team1: "CSK", team2: "MI", startTimeUtc: d(5, 2, 14), outcome: "upcoming" },
    { matchNumber: 45, team1: "KKR", team2: "SRH", startTimeUtc: d(5, 3, 10), outcome: "upcoming" },
    { matchNumber: 46, team1: "GT", team2: "PBKS", startTimeUtc: d(5, 3, 14), outcome: "upcoming" },
    { matchNumber: 47, team1: "LSG", team2: "MI", startTimeUtc: d(5, 4, 14), outcome: "upcoming" },
    { matchNumber: 48, team1: "CSK", team2: "DC", startTimeUtc: d(5, 5, 14), outcome: "upcoming" },
    { matchNumber: 49, team1: "PBKS", team2: "SRH", startTimeUtc: d(5, 6, 14), outcome: "upcoming" },
    { matchNumber: 50, team1: "LSG", team2: "RCB", startTimeUtc: d(5, 7, 14), outcome: "upcoming" },
    { matchNumber: 51, team1: "DC", team2: "KKR", startTimeUtc: d(5, 8, 14), outcome: "upcoming" },
    { matchNumber: 52, team1: "GT", team2: "RR", startTimeUtc: d(5, 9, 14), outcome: "upcoming" },
    { matchNumber: 53, team1: "CSK", team2: "LSG", startTimeUtc: d(5, 10, 10), outcome: "upcoming" },
    { matchNumber: 54, team1: "MI", team2: "RCB", startTimeUtc: d(5, 10, 14), outcome: "upcoming" },
    { matchNumber: 55, team1: "DC", team2: "PBKS", startTimeUtc: d(5, 11, 14), outcome: "upcoming" },
    { matchNumber: 56, team1: "GT", team2: "SRH", startTimeUtc: d(5, 12, 14), outcome: "upcoming" },
    { matchNumber: 57, team1: "KKR", team2: "RCB", startTimeUtc: d(5, 13, 14), outcome: "upcoming" },
    { matchNumber: 58, team1: "MI", team2: "PBKS", startTimeUtc: d(5, 14, 14), outcome: "upcoming" },
    { matchNumber: 59, team1: "CSK", team2: "LSG", startTimeUtc: d(5, 15, 14), outcome: "upcoming" },
    { matchNumber: 60, team1: "GT", team2: "KKR", startTimeUtc: d(5, 16, 14), outcome: "upcoming" },
    { matchNumber: 61, team1: "PBKS", team2: "RCB", startTimeUtc: d(5, 17, 10), outcome: "upcoming" },
    { matchNumber: 62, team1: "DC", team2: "RR", startTimeUtc: d(5, 17, 14), outcome: "upcoming" },
    { matchNumber: 63, team1: "CSK", team2: "SRH", startTimeUtc: d(5, 18, 14), outcome: "upcoming" },
    { matchNumber: 64, team1: "LSG", team2: "RR", startTimeUtc: d(5, 19, 14), outcome: "upcoming" },
    { matchNumber: 65, team1: "KKR", team2: "MI", startTimeUtc: d(5, 20, 14), outcome: "upcoming" },
    { matchNumber: 66, team1: "CSK", team2: "GT", startTimeUtc: d(5, 21, 14), outcome: "upcoming" },
    { matchNumber: 67, team1: "RCB", team2: "SRH", startTimeUtc: d(5, 22, 14), outcome: "upcoming" },
    { matchNumber: 68, team1: "LSG", team2: "PBKS", startTimeUtc: d(5, 23, 14), outcome: "upcoming" },
    { matchNumber: 69, team1: "MI", team2: "RR", startTimeUtc: d(5, 24, 10), outcome: "upcoming" },
    { matchNumber: 70, team1: "DC", team2: "KKR", startTimeUtc: d(5, 24, 14), outcome: "upcoming" },
  ];
}

export interface Ipl2026PrismaMatchRow {
  matchNumber: number;
  team1Id: string;
  team2Id: string;
  startTimeUtc: Date;
  result: "upcoming" | "team1_win" | "team2_win" | "draw" | "abandoned";
  status: "upcoming" | "live_first_innings" | "live_second_innings" | "completed" | "abandoned";
  winnerId: string | null;
}

/**
 * Map a fixture and per-franchise team ids (from `Team` rows) to Prisma
 * `Match` write shape.
 */
export function fixtureToPrismaMatchData(
  f: Ipl2026Fixture,
  teamIds: Record<IplTeamKey, string>,
): Ipl2026PrismaMatchRow {
  const team1Id = teamIds[f.team1];
  const team2Id = teamIds[f.team2];

  if (f.outcome === "abandoned") {
    return {
      matchNumber: f.matchNumber,
      team1Id,
      team2Id,
      startTimeUtc: f.startTimeUtc,
      result: "abandoned",
      status: "abandoned",
      winnerId: null,
    };
  }

  if (f.outcome === "live_first_innings") {
    return {
      matchNumber: f.matchNumber,
      team1Id,
      team2Id,
      startTimeUtc: f.startTimeUtc,
      result: "upcoming",
      status: "live_first_innings",
      winnerId: null,
    };
  }

  if (f.outcome === "upcoming") {
    return {
      matchNumber: f.matchNumber,
      team1Id,
      team2Id,
      startTimeUtc: f.startTimeUtc,
      result: "upcoming",
      status: "upcoming",
      winnerId: null,
    };
  }

  const winnerId = f.outcome === "team1_win" ? team1Id : team2Id;
  return {
    matchNumber: f.matchNumber,
    team1Id,
    team2Id,
    startTimeUtc: f.startTimeUtc,
    result: f.outcome,
    status: "completed",
    winnerId,
  };
}
