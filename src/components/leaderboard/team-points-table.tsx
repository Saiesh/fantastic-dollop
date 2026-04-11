import { cn } from "@/lib/utils";

interface TeamStandingsRow {
  rank: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  noResults: number;
  /** Prisma Decimal serialised as number or string at the boundary. */
  netRunRate: number | string | { toNumber(): number };
  points: number;
  team: {
    name: string;
    shortName: string;
    primaryColor: string | null;
  };
}

interface TeamPointsTableViewProps {
  standings: TeamStandingsRow[];
  className?: string;
}

/** Official IPL team standings table shared across all groups in a league (PRD §7.5). */
export function TeamPointsTableView({ standings, className }: TeamPointsTableViewProps) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-xl border border-border", className)}>
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <caption className="sr-only">IPL team standings</caption>
        <thead>
          <tr className="border-b border-border bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-3">#</th>
            <th className="px-3 py-3">Team</th>
            <th className="px-3 py-3 text-right">P</th>
            <th className="px-3 py-3 text-right">W</th>
            <th className="px-3 py-3 text-right">L</th>
            <th className="px-3 py-3 text-right">D</th>
            <th className="px-3 py-3 text-right">NR</th>
            <th className="px-3 py-3 text-right">NRR</th>
            <th className="px-3 py-3 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr
              key={row.team.shortName}
              className="border-b border-border last:border-0 odd:bg-card even:bg-muted/30"
            >
              <td className="px-3 py-2.5 font-medium tabular-nums">{row.rank}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {row.team.primaryColor ? (
                    <span
                      className="inline-block h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: row.team.primaryColor }}
                    />
                  ) : null}
                  <span className="font-medium">{row.team.shortName}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {row.team.name}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.matchesPlayed}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.wins}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.losses}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.draws}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.noResults}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {Number(row.netRunRate) >= 0 ? "+" : ""}
                {Number(row.netRunRate).toFixed(3)}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
