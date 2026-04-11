import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getLeague } from "@/lib/leagues";
import { getLeaguePlayers, getLeagueBans } from "@/lib/players";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { PlayerManagement } from "@/components/admin/player-management";

// Why: admin always needs fresh player data without stale cache.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ leagueId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { leagueId } = await params;
  const league = await getLeague(leagueId);
  if (!league) return { title: "League Players" };
  return { title: `${league.name} · Players | Admin` };
}

export default async function LeaguePlayersPage({ params }: PageProps) {
  const { leagueId } = await params;

  const league = await getLeague(leagueId);
  if (!league) notFound();

  // Why: parallel fetches — players, bans, groups, and teams are independent.
  const [players, bans, groups, teams] = await Promise.all([
    getLeaguePlayers(leagueId),
    getLeagueBans(leagueId),
    prisma.group.findMany({
      where: { leagueId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.leagueTeam.findMany({
      where: { leagueId },
      select: {
        team: { select: { id: true, name: true, shortName: true } },
      },
      orderBy: { team: { name: "asc" } },
    }),
  ]);

  // Why: client component needs serialisable dates (strings), not Date objects.
  const serialisablePlayers = players.map((p) => ({
    ...p,
    joinedAt: p.joinedAt.toISOString(),
  }));

  const serialisableBans = bans.map((b) => ({
    ...b,
    createdAt: b.createdAt.toISOString(),
  }));

  const teamList = teams.map((t) => t.team);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-2">
        <Link
          href={`/admin/league/${leagueId}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to league admin
        </Link>
      </div>

      <PageHeader
        title="Players"
        subtitle={`${league.name} ${league.seasonYear}`}
      >
        <span className="text-sm text-muted-foreground">
          {players.length} member{players.length !== 1 ? "s" : ""}
        </span>
      </PageHeader>

      <div className="mt-6">
        <PlayerManagement
          leagueId={leagueId}
          players={serialisablePlayers}
          bans={serialisableBans}
          groups={groups}
          teams={teamList}
        />
      </div>
    </div>
  );
}
