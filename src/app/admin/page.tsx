import Link from "next/link";
import type { Metadata } from "next";

import { getAllLeaguesWithCounts } from "@/lib/leagues";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Admin Dashboard | IPL FanBet",
};

// Why: force-dynamic so admin always sees fresh league data without stale cache.
export const dynamic = "force-dynamic";

const STATUS_VARIANTS = {
  pre_season: "default",
  active: "success",
  completed: "accent",
} as const;

const STATUS_LABELS: Record<string, string> = {
  pre_season: "Pre-season",
  active: "Active",
  completed: "Completed",
};

export default async function AdminDashboardPage() {
  const leagues = await getAllLeaguesWithCounts();

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage leagues, matches, groups, and players.
          </p>
        </div>
        <Link
          href="/admin/create-league"
          className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
        >
          Create League
        </Link>
      </div>

      {/* League list */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Leagues</h2>

        {leagues.length === 0 ? (
          <EmptyState
            title="No leagues yet"
            description="Create your first league to get started."
          >
            <Link
              href="/admin/create-league"
              className="text-sm font-medium text-accent hover:underline"
            >
              Create a league &rarr;
            </Link>
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {leagues.map((league) => (
              <LeagueCard key={league.id} league={league} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// Why: Extracted to keep the page component slim and the card reusable if
// the admin dashboard grows (e.g. recent activity, quick stats).
type LeagueSummary = Awaited<ReturnType<typeof getAllLeaguesWithCounts>>[number];

interface LeagueCardProps {
  league: LeagueSummary;
}

function LeagueCard({ league }: LeagueCardProps) {
  const variant = STATUS_VARIANTS[league.status] ?? "default";
  const label = STATUS_LABELS[league.status] ?? league.status;

  return (
    <Card className="flex flex-col gap-4">
      {/* Top row: name + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{league.name}</p>
          <p className="text-xs text-muted-foreground">
            Season {league.seasonYear}
          </p>
        </div>
        <Badge variant={variant}>{label}</Badge>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{league._count.matches} matches</span>
        <span className="text-border">&middot;</span>
        <span>{league._count.groups} groups</span>
      </div>

      {/* Navigation links */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <NavLink href={`/admin/league/${league.id}`}>Manage Matches</NavLink>
        <NavLink href={`/admin/league/${league.id}/groups`}>
          View Groups
        </NavLink>
        <NavLink href={`/admin/league/${league.id}/players`}>
          Manage Players
        </NavLink>
      </div>
    </Card>
  );
}

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
}

// Why: small styled link used only inside league cards; keeps the
// card markup readable without repeating Tailwind class strings.
function NavLink({ href, children }: NavLinkProps) {
  return (
    <Link
      href={href}
      className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
    >
      {children}
    </Link>
  );
}
