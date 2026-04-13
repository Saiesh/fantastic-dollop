import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session";
import { getMatchById, isBettingOpen, isPalatWindowOpen } from "@/lib/matches";
import { getGroupBetsForMatch, getUserBetForMatch } from "@/lib/bets";
import { getOrCreatePalatUsage, palatStageForMatch } from "@/lib/palat";
import { prisma } from "@/lib/prisma";
import { GroupBets } from "@/components/match/group-bets";
import { MatchLiveSection } from "@/components/match/match-live-section";
import { MatchPageAutoRefresh } from "@/components/match/match-page-auto-refresh";
import { MatchTrivia } from "@/components/match/match-trivia";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import type { Metadata } from "next";
import type { BetType, MatchStatus } from "@/generated/prisma";
import { cn, formatMatchDate, formatMatchTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ groupId: string; matchId: string }>;
}

function isLiveStatus(status: MatchStatus): boolean {
  return status === "live_first_innings" || status === "live_second_innings";
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

  const deadline = new Date(startDate.getTime() - 60 * 60 * 1000);
  const deadlineIso = deadline.toISOString();
  const now = new Date();
  const msUntilDeadline = deadline.getTime() - now.getTime();
  // Why: align visibility with the plan — picks hidden only while match is still upcoming and pre-deadline.
  const isBettingLocked = msUntilDeadline <= 0 || match.status !== "upcoming";

  const [existingBet, palatUsage, groupBets, totalGroupMembers] = await Promise.all([
    getUserBetForMatch(user.id, matchId, groupId),
    getOrCreatePalatUsage(user.id, groupId, palatStageForMatch(match.stage)),
    getGroupBetsForMatch(matchId, groupId),
    prisma.groupMembership.count({ where: { groupId } }),
  ]);

  // Why: trivia section is shown only while betting is still open (>1 h before
  // match) so it appears alongside the bet form as pre-match context.
  const showTrivia = bettingOpen && match.status === "upcoming";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Silently re-fetches server components while outcome is uncertain */}
      <MatchPageAutoRefresh matchStatus={match.status} />

      {/* ------------------------------------------------------------------ */}
      {/* Match header card                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Card className="overflow-hidden p-0 text-center">
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-2">
          <span className="font-mono text-xs text-muted-foreground">Match #{match.matchNumber}</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isLiveStatus(match.status) ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 text-xs font-bold uppercase text-live ring-1 ring-live/35">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
                </span>
                Live
              </span>
            ) : null}
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
                ? "1st innings"
                : match.status === "live_second_innings"
                  ? "2nd innings"
                  : match.status}
            </Badge>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 px-4 py-8 sm:gap-10">
          <div className="text-center">
            {match.team1.primaryColor ? (
              <div
                className="mx-auto mb-2 h-14 w-14 rounded-full ring-2 ring-white/10"
                style={{ backgroundColor: match.team1.primaryColor }}
              />
            ) : null}
            <p className="text-2xl font-black text-foreground">{match.team1.shortName}</p>
            <p className="mt-1 text-xs text-muted-foreground">{match.team1.name}</p>
          </div>
          <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">vs</span>
          <div className="text-center">
            {match.team2.primaryColor ? (
              <div
                className="mx-auto mb-2 h-14 w-14 rounded-full ring-2 ring-white/10"
                style={{ backgroundColor: match.team2.primaryColor }}
              />
            ) : null}
            <p className="text-2xl font-black text-foreground">{match.team2.shortName}</p>
            <p className="mt-1 text-xs text-muted-foreground">{match.team2.name}</p>
          </div>
        </div>

        <p className="px-4 text-sm text-muted-foreground">
          {formatMatchDate(startDate, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {" · "}
          {formatMatchTime(startDate)}
        </p>

        {match.winnerId ? (
          <div className="mx-4 mt-4 rounded-xl bg-success/15 px-3 py-3 text-sm font-bold text-success ring-1 ring-success/30">
            {match.winnerId === match.team1.id ? match.team1.name : match.team2.name} won
          </div>
        ) : null}

        {match.status === "upcoming" && match.winnerId === null ? (
          <div className="mx-4 mt-4 rounded-xl border border-border/80 bg-muted/30 p-4">
            {msUntilDeadline > 0 ? (
              <p className="text-sm text-muted-foreground">
                Betting closes{" "}
                <span className="font-semibold text-foreground">
                  {formatMatchTime(deadline)}
                </span>
                {" · "}
                <span className="font-semibold text-foreground">
                  <Countdown targetIso={deadlineIso} />
                </span>{" "}
                left
              </p>
            ) : (
              <p className={cn("text-sm font-semibold", "text-warning")}>Betting is closed</p>
            )}
          </div>
        ) : null}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Some Trivia — shown for upcoming matches where betting is open      */}
      {/* ------------------------------------------------------------------ */}
      {showTrivia ? (
        <MatchTrivia
          matchId={matchId}
          team1Name={match.team1.name}
          team2Name={match.team2.name}
          startTimeUtc={match.startTimeUtc}
        />
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Live score + Bet form — coordinated via MatchLiveSection client     */}
      {/* wrapper so Cricinfo-detected innings end can disable Palat in-UI.   */}
      {/* ------------------------------------------------------------------ */}
      <MatchLiveSection
        matchId={matchId}
        matchStatus={match.status}
        initialFirstInningsComplete={match.firstInningsCompleteTimeUtc !== null}
        userId={user.id}
        groupId={groupId}
        team1={match.team1}
        team2={match.team2}
        isBettingOpen={bettingOpen}
        isPalatWindowOpen={palatOpen}
        existingBet={existingBet}
        palatUsage={palatUsage}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Group bets                                                          */}
      {/* ------------------------------------------------------------------ */}
      <GroupBets
        currentUserId={user.id}
        team1={match.team1}
        team2={match.team2}
        isBettingLocked={isBettingLocked}
        totalGroupMembers={totalGroupMembers}
        bets={groupBets.map((b) => ({
          ...b,
          betType: b.betType as BetType,
        }))}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Points guide                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <h3 className="mb-3 text-sm font-bold text-foreground">Points guide</h3>
        <dl className="space-y-2 text-xs">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Correct prediction</dt>
            <dd className="font-semibold tabular-nums text-foreground">+2</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Double Down correct</dt>
            <dd className="font-semibold tabular-nums text-accent">+4</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Palat correct</dt>
            <dd className="font-semibold tabular-nums text-accent-secondary">+1</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Draw (all bettors)</dt>
            <dd className="font-semibold tabular-nums text-foreground">+1</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Incorrect / missed</dt>
            <dd className="font-semibold text-muted-foreground">0</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
