import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session";
import { getGroupDashboardData } from "@/lib/groups";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface GroupPageProps {
  params: Promise<{ groupId: string }>;
}

export default async function GroupDashboard({ params }: GroupPageProps) {
  const { groupId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/join");

  const data = await getGroupDashboardData(groupId, user.id);
  if (!data) notFound();

  const { group, membership, upcomingMatches, leaderboardTop5, playerStats } = data;

  return (
    <div className="space-y-8">
      {/* Player Welcome */}
      <div>
        <p className="text-sm text-muted-foreground">
          Welcome back, <span className="font-medium text-foreground">{user.displayName}</span>
        </p>
        {membership.homeTeam ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Home team: <span className="font-medium text-foreground">{membership.homeTeam.name}</span>
          </p>
        ) : (
          <p className="mt-1 text-xs text-warning">
            You haven&apos;t selected a home team yet.
          </p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Points" value={playerStats.totalPoints} />
        <StatCard
          label="Current Streak"
          value={playerStats.currentStreak > 0 ? `${playerStats.currentStreak}` : "—"}
          sub={playerStats.currentStreak >= 3 ? "Bonus incoming!" : undefined}
        />
        <StatCard
          label="Palat Remaining"
          value={`${playerStats.palatLeagueRemaining}/${playerStats.palatLeagueMax}`}
          sub="League stage"
        />
        <StatCard
          label="Correct Bets"
          value={playerStats.correctPredictions}
          sub={`of ${playerStats.totalBets} placed`}
        />
      </div>

      {/* Upcoming Matches */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Upcoming Matches</h2>
          <span className="text-xs text-muted-foreground">{upcomingMatches.length} match{upcomingMatches.length !== 1 ? "es" : ""}</span>
        </div>
        {upcomingMatches.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingMatches.slice(0, 4).map((match) => {
              const deadline = new Date(new Date(match.startTimeUtc).getTime() - 60 * 60 * 1000);
              const isOpen = new Date() < deadline;
              return (
                <Link key={match.id} href={`/group/${groupId}/match/${match.id}`}>
                  <Card className="transition-colors hover:border-accent/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-muted-foreground">#{match.matchNumber}</span>
                      {match.stage !== "league" ? (
                        <Badge variant="accent">{match.stage.replace("_", " ")}</Badge>
                      ) : null}
                      <Badge variant={isOpen ? "success" : "warning"}>
                        {isOpen ? "Open" : "Locked"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-center gap-4 py-2">
                      <span className="text-base font-bold">{match.team1.shortName}</span>
                      <span className="text-xs text-muted-foreground">vs</span>
                      <span className="text-base font-bold">{match.team2.shortName}</span>
                    </div>
                    <p className="text-center text-xs text-muted-foreground">
                      {new Date(match.startTimeUtc).toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {match.existingBet ? (
                      <p className="mt-2 text-center text-xs font-medium text-success">
                        Bet placed: {match.existingBet.teamShortName}
                        {match.existingBet.isDoubleDown ? " (2x)" : ""}
                      </p>
                    ) : isOpen ? (
                      <p className="mt-2 text-center text-xs font-medium text-accent">
                        Place your bet &rarr;
                      </p>
                    ) : null}
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No upcoming matches"
            description="All matches have been played or the schedule hasn't been loaded yet."
          />
        )}
      </section>

      {/* Top 5 Leaderboard Snapshot */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          <Link
            href={`/group/${groupId}/leaderboard`}
            className="text-xs font-medium text-accent hover:underline"
          >
            View full &rarr;
          </Link>
        </div>
        {leaderboardTop5.length > 0 ? (
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 text-left">#</th>
                  <th className="px-4 py-2.5 text-left">Player</th>
                  <th className="px-4 py-2.5 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardTop5.map((row) => (
                  <tr
                    key={row.userId}
                    className={
                      row.userId === user.id
                        ? "bg-accent/5 border-b border-border"
                        : "border-b border-border"
                    }
                  >
                    <td className="px-4 py-2.5 font-medium tabular-nums">{row.rank}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{row.displayName}</span>
                      {row.homeTeamShortName ? (
                        <span className="ml-2 text-xs text-muted-foreground">{row.homeTeamShortName}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{row.totalPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState title="No standings yet" description="Leaderboard updates after the first match result." />
        )}
      </section>

      {/* Prize Pool */}
      <Card>
        <CardHeader
          title="Prize Pool"
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
