import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { PointSource } from "@/generated/prisma";
import type { Metadata } from "next";
import { cn, formatMatchDate, formatMatchTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Points Ledger | IPL Fanbet",
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

/** Why: quick visual scan in a vertical timeline without relying on a wide table on mobile. */
const SOURCE_MARK: Record<PointSource, string> = {
  bet: "◎",
  palat_bet: "↻",
  double_down_bet: "✦",
  draw: "═",
  home_team_win: "♥",
  streak_birdie: "◇",
  streak_eagle: "◆",
  streak_albatross: "★",
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
      <PageHeader title="Points ledger" subtitle="Full audit trail of point awards">
        <span className="text-xs text-muted-foreground">{entries.length} entries</span>
      </PageHeader>

      {entries.length === 0 ? (
        <EmptyState
          title="No points awarded yet"
          description="The ledger populates after the first match result is entered."
        />
      ) : (
        <ol className="relative space-y-0 border-l border-border/80 pl-6">
          {entries.map((entry) => (
            <li key={entry.id} className="relative pb-8 last:pb-0">
              <span
                className="absolute -left-1.5 top-1 flex h-3 w-3 -translate-x-1/2 rounded-full border-2 border-background bg-accent ring-2 ring-accent/40"
                aria-hidden
              />
              <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card/80 p-4 ring-1 ring-white/5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg" aria-hidden>
                      {SOURCE_MARK[entry.source]}
                    </span>
                    <Badge variant={SOURCE_VARIANTS[entry.source]}>{SOURCE_LABELS[entry.source]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatMatchDate(entry.createdAt, {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      {formatMatchTime(entry.createdAt)}
                    </span>
                  </div>
                  <p className="font-semibold text-foreground">{entry.user.displayName}</p>
                  {entry.match ? (
                    <p className="text-xs text-muted-foreground">
                      Match #{entry.match.matchNumber}{" "}
                      <span className="text-foreground">
                        {entry.match.team1.shortName} vs {entry.match.team2.shortName}
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">League / streak award</p>
                  )}
                </div>
                <div className="shrink-0 text-right sm:pt-1">
                  <p
                    className={cn(
                      "text-2xl font-black tabular-nums",
                      entry.points > 0
                        ? "text-success"
                        : entry.points < 0
                          ? "text-destructive"
                          : "text-muted-foreground",
                    )}
                  >
                    {entry.points > 0 ? `+${entry.points}` : entry.points}
                  </p>
                  <p className="text-xs font-medium text-muted-foreground">points</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
