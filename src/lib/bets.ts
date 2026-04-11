import "server-only";

import { prisma } from "@/lib/prisma";
import type { BetDTO } from "@/types/bets";

// --------------------------------------------------------------------------
// Bet queries — centralised read layer for bets scoped to a group.
// --------------------------------------------------------------------------

function toBetDTO(row: {
  id: string;
  userId: string;
  groupId: string;
  matchId: string;
  selectedTeamId: string;
  betType: string;
  hasPalated: boolean;
  palatTeamId: string | null;
  createdAt: Date;
  lockedAt: Date;
}): BetDTO {
  return {
    id: row.id,
    userId: row.userId,
    groupId: row.groupId,
    matchId: row.matchId,
    selectedTeamId: row.selectedTeamId,
    betType: row.betType as BetDTO["betType"],
    hasPalated: row.hasPalated,
    palatTeamId: row.palatTeamId,
    createdAt: row.createdAt.toISOString(),
    lockedAt: row.lockedAt.toISOString(),
  };
}

/** Get a user's bet on a specific match within a group (if any). */
export async function getUserBetForMatch(
  userId: string,
  matchId: string,
  groupId: string,
): Promise<BetDTO | null> {
  const row = await prisma.bet.findUnique({
    where: { userId_matchId_groupId: { userId, matchId, groupId } },
  });

  if (!row) return null;
  return toBetDTO(row);
}

/** All bets a user has placed within a group, newest first. */
export async function getUserBetsForGroup(
  userId: string,
  groupId: string,
): Promise<BetDTO[]> {
  const rows = await prisma.bet.findMany({
    where: { userId, groupId },
    orderBy: { createdAt: "desc" },
  });

  return rows.map(toBetDTO);
}

/** All bets on a specific match within a group (for scoring fan-out). */
export async function getBetsForMatch(
  matchId: string,
  groupId: string,
): Promise<BetDTO[]> {
  const rows = await prisma.bet.findMany({
    where: { matchId, groupId },
  });

  return rows.map(toBetDTO);
}

/** Plain row for UI that lists each member’s pick with display name and team label (no raw Prisma types). */
export interface GroupBetForMatchRow {
  userId: string;
  displayName: string;
  selectedTeamId: string;
  teamShortName: string;
  betType: string;
  hasPalated: boolean;
  palatTeamId: string | null;
}

/**
 * All bets for a match in a group, with user display name and selected team short name for the match page.
 * Joins are done in one query so the UI does not need separate user/team lookups.
 */
export async function getGroupBetsForMatch(
  matchId: string,
  groupId: string,
): Promise<GroupBetForMatchRow[]> {
  const rows = await prisma.bet.findMany({
    where: { matchId, groupId },
    include: {
      user: { select: { displayName: true } },
      selectedTeam: { select: { shortName: true } },
    },
    orderBy: { user: { displayName: "asc" } },
  });

  return rows.map((row) => ({
    userId: row.userId,
    displayName: row.user.displayName,
    selectedTeamId: row.selectedTeamId,
    teamShortName: row.selectedTeam.shortName,
    betType: row.betType,
    hasPalated: row.hasPalated,
    palatTeamId: row.palatTeamId,
  }));
}
