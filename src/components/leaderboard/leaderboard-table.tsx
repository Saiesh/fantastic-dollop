import { cn } from "@/lib/utils";
import type { GroupLeaderboardDTO } from "@/types/leaderboard";

interface LeaderboardTableProps {
  data: GroupLeaderboardDTO;
  className?: string;
}

/**
 * Full standings table: totals come from PointsLedger aggregation + tie-breakers (PRD §6.6).
 */
export function LeaderboardTable({ data, className }: LeaderboardTableProps) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800", className)}>
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <caption className="sr-only">
          {data.groupName} leaderboard — {data.leagueName}
        </caption>
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
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
              Palat (league / playoff)
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr
              key={row.userId}
              className="border-b border-zinc-100 odd:bg-white even:bg-zinc-50/80 dark:border-zinc-900 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/40"
            >
              <td className="px-3 py-3 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {row.rank}
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{row.displayName}</span>
                  {row.homeTeamShortName ? (
                    <span
                      className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                      style={
                        row.homeTeamPrimaryColor
                          ? {
                              borderColor: row.homeTeamPrimaryColor,
                            }
                          : undefined
                      }
                    >
                      {row.homeTeamShortName}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                {row.betPoints}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                {row.streakBonusPoints}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                {row.homeTeamPoints}
              </td>
              <td className="px-3 py-3 text-right text-base font-semibold tabular-nums text-zinc-950 dark:text-white">
                {row.totalPoints}
              </td>
              <td className="px-3 py-3 text-center tabular-nums" aria-label={`Current streak ${row.currentStreak}`}>
                {row.currentStreak > 0 ? (
                  <span title="Current win streak">
                    <span aria-hidden className="mr-1 inline-block">
                      🔥
                    </span>
                    {row.currentStreak}
                  </span>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
              <td className="px-3 py-3 text-center text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
                {row.palatLeagueRemaining}/{row.palatLeagueMax} · {row.palatPlayoffRemaining}/
                {row.palatPlayoffMax}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500">No members in this group yet.</p>
      ) : null}
    </div>
  );
}
