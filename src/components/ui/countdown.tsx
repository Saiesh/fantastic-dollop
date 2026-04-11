"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface CountdownProps {
  /** Target instant (betting deadline) — ISO or Date-compatible string from server. */
  targetIso: string;
  className?: string;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Live countdown to a deadline with urgency styling — why: drives bet placement before lock.
 */
export function Countdown({ targetIso, className }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const target = new Date(targetIso).getTime();
  const remaining = target - now;

  if (remaining <= 0) {
    return (
      <span
        className={cn("text-sm font-semibold text-warning", className)}
        role="status"
      >
        Closed
      </span>
    );
  }

  const minutesLeft = remaining / 60000;
  const urgency =
    minutesLeft <= 5
      ? "text-live animate-pulse"
      : minutesLeft <= 30
        ? "text-live"
        : minutesLeft <= 120
          ? "text-warning"
          : "text-success";

  return (
    <span
      className={cn("text-sm font-semibold tabular-nums", urgency, className)}
      role="timer"
      aria-live="polite"
    >
      {formatRemaining(remaining)}
    </span>
  );
}
