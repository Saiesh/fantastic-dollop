import { cn } from "@/lib/utils";

interface TeamStandingsRow {
  rank: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  noResults: number;
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

/** Official IPL team standings — row tint from franchise color for quick scan. */
export function TeamPointsTableView({ standings, className }: TeamPointsTableViewProps) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-xl border border-border/80 bg-card/40 ring-1 ring-white/5", className)}>
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <caption className="sr-only">IPL team standings</caption>
        <thead>
          <tr className="border-b border-border bg-muted/60 text-xs font-bold uppercase tracking-wide text-muted-foreground">
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
              className="border-b border-border/60 last:border-0"
              style={
                row.team.primaryColor
                  ? {
                      background: `linear-gradient(90deg, ${row.team.primaryColor}14 0%, transparent min(40%, 12rem))`,
                    }
                  : undefined
              }
            >
              <td className="px-3 py-2.5 font-semibold tabular-nums text-foreground">{row.rank}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {row.team.primaryColor ? (
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-white/20"
                      style={{ backgroundColor: row.team.primaryColor }}
                    />
                  ) : null}
                  <span className="font-semibold text-foreground">{row.team.shortName}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{row.team.name}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{row.matchesPlayed}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{row.wins}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{row.losses}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{row.draws}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{row.noResults}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                {Number(row.netRunRate) >= 0 ? "+" : ""}
                {Number(row.netRunRate).toFixed(3)}
              </td>
              <td className="px-3 py-2.5 text-right font-bold tabular-nums text-accent">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
