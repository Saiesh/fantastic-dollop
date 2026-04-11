import "server-only";

import { PointSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { GroupLeaderboardDTO, LeaderboardRowDTO } from "@/types/leaderboard";

/** Ledger sources that count toward “Bet Points” in PRD §6.6 (match betting + draws). */
const BET_POINT_SOURCES: PointSource[] = [
  PointSource.bet,
  PointSource.palat_bet,
  PointSource.double_down_bet,
  PointSource.draw,
];

const STREAK_SOURCES: PointSource[] = [
  PointSource.streak_birdie,
  PointSource.streak_eagle,
  PointSource.streak_albatross,
];

/** Sources used for tiebreaker “correct predictions” — distinct matches with a positive betting outcome. */
const CORRECT_PREDICTION_SOURCES: PointSource[] = [
  PointSource.bet,
  PointSource.palat_bet,
  PointSource.double_down_bet,
  PointSource.draw,
];

const DEFAULT_LEAGUE_PALAT_MAX = 7;
const DEFAULT_PLAYOFF_PALAT_MAX = 1;

/**
 * Orders players for the leaderboard: total points, then PRD §6.6 tie-breakers,
 * then name so ordering is deterministic for auditors.
 */
export function compareLeaderboardRows(a: LeaderboardRowDTO, b: LeaderboardRowDTO): number {
  if (b.totalPoints !== a.totalPoints) {
    return b.totalPoints - a.totalPoints;
  }
  if (b.correctPredictions !== a.correctPredictions) {
    return b.correctPredictions - a.correctPredictions;
  }
  if (b.doubleDownWins !== a.doubleDownWins) {
    return b.doubleDownWins - a.doubleDownWins;
  }
  return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
}

/**
 * Competition ranking: tied players share the same rank; next rank skips (1,1,3).
 * Keeps leaderboard fair when totals match after tie-breakers.
 */
export function assignCompetitionRanks(sorted: LeaderboardRowDTO[]): LeaderboardRowDTO[] {
  const out: LeaderboardRowDTO[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rank =
      i > 0 && compareLeaderboardRows(sorted[i - 1]!, sorted[i]!) === 0
        ? out[i - 1]!.rank
        : i + 1;
    out.push({ ...sorted[i]!, rank });
  }
  return out;
}

/**
 * Loads group metadata, aggregates PointsLedger per member, applies tie-breakers,
 * and returns a full leaderboard — always derived from current DB state (PRD §5.4).
 */
export async function getGroupLeaderboard(groupId: string): Promise<GroupLeaderboardDTO | null> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      league: { select: { name: true } },
    },
  });

  if (!group) {
    return null;
  }

  const memberships = await prisma.groupMembership.findMany({
    where: { groupId },
    select: {
      userId: true,
      user: {
        select: { displayName: true, avatarUrl: true },
      },
      homeTeam: {
        select: { shortName: true, primaryColor: true },
      },
    },
  });

  const userIds = memberships.map((m) => m.userId);

  const [ledgerGrouped, predictionRows, doubleDownRows, streaks, palatUsages] = await Promise.all([
    prisma.pointsLedger.groupBy({
      by: ["userId", "source"],
      where: { groupId, userId: { in: userIds } },
      _sum: { points: true },
    }),
    prisma.pointsLedger.findMany({
      where: {
        groupId,
        userId: { in: userIds },
        matchId: { not: null },
        source: { in: CORRECT_PREDICTION_SOURCES },
        points: { gt: 0 },
      },
      select: { userId: true, matchId: true },
    }),
    prisma.pointsLedger.findMany({
      where: {
        groupId,
        userId: { in: userIds },
        source: PointSource.double_down_bet,
        points: { gt: 0 },
      },
      select: { userId: true, matchId: true },
    }),
    prisma.streak.findMany({
      where: { groupId, userId: { in: userIds } },
      select: { userId: true, currentStreak: true },
    }),
    prisma.palatUsage.findMany({
      where: { groupId, userId: { in: userIds } },
      select: { userId: true, stage: true, usedCount: true, maxAllowed: true },
    }),
  ]);

  const pointsByUser = new Map<string, Partial<Record<PointSource, number>>>();

  for (const row of ledgerGrouped) {
    const uid = row.userId;
    const src = row.source;
    const pts = row._sum.points ?? 0;
    const existing = pointsByUser.get(uid) ?? {};
    existing[src] = pts;
    pointsByUser.set(uid, existing);
  }

  const correctByUser = new Map<string, Set<string>>();
  for (const row of predictionRows) {
    if (!row.matchId) {
      continue;
    }
    let set = correctByUser.get(row.userId);
    if (!set) {
      set = new Set();
      correctByUser.set(row.userId, set);
    }
    set.add(row.matchId);
  }

  const doubleDownByUser = new Map<string, number>();
  for (const row of doubleDownRows) {
    doubleDownByUser.set(row.userId, (doubleDownByUser.get(row.userId) ?? 0) + 1);
  }

  const streakByUser = new Map(streaks.map((s) => [s.userId, s.currentStreak] as const));

  const palatMap = new Map<
    string,
    { league: { used: number; max: number }; playoffs: { used: number; max: number } }
  >();

  for (const uid of userIds) {
    palatMap.set(uid, {
      league: { used: 0, max: DEFAULT_LEAGUE_PALAT_MAX },
      playoffs: { used: 0, max: DEFAULT_PLAYOFF_PALAT_MAX },
    });
  }

  for (const u of palatUsages) {
    const entry = palatMap.get(u.userId);
    if (!entry) {
      continue;
    }
    if (u.stage === "league") {
      entry.league = { used: u.usedCount, max: u.maxAllowed };
    } else {
      entry.playoffs = { used: u.usedCount, max: u.maxAllowed };
    }
  }

  const rows: LeaderboardRowDTO[] = memberships.map((m) => {
    const srcMap = pointsByUser.get(m.userId) ?? {};

    let betPoints = 0;
    for (const s of BET_POINT_SOURCES) {
      betPoints += srcMap[s] ?? 0;
    }

    let streakBonusPoints = 0;
    for (const s of STREAK_SOURCES) {
      streakBonusPoints += srcMap[s] ?? 0;
    }

    const homeTeamPoints = srcMap[PointSource.home_team_win] ?? 0;
    const totalPoints = betPoints + streakBonusPoints + homeTeamPoints;

    const palat = palatMap.get(m.userId)!;

    return {
      rank: 0,
      userId: m.userId,
      displayName: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
      homeTeamShortName: m.homeTeam?.shortName ?? null,
      homeTeamPrimaryColor: m.homeTeam?.primaryColor ?? null,
      betPoints,
      streakBonusPoints,
      homeTeamPoints,
      totalPoints,
      correctPredictions: correctByUser.get(m.userId)?.size ?? 0,
      doubleDownWins: doubleDownByUser.get(m.userId) ?? 0,
      currentStreak: streakByUser.get(m.userId) ?? 0,
      palatLeagueRemaining: Math.max(0, palat.league.max - palat.league.used),
      palatLeagueMax: palat.league.max,
      palatPlayoffRemaining: Math.max(0, palat.playoffs.max - palat.playoffs.used),
      palatPlayoffMax: palat.playoffs.max,
    };
  });

  const sorted = [...rows].sort(compareLeaderboardRows);
  const ranked = assignCompetitionRanks(sorted);

  return {
    groupId: group.id,
    groupName: group.name,
    leagueName: group.league.name,
    rows: ranked,
    computedAt: new Date().toISOString(),
  };
}
