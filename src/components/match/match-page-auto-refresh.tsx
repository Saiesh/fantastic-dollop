"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface MatchPageAutoRefreshProps {
  /** Current match status from the server render. */
  matchStatus: string;
}

// How often to re-fetch the server component tree while a match is in play.
// Aligns with the live-score browser poll interval so both update together.
const POLL_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Silently re-fetches the match detail server component tree on an interval
 * so that cron-driven status changes (upcoming → live, live → completed),
 * the result banner, and the winner badge all appear without a manual reload.
 *
 * Why router.refresh(): the match detail page is force-dynamic (always SSR).
 * The browser holds a static snapshot of the last render. router.refresh()
 * re-fetches all server components for the current URL with fresh DB data —
 * updating the status badge, winner banner, and live-section visibility in
 * place without a full navigation.
 *
 * Polling stops automatically when the match reaches a terminal state
 * (completed / abandoned) because no further changes are expected.
 *
 * Renders nothing — purely a side-effect component.
 */
export function MatchPageAutoRefresh({ matchStatus }: MatchPageAutoRefreshProps) {
  const router = useRouter();

  // Why: only poll while the outcome is still uncertain. Once the match is
  // completed or abandoned the data is frozen and polling wastes resources.
  const isActive =
    matchStatus === "upcoming" ||
    matchStatus === "live_first_innings" ||
    matchStatus === "live_second_innings";

  useEffect(() => {
    if (!isActive) return;

    const id = window.setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [isActive, router]);

  return null;
}
