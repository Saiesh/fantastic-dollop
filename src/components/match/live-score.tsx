"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types mirroring the API response shape
// ---------------------------------------------------------------------------

interface LiveInnings {
  inningsNumber: number;
  battingTeamShort: string;
  runs: number;
  wickets: number;
  overs: string;
  isComplete: boolean;
}

interface MatchUpdate {
  type: "toss" | "wicket" | "milestone" | "innings_end" | "info";
  text: string;
}

interface LiveScorePayload {
  isLive: boolean;
  statusText: string;
  toss: string | null;
  innings: LiveInnings[];
  isFirstInningsComplete: boolean;
  matchEnded: boolean;
}

interface LiveScoreApiResponse {
  matchId: string;
  matchStatus: string;
  firstInningsCompleteInDb: boolean;
  liveScore: LiveScorePayload;
  updates: MatchUpdate[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LiveScoreProps {
  matchId: string;
  /** Current server-side match status — drives initial render. */
  initialStatus: string;
  /** Whether first innings is already marked complete in the DB. */
  initialFirstInningsComplete: boolean;
  /** Callback when live data detects first innings ended and DB wasn't updated. */
  onFirstInningsDetected?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30_000; // 30 seconds

function scoreLabel(inn: LiveInnings): string {
  return `${inn.runs}/${inn.wickets} (${inn.overs} ov)`;
}

function updateIcon(type: MatchUpdate["type"]): string {
  switch (type) {
    case "toss":
      return "🪙";
    case "wicket":
      return "🎯";
    case "milestone":
      return "⭐";
    case "innings_end":
      return "📋";
    default:
      return "•";
  }
}

// ---------------------------------------------------------------------------
// Skeleton shown while first fetch is in flight
// ---------------------------------------------------------------------------

function LiveScoreSkeleton() {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 text-xs font-bold uppercase text-live ring-1 ring-live/35">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
          </span>
          Live
        </span>
        <span className="skeleton-shimmer h-4 w-32 rounded" />
      </div>
      <div className="skeleton-shimmer h-8 w-40 rounded" />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LiveScore({
  matchId,
  initialStatus,
  initialFirstInningsComplete,
  onFirstInningsDetected,
  className,
}: LiveScoreProps) {
  const [data, setData] = useState<LiveScoreApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const didAutoMark = useRef(false);

  const fetchScore = useCallback(async () => {
    try {
      const res = await fetch(`/api/match/${matchId}/live-score`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = (await res.json()) as LiveScoreApiResponse;
      setData(json);
      setError(false);

      // Auto-mark first innings complete in DB via the API route
      // when Cricinfo signals innings end but DB hasn't caught up yet.
      if (
        !didAutoMark.current &&
        !json.firstInningsCompleteInDb &&
        json.liveScore.isFirstInningsComplete &&
        json.matchStatus === "live_first_innings"
      ) {
        didAutoMark.current = true;
        // Fire-and-forget — we don't await so the UI isn't blocked.
        fetch(`/api/match/${matchId}/auto-first-innings`, {
          method: "POST",
          cache: "no-store",
        })
          .then((r) => {
            if (r.ok && onFirstInningsDetected) {
              onFirstInningsDetected();
            }
          })
          .catch(() => {
            // Non-fatal; admin can still mark manually.
            didAutoMark.current = false;
          });
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [matchId, onFirstInningsDetected]);

  // Initial fetch
  useEffect(() => {
    void fetchScore();
  }, [fetchScore]);

  // Polling — only while match is live (first or second innings)
  useEffect(() => {
    const isLiveStatus =
      initialStatus === "live_first_innings" ||
      initialStatus === "live_second_innings" ||
      // Also poll if current data shows it's live (status may lag behind)
      data?.liveScore.isLive;

    if (!isLiveStatus) return;

    const interval = setInterval(() => {
      void fetchScore();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchScore, initialStatus, data?.liveScore.isLive]);

  // Show nothing when there's no live data and match isn't marked live in DB
  const isDbLive =
    initialStatus === "live_first_innings" ||
    initialStatus === "live_second_innings";

  if (loading && !isDbLive) return null;
  if (loading) return <LiveScoreSkeleton />;
  if (error || !data?.liveScore.isLive) {
    // Show minimal "live" placeholder if DB says live but Cricinfo hasn't updated yet
    if (!isDbLive) return null;
    return (
      <Card className={cn("space-y-2", className)}>
        <div className="flex items-center gap-2">
          <LiveBadge />
          <p className="text-xs text-muted-foreground">
            Fetching live score…
          </p>
        </div>
      </Card>
    );
  }

  const { liveScore, updates } = data;

  return (
    <Card className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <LiveBadge />
        {liveScore.isFirstInningsComplete && !initialFirstInningsComplete && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning ring-1 ring-warning/30">
            1st innings done
          </span>
        )}
      </div>

      {/* Toss */}
      {liveScore.toss ? (
        <p className="text-sm text-muted-foreground">
          <span className="mr-1">🪙</span>
          {liveScore.toss}
        </p>
      ) : null}

      {/* Status text */}
      {liveScore.statusText ? (
        <p className="text-sm font-semibold text-foreground">
          {liveScore.statusText}
        </p>
      ) : null}

      {/* Innings scores */}
      {liveScore.innings.length > 0 ? (
        <div className="space-y-2">
          {liveScore.innings.map((inn) => (
            <div
              key={inn.inningsNumber}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2",
                inn.isComplete
                  ? "bg-muted/40"
                  : "bg-live/10 ring-1 ring-live/25",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {inn.inningsNumber === 1 ? "1st" : "2nd"} Inn
                </span>
                <span className="font-bold text-foreground">
                  {inn.battingTeamShort}
                </span>
              </div>
              <span
                className={cn(
                  "font-mono text-base font-black tabular-nums",
                  inn.isComplete ? "text-muted-foreground" : "text-live",
                )}
              >
                {scoreLabel(inn)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Updates feed */}
      {updates.length > 0 ? (
        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Match updates
          </p>
          <ul className="space-y-1.5">
            {updates.map((u, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-xs text-foreground"
              >
                <span className="shrink-0 text-sm leading-5">{updateIcon(u.type)}</span>
                <span className="leading-5">{u.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-right text-xs text-muted-foreground">
        via ESPNCricinfo · updates every 30 s
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 text-xs font-bold uppercase text-live ring-1 ring-live/35">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
      </span>
      Live score
    </span>
  );
}
