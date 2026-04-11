import { LeaderboardLiveRefresh } from "@/components/leaderboard/leaderboard-live-refresh";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { getGroupLeaderboard } from "@/lib/leaderboard";
import { TeamPointsTableView } from "@/components/leaderboard/team-points-table";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ groupId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { groupId } = await params;
  const board = await getGroupLeaderboard(groupId);
  if (!board) return { title: "Leaderboard" };
  return {
    title: `${board.groupName} · Leaderboard`,
    description: `Standings for ${board.leagueName} — ${board.groupName}`,
  };
}

export default async function GroupLeaderboardPage({ params }: PageProps) {
  const { groupId } = await params;

  const data = await getGroupLeaderboard(groupId);
  if (!data) notFound();

  // Why: fetch team standings for the league-level tab alongside player leaderboard.
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { leagueId: true },
  });
  const teamStandings = group
    ? await prisma.teamPointsTable.findMany({
        where: { leagueId: group.leagueId },
        orderBy: { rank: "asc" },
        select: {
          rank: true,
          matchesPlayed: true,
          wins: true,
          losses: true,
          draws: true,
          noResults: true,
          netRunRate: true,
          points: true,
          team: { select: { name: true, shortName: true, primaryColor: true } },
        },
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title={data.groupName} subtitle={data.leagueName}>
        <LeaderboardLiveRefresh className="text-xs text-muted-foreground" />
      </PageHeader>

      <LeaderboardTable data={data} />

      {/* Team Points Table */}
      {teamStandings.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold mb-4">IPL Team Standings</h2>
          <TeamPointsTableView standings={teamStandings} />
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Tie-breakers: higher total points, then more correct predictions, then more
        double-down wins, then name (A–Z). Last updated{" "}
        {new Date(data.computedAt).toLocaleString()}.
      </p>
    </div>
  );
}
