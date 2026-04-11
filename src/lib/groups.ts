import "server-only";

import { prisma } from "@/lib/prisma";
import { getGroupLeaderboard } from "@/lib/leaderboard";
import type { MatchStage } from "@/generated/prisma";

// --------------------------------------------------------------------------
// Home team eligibility for late joiners (PRD Section 13).
//
// A team is "eliminated" if it has no remaining matches (upcoming status) in
// the league. During the league stage all teams still have fixtures, so every
// team is eligible. During playoffs only the surviving teams appear in upcoming
// matches. This naturally narrows the selection for late joiners.
// --------------------------------------------------------------------------

interface EligibleTeam {
  id: string;
  name: string;
  shortName: string;
}

/**
 * Returns the set of teams eligible for home-team selection in a league.
 * If the league hasn't started (no completed matches), all teams are eligible.
 * Once matches are underway, only teams that still appear in at least one
 * upcoming match are eligible — this filters out eliminated playoff teams
 * for late joiners (PRD §13).
 */
export async function getEligibleHomeTeams(
  leagueId: string,
): Promise<EligibleTeam[]> {
  const [allTeams, completedCount, upcomingMatches] = await Promise.all([
    prisma.leagueTeam.findMany({
      where: { leagueId },
      select: { team: { select: { id: true, name: true, shortName: true } } },
    }),
    prisma.match.count({
      where: { leagueId, status: { in: ["completed", "abandoned"] } },
    }),
    prisma.match.findMany({
      where: { leagueId, result: "upcoming" },
      select: { team1Id: true, team2Id: true },
    }),
  ]);

  // Why: Before any matches are played, all league teams are eligible.
  if (completedCount === 0) {
    return allTeams.map((lt) => lt.team);
  }

  // Why: After matches start, only teams with remaining fixtures are eligible.
  // This naturally excludes eliminated teams in the playoff stage.
  const teamsWithUpcoming = new Set<string>();
  for (const m of upcomingMatches) {
    teamsWithUpcoming.add(m.team1Id);
    teamsWithUpcoming.add(m.team2Id);
  }

  // If the season is fully completed (no upcoming matches), all teams were
  // eligible at some point — return all so the query doesn't return empty.
  if (teamsWithUpcoming.size === 0) {
    return allTeams.map((lt) => lt.team);
  }

  return allTeams
    .filter((lt) => teamsWithUpcoming.has(lt.team.id))
    .map((lt) => lt.team);
}

/**
 * Ensures a team is allowed as a home pick for this league (PRD §6.1 / §13).
 * Why: shared by join and `selectHomeTeam` so rules stay in one place.
 */
export async function validateHomeTeamChoice(
  leagueId: string,
  teamId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const firstStartedMatch = await prisma.match.findFirst({
    where: {
      leagueId,
      startTimeUtc: { lte: new Date() },
    },
    select: { id: true },
  });
  const leagueHasStarted = firstStartedMatch !== null;

  if (leagueHasStarted) {
    const eligible = await getEligibleHomeTeams(leagueId);
    const isEligible = eligible.some((t) => t.id === teamId);
    if (!isEligible) {
      return {
        ok: false,
        error:
          "This team has been eliminated and is no longer available for home team selection.",
      };
    }
  } else {
    const teamInLeague = await prisma.leagueTeam.findUnique({
      where: { leagueId_teamId: { leagueId, teamId } },
      select: { teamId: true },
    });
    if (!teamInLeague) {
      return { ok: false, error: "Selected team is not part of this league." };
    }
  }
  return { ok: true };
}

