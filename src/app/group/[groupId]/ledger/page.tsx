import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { PointSource } from "@/generated/prisma";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Points Ledger | IPL FanBet",
};

interface PageProps {
  params: Promise<{ groupId: string }>;
}

const SOURCE_LABELS: Record<PointSource, string> = {
  bet: "Correct Bet",
  palat_bet: "Palat Bet",
  double_down_bet: "Double Down",
  draw: "Draw",
  home_team_win: "Home Team Win",
  streak_birdie: "Birdie (3-streak)",
  streak_eagle: "Eagle (4-streak)",
  streak_albatross: "Albatross (5+-streak)",
};

const SOURCE_VARIANTS: Record<PointSource, "success" | "accent" | "warning" | "default"> = {
  bet: "success",
  palat_bet: "accent",
  double_down_bet: "warning",
  draw: "default",
  home_team_win: "success",
  streak_birdie: "accent",
  streak_eagle: "accent",
  streak_albatross: "accent",
};

export default async function PointsLedgerPage({ params }: PageProps) {
  const { groupId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/join");

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true },
  });
  if (!group) notFound();

  // Why: full audit trail — fetch all ledger entries for the group with player + match context.
  const entries = await prisma.pointsLedger.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      matchId: true,
      source: true,
      points: true,
      createdAt: true,
      user: { select: { displayName: true } },
      match: {
        select: {
          matchNumber: true,
          team1: { select: { shortName: true } },
          team2: { select: { shortName: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Points Ledger"
        subtitle="Full audit trail of all point awards"
      >
        <span className="text-xs text-muted-foreground">
          {entries.length} entries
        </span>
      </PageHeader>

      {entries.length === 0 ? (
        <EmptyState
          title="No points awarded yet"
          description="The ledger populates after the first match result is entered."
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-left">Match</th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {entry.createdAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      {entry.createdAt.toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5 font-medium">
                      {entry.user.displayName}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {entry.match ? (
                        <span>
                          #{entry.match.matchNumber}{" "}
                          <span className="text-foreground">
                            {entry.match.team1.shortName} vs {entry.match.team2.shortName}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={SOURCE_VARIANTS[entry.source]}>
                        {SOURCE_LABELS[entry.source]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                      <span
                        className={
                          entry.points > 0
                            ? "text-success"
                            : entry.points < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        {entry.points > 0 ? `+${entry.points}` : entry.points}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
