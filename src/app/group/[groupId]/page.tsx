import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session";
import { getGroupDashboardData } from "@/lib/groups";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Countdown } from "@/components/ui/countdown";
import { TeamBadge } from "@/components/ui/team-badge";
import { LeaderboardLiveRefresh } from "@/components/leaderboard/leaderboard-live-refresh";
import { cn, formatINR, formatMatchDate, formatMatchTime } from "@/lib/utils";
import type { MatchStatus } from "@/generated/prisma";

export const dynamic = "force-dynamic";

interface GroupPageProps {
  params: Promise<{ groupId: string }>;
}

function isLiveStatus(status: MatchStatus): boolean {
  return status === "live_first_innings" || status === "live_second_innings";
}

export default async function GroupDashboard({ params }: GroupPageProps) {
  const { groupId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/join");

  const data = await getGroupDashboardData(groupId, user.id);
  if (!data) notFound();

  const { group, membership, upcomingMatches, leaderboardTop5, playerStats } = data;

  const heroMatch = upcomingMatches[0] ?? null;
  const restMatches = upcomingMatches.slice(1, 4);
  const top3 = leaderboardTop5.slice(0, 3);

  // Auto-refresh the dashboard when any match is actively live so the Live
  // badge and status card update without a manual reload.
  const hasLiveMatch = upcomingMatches.some((m) => isLiveStatus(m.status));

  return (
    <div className="space-y-8">
      {/* Re-fetches server components every 60 s while a match is live so the
          Live badge, status, and leaderboard reflect cron-driven DB changes. */}
      {hasLiveMatch ? <LeaderboardLiveRefresh intervalMs={60_000} className="sr-only" /> : null}

      <div>
        <p className="text-sm text-muted-foreground">
          Welcome back,{" "}
          <span className="font-semibold text-foreground">{user.displayName}</span>
        </p>
        {membership.homeTeam ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Home team</span>
            <TeamBadge
              shortName={membership.homeTeam.shortName}
              primaryColor={membership.homeTeam.primaryColor}
            />
          </div>
        ) : (
          <p className="mt-1 text-xs text-warning">You haven&apos;t selected a home team yet.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Points" value={playerStats.totalPoints} />
        <StatCard
          label="Current Streak"
          value={playerStats.currentStreak > 0 ? `${playerStats.currentStreak}` : "—"}
          sub={playerStats.currentStreak >= 3 ? "Bonus incoming!" : undefined}
        />
        <StatCard
          label="Palat Left"
          value={`${playerStats.palatLeagueRemaining}/${playerStats.palatLeagueMax}`}
          sub="League stage"
        />
        <StatCard
          label="Correct Bets"
          value={playerStats.correctPredictions}
          sub={`of ${playerStats.totalBets} placed`}
        />
      </div>

      {heroMatch ? (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Next up
          </h2>
          <Link href={`/group/${groupId}/match/${heroMatch.id}`}>
            <Card
              className={cn(
                "relative overflow-hidden border-accent/25 bg-gradient-to-br from-card via-card to-muted/30 p-0 ring-1 ring-accent/20 transition hover:ring-accent/40",
                isLiveStatus(heroMatch.status) && "animate-pulse-live ring-live/40",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-4 py-2">
                <span className="font-mono text-xs text-muted-foreground">#{heroMatch.matchNumber}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {isLiveStatus(heroMatch.status) ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 text-xs font-bold uppercase text-live ring-1 ring-live/40">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
                      </span>
                      Live
                    </span>
                  ) : null}
                  {heroMatch.stage !== "league" ? (
                    <Badge variant="accent">{heroMatch.stage.replace("_", " ")}</Badge>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-6">
                <div className="text-center">
                  {heroMatch.team1.primaryColor ? (
                    <div
                      className="mx-auto mb-2 h-12 w-12 rounded-full ring-2 ring-white/10"
                      style={{ backgroundColor: heroMatch.team1.primaryColor }}
                    />
                  ) : null}
                  <p className="text-xl font-bold text-foreground">{heroMatch.team1.shortName}</p>
                </div>
                <span className="text-xs font-semibold uppercase text-muted-foreground">vs</span>
                <div className="text-center">
                  {heroMatch.team2.primaryColor ? (
                    <div
                      className="mx-auto mb-2 h-12 w-12 rounded-full ring-2 ring-white/10"
                      style={{ backgroundColor: heroMatch.team2.primaryColor }}
                    />
                  ) : null}
                  <p className="text-xl font-bold text-foreground">{heroMatch.team2.shortName}</p>
                </div>
              </div>
              <div className="border-t border-border/60 bg-muted/20 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {formatMatchDate(heroMatch.startTimeUtc, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                    {" · "}
                    {formatMatchTime(heroMatch.startTimeUtc)}
                  </span>
                  <span className="text-muted-foreground">
                    Locks in{" "}
                    <Countdown
                      targetIso={
                        new Date(
                          new Date(heroMatch.startTimeUtc).getTime() - 60 * 60 * 1000,
                        ).toISOString()
                      }
                    />
                  </span>
                </div>
                {heroMatch.existingBet ? (
                  <p className="mt-2 text-center text-sm font-semibold text-success">
                    Your pick: {heroMatch.existingBet.teamShortName}
                    {heroMatch.existingBet.isDoubleDown ? " · 2x" : ""}
                  </p>
                ) : (
                  <p className="mt-2 text-center text-sm font-semibold text-accent">Place your bet →</p>
                )}
              </div>
            </Card>
          </Link>
        </section>
      ) : null}

      {upcomingMatches.length > 1 ? (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight">More matches</h2>
            <span className="text-xs text-muted-foreground">
              {upcomingMatches.length - 1} more
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {restMatches.map((match) => {
              const deadline = new Date(new Date(match.startTimeUtc).getTime() - 60 * 60 * 1000);
              const isOpen = new Date() < deadline;
              return (
                <Link key={match.id} href={`/group/${groupId}/match/${match.id}`}>
                  <Card className="transition hover:border-accent/50 hover:ring-1 hover:ring-accent/15">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">#{match.matchNumber}</span>
                      <div className="flex flex-wrap items-center gap-1">
                        {isLiveStatus(match.status) ? (
                          <Badge variant="destructive">Live</Badge>
                        ) : null}
                        {match.stage !== "league" ? (
                          <Badge variant="accent">{match.stage.replace("_", " ")}</Badge>
                        ) : null}
                        <Badge variant={isOpen ? "success" : "warning"}>{isOpen ? "Open" : "Locked"}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-3 py-2">
                      <TeamBadge
                        shortName={match.team1.shortName}
                        primaryColor={match.team1.primaryColor}
                      />
                      <span className="text-xs text-muted-foreground">vs</span>
                      <TeamBadge
                        shortName={match.team2.shortName}
                        primaryColor={match.team2.primaryColor}
                      />
                    </div>
                    <p className="text-center text-xs text-muted-foreground">
                      {formatMatchDate(match.startTimeUtc, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                      {" · "}
                      {formatMatchTime(match.startTimeUtc)}
                    </p>
                    {match.existingBet ? (
                      <p className="mt-2 text-center text-xs font-medium text-success">
                        Bet: {match.existingBet.teamShortName}
                        {match.existingBet.isDoubleDown ? " (2x)" : ""}
                      </p>
                    ) : isOpen ? (
                      <p className="mt-2 text-center text-xs font-medium text-accent">Bet →</p>
                    ) : null}
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ) : !heroMatch ? (
        <section>
          <EmptyState
            title="No upcoming matches"
            description="All matches have been played or the schedule hasn't been loaded yet."
          />
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Leaderboard</h2>
          <Link
            href={`/group/${groupId}/leaderboard`}
            className="text-xs font-semibold text-accent hover:underline"
          >
            Full table →
          </Link>
        </div>

        {top3.length > 0 ? (
          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            {top3.map((row, i) => {
              const podium = i === 0 ? "from-amber-400/25" : i === 1 ? "from-slate-400/20" : "from-orange-400/20";
              return (
                <div
                  key={row.userId}
                  className={cn(
                    "rounded-xl border border-border/80 bg-gradient-to-b p-3 text-center ring-1 ring-white/5",
                    podium,
                    i === 0 && "sm:order-2 sm:scale-105",
                    i === 1 && "sm:order-1 sm:mt-4",
                    i === 2 && "sm:order-3 sm:mt-6",
                  )}
                >
                  <p className="text-2xl" aria-hidden>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                  </p>
                  <p className="mt-1 truncate text-xs font-semibold text-foreground">{row.displayName}</p>
                  <p className="text-lg font-bold tabular-nums text-accent">{row.totalPoints}</p>
                </div>
              );
            })}
          </div>
        ) : null}

        {leaderboardTop5.length > 0 ? (
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 text-left">#</th>
                  <th className="px-4 py-2.5 text-left">Player</th>
                  <th className="px-4 py-2.5 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardTop5.map((row) => (
                  <tr
                    key={row.userId}
                    className={cn(
                      "border-b border-border last:border-0",
                      row.userId === user.id ? "bg-accent/10" : "bg-card/50",
                    )}
                  >
                    <td className="px-4 py-2.5 font-medium tabular-nums text-foreground">
                      {row.rank <= 3 ? (
                        <span className="mr-1" aria-hidden>
                          {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : "🥉"}
                        </span>
                      ) : null}
                      {row.rank}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-foreground">{row.displayName}</span>
                      {row.homeTeamShortName ? (
                        <span className="ml-2 text-xs text-muted-foreground">{row.homeTeamShortName}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
                      {row.totalPoints}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState title="No standings yet" description="Leaderboard updates after the first match result." />
        )}
      </section>

      <Card>
        <CardHeader
          title="Prize pool"
          description={`Buy-in: ${formatINR(Number(group.buyInAmount))} per player`}
        />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-success">
              {formatINR(Number(group.buyInAmount) * group.paidCount)}
            </p>
            <p className="text-xs text-muted-foreground">
              {group.paidCount}/{group.totalMembers} paid
            </p>
          </div>
          <Badge variant={group.status === "active" ? "success" : "default"}>
            {group.status.replace("_", " ")}
          </Badge>
        </div>
      </Card>
    </div>
  );
}
