import "server-only";

import type { MemberRole } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

/**
 * One row per group membership in the league — users appear once per group they belong to.
 * Why: Admin player management needs identity, group context, home team, and payment flags together.
 */
export interface LeaguePlayerMembership {
  id: string;
  userId: string;
  role: MemberRole;
  hasPaid: boolean;
  joinedAt: Date;
  user: {
    displayName: string;
    avatarUrl: string | null;
  };
  group: {
    id: string;
    name: string;
  };
  homeTeam: {
    id: string;
    name: string;
    shortName: string;
  };
}

/**
 * A league-level ban with the banned user's display name for admin UI.
 * Why: Separates ban list from active memberships while keeping enough context to act on rows.
 */
export interface LeagueBanRow {
  id: string;
  userId: string;
  leagueId: string;
  reason: string | null;
  createdAt: Date;
  user: {
    displayName: string;
  };
}

// Why: `leagueId` on GroupMembership matches all members across every group in the league.
export async function getLeaguePlayers(
  leagueId: string,
): Promise<LeaguePlayerMembership[]> {
  return prisma.groupMembership.findMany({
    where: { leagueId },
    select: {
      id: true,
      userId: true,
      role: true,
      hasPaid: true,
      joinedAt: true,
      user: {
        select: { displayName: true, avatarUrl: true },
      },
      group: {
        select: { id: true, name: true },
      },
      homeTeam: {
        select: { id: true, name: true, shortName: true },
      },
    },
    orderBy: [{ group: { name: "asc" } }, { joinedAt: "asc" }],
  });
}

// Why: Bans are league-scoped; listing them drives the "banned players" section separate from memberships.
export async function getLeagueBans(leagueId: string): Promise<LeagueBanRow[]> {
  return prisma.leagueBan.findMany({
    where: { leagueId },
    select: {
      id: true,
      userId: true,
      leagueId: true,
      reason: true,
      createdAt: true,
      user: {
        select: { displayName: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