// Why: Organiser panel needs group details plus full member list
// with payment status and home team for the management view.
export async function getGroupWithMembers(groupId: string) {
  return prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      leagueId: true,
      inviteCode: true,
      buyInAmount: true,
      currency: true,
      organiserId: true,
      status: true,
      league: {
        select: { id: true, name: true, seasonYear: true, status: true },
      },
      memberships: {
        select: {
          id: true,
          userId: true,
          hasPaid: true,
          role: true,
          joinedAt: true,
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          homeTeam: { select: { id: true, name: true, shortName: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
}

// Why: Lightweight group fetch for authorization checks.
export async function getGroup(groupId: string) {
  return prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      leagueId: true,
      buyInAmount: true,
      currency: true,
      organiserId: true,
      status: true,
    },
  });
}

/** All groups a user belongs to, across all leagues. */
export async function getUserGroups(userId: string) {
  return prisma.groupMembership.findMany({
    where: { userId },
    select: {
      id: true,
      role: true,
      hasPaid: true,
      group: {
        select: {
          id: true,
          name: true,
          status: true,
          buyInAmount: true,
          currency: true,
          league: { select: { id: true, name: true, seasonYear: true } },
          _count: { select: { memberships: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });
}

interface UpcomingMatchWithBet {
  id: string;
  matchNumber: number;
  startTimeUtc: string;
  stage: MatchStage;
  team1: { id: string; name: string; shortName: string };
  team2: { id: string; name: string; shortName: string };
  existingBet: { teamShortName: string; isDoubleDown: boolean } | null;
}

/** Aggregated dashboard data for a group — avoids many individual queries. */
export async function getGroupDashboardData(groupId: string, userId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      leagueId: true,
      buyInAmount: true,
      currency: true,
      status: true,
      organiserId: true,
      league: { select: { name: true } },
      memberships: {
        select: { hasPaid: true },
      },
    },
  });

  if (!group) return null;

  const membership = await prisma.groupMembership.findFirst({
    where: { userId, groupId },
    select: {
      homeTeam: { select: { id: true, name: true, shortName: true } },
    },
  });

  if (!membership) return null;

  // Why parallel: upcoming matches, leaderboard, and player stats are independent.
  const [upcomingRaw, leaderboard, totalBets] = await Promise.all([
    prisma.match.findMany({
      where: { leagueId: group.leagueId, result: "upcoming" },
      orderBy: { startTimeUtc: "asc" },
      take: 4,
      select: {
        id: true,
        matchNumber: true,
        startTimeUtc: true,
        stage: true,
        team1: { select: { id: true, name: true, shortName: true } },
        team2: { select: { id: true, name: true, shortName: true } },
      },
    }),
    getGroupLeaderboard(groupId),
    prisma.bet.count({ where: { userId, groupId } }),
  ]);

  // Why batch bet lookups: one query for all upcoming match bets.
  const matchIds = upcomingRaw.map((m) => m.id);
  const existingBets = matchIds.length > 0
    ? await prisma.bet.findMany({
        where: { userId, groupId, matchId: { in: matchIds } },
        select: { matchId: true, selectedTeamId: true, betType: true },
      })
    : [];

  const betByMatch = new Map(existingBets.map((b) => [b.matchId, b]));

  const upcomingMatches: UpcomingMatchWithBet[] = upcomingRaw.map((m) => {
    const bet = betByMatch.get(m.id);
    return {
      id: m.id,
      matchNumber: m.matchNumber,
      startTimeUtc: m.startTimeUtc.toISOString(),
      stage: m.stage,
      team1: m.team1,
      team2: m.team2,
      existingBet: bet
        ? {
            teamShortName:
              bet.selectedTeamId === m.team1.id
                ? m.team1.shortName
                : m.team2.shortName,
            isDoubleDown: bet.betType === "double_down",
          }
        : null,
    };
  });

  const playerRow = leaderboard?.rows.find((r) => r.userId === userId);

  const paidCount = group.memberships.filter((m) => m.hasPaid).length;

  return {
    group: {
      ...group,
      paidCount,
      totalMembers: group.memberships.length,
    },
    membership,
    upcomingMatches,
    leaderboardTop5: leaderboard?.rows.slice(0, 5) ?? [],
    playerStats: {
      totalPoints: playerRow?.totalPoints ?? 0,
      currentStreak: playerRow?.currentStreak ?? 0,
      correctPredictions: playerRow?.correctPredictions ?? 0,
      palatLeagueRemaining: playerRow?.palatLeagueRemaining ?? 7,
      palatLeagueMax: playerRow?.palatLeagueMax ?? 7,
      totalBets,
    },
  };
}
