import "server-only";

import { prisma } from "@/lib/prisma";

// Why: Fetches a league with its teams for admin display and validation.
export async function getLeagueWithTeams(leagueId: string) {
  return prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      seasonYear: true,
      status: true,
      teams: {
        select: {
          team: {
            select: { id: true, name: true, shortName: true },
          },
        },
      },
    },
  });
}

// Why: Lightweight fetch for league metadata without relations.
export async function getLeague(id: string) {
  return prisma.league.findUnique({
    where: { id },
    select: { id: true, name: true, seasonYear: true, status: true },
  });
}

// Why: The admin dashboard needs a summary of every league with aggregate
// counts (groups, matches, players) so admins can triage at a glance.
export async function getAllLeaguesWithCounts() {
  return prisma.league.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      seasonYear: true,
      status: true,
      createdAt: true,
      _count: {
        select: {
          groups: true,
          matches: true,
        },
      },
    },
  });
}
