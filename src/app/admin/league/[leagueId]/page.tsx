import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeague } from "@/lib/leagues";
import { getMatchesForLeague } from "@/lib/matches";
import { LeagueAdminPanel } from "@/components/admin/league-admin-panel";

interface PageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueAdminPage({ params }: PageProps) {
  const { leagueId } = await params;

  const league = await getLeague(leagueId);
  if (!league) notFound();

  const matches = await getMatchesForLeague(leagueId);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Quick nav for admin sub-pages */}
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Home
        </Link>
        <Link
          href={`/admin/league/${leagueId}/groups`}
          className="text-sm font-medium text-accent hover:underline"
        >
          View Groups
        </Link>
      </div>
      <LeagueAdminPanel
        leagueId={leagueId}
        leagueName={`${league.name} ${league.seasonYear}`}
        matches={matches}
      />
    </div>
  );
}
