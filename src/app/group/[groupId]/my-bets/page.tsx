import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Metadata } from "next";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Bets | IPL Fanbet",
};

interface PageProps {
  params: Promise<{ groupId: string }>;
}

export default async function MyBetsPage({ params }: PageProps) {
  const { groupId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/join");

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true },
  });
  if (!group) notFound();

  const bets = await prisma.bet.findMany({
    where: { userId: user.id, groupId },
    orderBy: { match: { matchNumber: "desc" } },
    select: {
      id: true,
      selectedTeamId: true,
      betType: true,
      hasPalated: true,
      palatTeamId: true,
      createdAt: true,
      match: {
        select: {
          id: true,
          matchNumber: true,
          startTimeUtc: true,
          stage: true,
          status: true,
          result: true,
          winnerId: true,
          team1: { select: { id: true, name: true, shortName: true, primaryColor: true } },
          team2: { select: { id: true, name: true, shortName: true, primaryColor: true } },
        },
      },
    },
  });

  const matchIds = bets.map((b) => b.match.id);
  const ledgerEntries =
    matchIds.length > 0
      ? await prisma.pointsLedger.findMany({
          where: { userId: user.id, groupId, matchId: { in: matchIds } },
          select: { matchId: true, source: true, points: true },
        })
      : [];

  const pointsByMatch = new Map<string, number>();
  for (const entry of ledgerEntries) {
    if (!entry.matchId) continue;
    pointsByMatch.set(
      entry.matchId,
      (pointsByMatch.get(entry.matchId) ?? 0) + entry.points,
    );
  }

  const totalPoints = bets.reduce(
    (sum, b) => sum + (pointsByMatch.get(b.match.id) ?? 0),
    0,
  );
  const correctCount = bets.filter((b) => {
    if (b.match.result === "draw") return true;
    const effectiveTeam = b.hasPalated ? b.palatTeamId : b.selectedTeamId;
    return effectiveTeam === b.match.winnerId;
  }).length;

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 -mx-4 border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:-mx-0 sm:rounded-xl sm:border sm:px-4">
        <PageHeader title="My bets">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {correctCount}/{bets.length} correct
            </span>
            <span className="font-bold tabular-nums text-accent">{totalPoints} pts</span>
          </div>
        </PageHeader>
      </div>

      {bets.length === 0 ? (
        <EmptyState
          title="No bets placed yet"
          description="Head to the dashboard to place bets on upcoming matches."
        >
          <Link href={`/group/${groupId}`} className="text-sm font-semibold text-accent hover:underline">
            Go to dashboard
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {bets.map((bet) => {
            const match = bet.match;
            const effectiveTeam = bet.hasPalated ? bet.palatTeamId : bet.selectedTeamId;
            const selectedTeamName =
              effectiveTeam === match.team1.id ? match.team1.shortName : match.team2.shortName;
            const accentColor =
              effectiveTeam === match.team1.id
                ? match.team1.primaryColor
                : match.team2.primaryColor;
            const isCompleted = match.status === "completed" || match.status === "abandoned";
            const isCorrect =
              match.result === "draw" || effectiveTeam === match.winnerId;
            const matchPoints = pointsByMatch.get(match.id) ?? 0;

            return (
              <Link key={bet.id} href={`/group/${groupId}/match/${match.id}`}>
                <div
                  className={cn(
                    "relative overflow-hidden rounded-xl border border-border/80 bg-card/90 pl-4 pr-3 py-4 transition hover:border-accent/40 hover:ring-1 hover:ring-accent/15",
                    !isCompleted && "border-dashed ring-1 ring-accent/25",
                    isCompleted &&
                      (isCorrect || match.result === "draw") &&
                      "shadow-md shadow-emerald-900/20 ring-1 ring-success/20",
                    isCompleted &&
                      !isCorrect &&
                      match.result !== "draw" &&
                      match.result !== "abandoned" &&
                      "opacity-75",
                  )}
                >
                  <div
                    className="absolute inset-y-0 left-0 w-1.5"
                    style={{ backgroundColor: accentColor ?? "var(--border)" }}
                    aria-hidden
                  />
                  <div className="flex items-center justify-between gap-3 pl-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">#{match.matchNumber}</span>
                        {bet.betType === "double_down" ? <Badge variant="warning">2x</Badge> : null}
                        {bet.hasPalated ? <Badge variant="accent">Palat</Badge> : null}
                        {match.stage !== "league" ? (
                          <Badge variant="accent">{match.stage.replace("_", " ")}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {match.team1.shortName} vs {match.team2.shortName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Picked{" "}
                        <span className="font-medium text-foreground">{selectedTeamName}</span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {isCompleted ? (
                        <>
                          <p
                            className={cn(
                              "text-lg font-bold tabular-nums",
                              isCorrect || match.result === "draw"
                                ? "text-success"
                                : "text-muted-foreground",
                            )}
                          >
                            {matchPoints > 0 ? `+${matchPoints}` : matchPoints}
                          </p>
                          <Badge variant={isCorrect || match.result === "draw" ? "success" : "destructive"}>
                            {match.result === "abandoned"
                              ? "Void"
                              : match.result === "draw"
                                ? "Draw"
                                : isCorrect
                                  ? "Won"
                                  : "Lost"}
                          </Badge>
                        </>
                      ) : (
                        <Badge>Pending</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
