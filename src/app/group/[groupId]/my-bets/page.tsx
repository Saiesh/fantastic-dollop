import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Bets | IPL FanBet",
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

  // Why: join bets with match and team data for a rich history view.
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
          team1: { select: { id: true, name: true, shortName: true } },
          team2: { select: { id: true, name: true, shortName: true } },
        },
      },
    },
  });

  // Why: Fetch points earned per match for this user in one query.
  const matchIds = bets.map((b) => b.match.id);
  const ledgerEntries = matchIds.length > 0
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
      <PageHeader title="My Bets">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            {correctCount}/{bets.length} correct
          </span>
          <span className="font-semibold">{totalPoints} pts</span>
        </div>
      </PageHeader>

      {bets.length === 0 ? (
        <EmptyState
          title="No bets placed yet"
          description="Head to the dashboard to place bets on upcoming matches."
        >
          <Link
            href={`/group/${groupId}`}
            className="text-sm font-medium text-accent hover:underline"
          >
            Go to dashboard
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {bets.map((bet) => {
            const match = bet.match;
            const effectiveTeam = bet.hasPalated ? bet.palatTeamId : bet.selectedTeamId;
            const selectedTeamName =
              effectiveTeam === match.team1.id
                ? match.team1.shortName
                : match.team2.shortName;
            const isCompleted = match.status === "completed" || match.status === "abandoned";
            const isCorrect =
              match.result === "draw" || effectiveTeam === match.winnerId;
            const matchPoints = pointsByMatch.get(match.id) ?? 0;

            return (
              <Link key={bet.id} href={`/group/${groupId}/match/${match.id}`}>
                <Card className="flex items-center justify-between transition-colors hover:border-accent/30">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="shrink-0 text-xs font-mono text-muted-foreground">
                      #{match.matchNumber}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {match.team1.shortName} vs {match.team2.shortName}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-xs text-muted-foreground">
                          Picked: <span className="font-medium text-foreground">{selectedTeamName}</span>
                        </span>
                        {bet.betType === "double_down" ? (
                          <Badge variant="warning">2x</Badge>
                        ) : null}
                        {bet.hasPalated ? (
                          <Badge variant="accent">Palat</Badge>
                        ) : null}
                        {match.stage !== "league" ? (
                          <Badge variant="accent">{match.stage.replace("_", " ")}</Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {isCompleted ? (
                      <>
                        <p
                          className={
                            isCorrect
                              ? "text-lg font-bold text-success"
                              : "text-lg font-bold text-muted-foreground"
                          }
                        >
                          {matchPoints > 0 ? `+${matchPoints}` : matchPoints}
                        </p>
                        <Badge variant={isCorrect ? "success" : "destructive"}>
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
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
