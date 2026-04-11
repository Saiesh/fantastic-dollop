"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface LeaderboardLiveRefreshProps {
  /** How often to refetch server-rendered data so standings stay current after scoring runs. */
  intervalMs?: number;
  className?: string;
}

/**
 * Polls a soft navigation refresh — no WebSocket yet; keeps the leaderboard “live”
 * relative to DB updates (PRD §6.6) without manual reloads.
 */
export function LeaderboardLiveRefresh({
  intervalMs = 30_000,
  className,
}: LeaderboardLiveRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, router]);

  return (
    <p className={className} role="status" aria-live="polite">
      Auto-refreshing every {Math.round(intervalMs / 1000)}s
    </p>
  );
}
