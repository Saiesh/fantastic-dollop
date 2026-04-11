import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { GroupLeaderboardDTO } from "@/types/leaderboard";

interface LeaderboardTableProps {
  data: GroupLeaderboardDTO;
  /** Why: highlight the signed-in user row across long tables. */
  currentUserId?: string;
  className?: string;
}

function rankCell(rank: number): ReactNode {
  if (rank === 1) return <span aria-hidden>🥇</span>;
  if (rank === 2) return <span aria-hidden>🥈</span>;
  if (rank === 3) return <span aria-hidden>🥉</span>;
  return rank;
}

/**
 * Full standings table: totals from PointsLedger aggregation + tie-breakers (PRD §6.6).
 */
export function LeaderboardTable({ data, currentUserId, className }: LeaderboardTableProps) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-xl border border-border/80 bg-card/50 ring-1 ring-white/5",
        className,
      )}
    >
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <caption className="sr-only">
          {data.groupName} leaderboard — {data.leagueName}
        </caption>
        <thead>
          <tr className="border-b border-border bg-muted/60 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-3 py-3">
              Rank
            </th>
            <th scope="col" className="px-3 py-3">
              Player
            </th>
            <th scope="col" className="px-3 py-3 text-right tabular-nums">
              Bet pts
            </th>
            <th scope="col" className="px-3 py-3 text-right tabular-nums">
              Streak bonus
            </th>
            <th scope="col" className="px-3 py-3 text-right tabular-nums">
              Home team
            </th>
            <th scope="col" className="px-3 py-3 text-right tabular-nums">
              Total
            </th>
            <th scope="col" className="px-3 py-3 text-center">
              Streak
            </th>
            <th scope="col" className="px-3 py-3 text-center">
              Palat (L / PO)
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const isSelf = row.userId === currentUserId;
            return (
              <tr
                key={row.userId}
                className={cn(
                  "border-b border-border/80 last:border-0",
                  "odd:bg-card/80 even:bg-muted/20",
                  isSelf && "bg-accent/10 ring-1 ring-inset ring-accent/30",
                )}
              >
                <td className="px-3 py-3 font-semibold tabular-nums text-foreground">
                  <span className="inline-flex min-w-8 items-center gap-1">
                    {rankCell(row.rank)}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{row.displayName}</span>
                    {row.homeTeamShortName ? (
                      <span
                        className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        style={
                          row.homeTeamPrimaryColor
                            ? { borderColor: row.homeTeamPrimaryColor }
                            : undefined
                        }
                      >
                        {row.homeTeamShortName}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-foreground">{row.betPoints}</td>
                <td className="px-3 py-3 text-right tabular-nums text-foreground">
                  {row.streakBonusPoints}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-foreground">
                  {row.homeTeamPoints}
                </td>
                <td className="px-3 py-3 text-right text-base font-bold tabular-nums text-accent">
                  {row.totalPoints}
                </td>
                <td
                  className="px-3 py-3 text-center tabular-nums text-foreground"
                  aria-label={`Current streak ${row.currentStreak}`}
                >
                  {row.currentStreak > 0 ? (
                    <span title="Current win streak">
                      <span aria-hidden className="mr-1 inline-block">
                        🔥
                      </span>
                      {row.currentStreak}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-center text-xs tabular-nums text-muted-foreground">
                  {row.palatLeagueRemaining}/{row.palatLeagueMax} · {row.palatPlayoffRemaining}/
                  {row.palatPlayoffMax}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No members in this group yet.</p>
      ) : null}
    </div>
  );
}
