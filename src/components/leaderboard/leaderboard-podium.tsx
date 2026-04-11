import { cn } from "@/lib/utils";
import type { LeaderboardRowDTO } from "@/types/leaderboard";

interface LeaderboardPodiumProps {
  rows: LeaderboardRowDTO[];
  /** Why: subtle emphasis so players spot themselves in the top 3. */
  currentUserId?: string;
  className?: string;
}

const MEDALS = ["🥇", "🥈", "🥉"] as const;

/** Podium strip for ranks 1–3 — why: faster scan than the full table alone. */
export function LeaderboardPodium({
  rows,
  currentUserId,
  className,
}: LeaderboardPodiumProps) {
  const top = rows.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-2 sm:gap-4",
        className,
      )}
    >
      {top.map((row, i) => {
        const isSelf = row.userId === currentUserId;
        const tier =
          i === 0
            ? "from-amber-400/20 border-amber-500/40"
            : i === 1
              ? "from-slate-400/15 border-slate-500/35"
              : "from-orange-400/15 border-orange-500/35";
        return (
          <div
            key={row.userId}
            className={cn(
              "rounded-xl border bg-gradient-to-b p-3 text-center ring-1 ring-white/5",
              tier,
              i === 0 && "sm:order-2 sm:z-10 sm:scale-105",
              i === 1 && "sm:order-1 sm:mt-6",
              i === 2 && "sm:order-3 sm:mt-8",
              isSelf && "ring-2 ring-accent/50",
            )}
          >
            <p className="text-2xl" aria-hidden>
              {MEDALS[i]}
            </p>
            <p className="mt-1 truncate text-xs font-bold text-foreground">{row.displayName}</p>
            <p className="mt-1 text-lg font-black tabular-nums text-accent">{row.totalPoints}</p>
            <p className="text-xs text-muted-foreground">pts</p>
          </div>
        );
      })}
    </div>
  );
}
