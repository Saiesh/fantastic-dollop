import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session";
import { getMatchById, isBettingOpen, isPalatWindowOpen } from "@/lib/matches";
import { getUserBetForMatch } from "@/lib/bets";
import { getOrCreatePalatUsage, palatStageForMatch } from "@/lib/palat";
import { prisma } from "@/lib/prisma";
import { BetForm } from "@/components/match/bet-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ groupId: string; matchId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { matchId } = await params;
  const match = await getMatchById(matchId);
  if (!match) return { title: "Match" };
  return {
    title: `${match.team1.shortName} vs ${match.team2.shortName} · Match #${match.matchNumber}`,
  };
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { groupId, matchId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/join");

  const match = await getMatchById(matchId);
  if (!match) notFound();

  // Why: verify the group belongs to the same league as the match.
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { leagueId: true },
  });
  if (!group || group.leagueId !== match.leagueId) notFound();

  const startDate = new Date(match.startTimeUtc);
  const firstInnings = match.firstInningsCompleteTimeUtc
    ? new Date(match.firstInningsCompleteTimeUtc)
    : null;

  const bettingOpen = isBettingOpen(startDate);
  const palatOpen = isPalatWindowOpen(startDate, firstInnings);

  const [existingBet, palatUsage] = await Promise.all([
    getUserBetForMatch(user.id, matchId, groupId),
    getOrCreatePalatUsage(user.id, groupId, palatStageForMatch(match.stage)),
  ]);

  const deadline = new Date(startDate.getTime() - 60 * 60 * 1000);
  const now = new Date();
  const msUntilDeadline = deadline.getTime() - now.getTime();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Match Header */}
      <Card className="text-center">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-mono text-muted-foreground">
            Match #{match.matchNumber}
          </span>
          <div className="flex items-center gap-2">
            {match.stage !== "league" ? (
              <Badge variant="accent">{match.stage.replace("_", " ")}</Badge>
            ) : null}
            <Badge
              variant={
                match.status === "completed"
                  ? "success"
                  : match.status === "upcoming"
                    ? "default"
                    : "warning"
              }
            >
              {match.status === "live_first_innings"
                ? "1st Innings"
                : match.status === "live_second_innings"
                  ? "2nd Innings"
                  : match.status}
            </Badge>
          </div>
        </div>

        <div className="flex items-center justify-center gap-8 py-6">
          <div className="text-center">
            {match.team1.primaryColor ? (
              <div
                className="mx-auto mb-2 h-10 w-10 rounded-full"
                style={{ backgroundColor: match.team1.primaryColor }}
              />
            ) : null}
            <p className="text-2xl font-bold">{match.team1.shortName}</p>
            <p className="text-xs text-muted-foreground">{match.team1.name}</p>
          </div>
          <span className="text-lg text-muted-foreground">vs</span>
          <div className="text-center">
            {match.team2.primaryColor ? (
              <div
                className="mx-auto mb-2 h-10 w-10 rounded-full"
                style={{ backgroundColor: match.team2.primaryColor }}
              />
            ) : null}
            <p className="text-2xl font-bold">{match.team2.shortName}</p>
            <p className="text-xs text-muted-foreground">{match.team2.name}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {startDate.toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {" at "}
          {startDate.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>

        {/* Winner display for completed matches */}
        {match.winnerId ? (
          <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-700 dark:bg-green-950/30 dark:text-green-400">
            {match.winnerId === match.team1.id
              ? match.team1.name
              : match.team2.name}{" "}
            won!
          </div>
        ) : null}

        {match.status === "upcoming" && match.winnerId === null ? (
          <div className="mt-4 rounded-lg bg-muted p-3">
            {msUntilDeadline > 0 ? (
              <p className="text-sm text-muted-foreground">
                Betting closes{" "}
                <span className="font-medium text-foreground">
                  {deadline.toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {" "}({formatTimeUntil(msUntilDeadline)} from now)
              </p>
            ) : (
              <p className="text-sm text-warning font-medium">
                Betting is closed
              </p>
            )}
          </div>
        ) : null}
      </Card>

      {/* Bet Form */}
      <BetForm
        userId={user.id}
        groupId={groupId}
        matchId={matchId}
        team1={match.team1}
        team2={match.team2}
        isBettingOpen={bettingOpen}
        isPalatWindowOpen={palatOpen}
        existingBet={existingBet}
        palatUsage={palatUsage}
      />

      {/* Points Guide */}
      <Card>
        <h3 className="text-sm font-semibold mb-3">Points Guide</h3>
        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Correct prediction</dt>
            <dd className="font-medium">+2 pts</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Double Down correct</dt>
            <dd className="font-medium">+4 pts</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Palat correct</dt>
            <dd className="font-medium">+1 pt</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Draw (all betters)</dt>
            <dd className="font-medium">+1 pt</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Incorrect / missed</dt>
            <dd className="font-medium text-muted-foreground">0 pts</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

function formatTimeUntil(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
