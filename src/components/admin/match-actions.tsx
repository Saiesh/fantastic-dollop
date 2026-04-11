"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { submitMatchResult, markFirstInningsComplete, setMatchLive } from "@/lib/actions/admin";
import type { MatchStatus, MatchResult } from "@/generated/prisma";

interface MatchTeam {
  id: string;
  name: string;
  shortName: string;
}

interface SelectedMatch {
  id: string;
  matchNumber: number;
  startTimeUtc: Date;
  status: MatchStatus;
  result: MatchResult;
  winnerId: string | null;
  firstInningsCompleteTimeUtc: Date | null;
  team1Id: string;
  team2Id: string;
  team1: MatchTeam;
  team2: MatchTeam;
}

interface MatchActionsProps {
  match: SelectedMatch;
  className?: string;
}

export function MatchActions({ match, className }: MatchActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isFinished = match.status === "completed" || match.status === "abandoned";
  const canSetLive = match.status === "upcoming";
  const canMarkFirstInnings =
    match.status === "live_first_innings" && !match.firstInningsCompleteTimeUtc;
  const canEnterResult = !isFinished && match.status !== "upcoming";

  function handleSetLive() {
    startTransition(async () => {
      setMessage(null);
      const res = await setMatchLive({ matchId: match.id });
      if (res.error) setMessage({ type: "error", text: res.error });
      else setMessage({ type: "success", text: "Match is now live." });
    });
  }

  function handleMarkFirstInnings() {
    startTransition(async () => {
      setMessage(null);
      const res = await markFirstInningsComplete({ matchId: match.id });
      if (res.error) setMessage({ type: "error", text: res.error });
      else setMessage({ type: "success", text: "First innings marked complete. Palat window closed." });
    });
  }

  function handleSubmitResult(result: "team1_win" | "team2_win" | "draw" | "abandoned") {
    let winnerId: string | null = null;
    if (result === "team1_win") winnerId = match.team1Id;
    if (result === "team2_win") winnerId = match.team2Id;

    startTransition(async () => {
      setMessage(null);
      const res = await submitMatchResult({ matchId: match.id, result, winnerId });
      if (res.error) setMessage({ type: "error", text: res.error });
      else setMessage({ type: "success", text: "Result recorded. Scoring complete." });
    });
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Match Header */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Match #{match.matchNumber}
          </h3>
          <span className="text-sm text-zinc-500">
            {new Date(match.startTimeUtc).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </div>

        <div className="flex items-center justify-center gap-6 py-4">
          <div className="text-center">
            <p className="text-xl font-bold">{match.team1.shortName}</p>
            <p className="text-xs text-zinc-500">{match.team1.name}</p>
          </div>
          <span className="text-lg font-light text-zinc-300 dark:text-zinc-600">vs</span>
          <div className="text-center">
            <p className="text-xl font-bold">{match.team2.shortName}</p>
            <p className="text-xs text-zinc-500">{match.team2.name}</p>
          </div>
        </div>

        {isFinished && (
          <div className={cn(
            "mt-4 rounded-lg p-3 text-center text-sm font-medium",
            match.result === "abandoned"
              ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              : "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
          )}>
            {match.result === "abandoned" && "Match Abandoned"}
            {match.result === "draw" && "Match Drawn"}
            {match.result === "team1_win" && `${match.team1.name} won`}
            {match.result === "team2_win" && `${match.team2.name} won`}
          </div>
        )}
      </div>

      {/* Actions */}
      {!isFinished && (
        <div className="space-y-4">
          {/* Set Live */}
          {canSetLive && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
              <h4 className="text-sm font-semibold mb-2">Start Match</h4>
              <p className="text-xs text-zinc-500 mb-3">
                Mark this match as live to open the Palat window.
              </p>
              <button
                type="button"
                onClick={handleSetLive}
                disabled={isPending}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  "bg-amber-500 text-white hover:bg-amber-600",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isPending ? "Updating…" : "Set Live"}
              </button>
            </div>
          )}

          {/* Mark First Innings */}
          {canMarkFirstInnings && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-800 dark:bg-amber-950/20">
              <h4 className="text-sm font-semibold mb-2">First Innings</h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                Mark first innings complete to close the Palat window for all groups.
              </p>
              <button
                type="button"
                onClick={handleMarkFirstInnings}
                disabled={isPending}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  "bg-orange-500 text-white hover:bg-orange-600",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isPending ? "Marking…" : "Mark First Innings Complete"}
              </button>
            </div>
          )}

          {match.status === "live_second_innings" && !match.firstInningsCompleteTimeUtc && null}

          {/* First innings already done indicator */}
          {match.firstInningsCompleteTimeUtc && !isFinished && (
            <div className="rounded-lg bg-green-50 px-4 py-2 text-xs text-green-700 dark:bg-green-950/20 dark:text-green-400">
              First innings completed at{" "}
              {new Date(match.firstInningsCompleteTimeUtc).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}

          {/* Enter Result */}
          {canEnterResult && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
              <h4 className="text-sm font-semibold mb-2">Enter Result</h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                Select the match outcome. Scoring will fan out to all groups automatically.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSubmitResult("team1_win")}
                  disabled={isPending}
                  className={cn(
                    "rounded-lg border-2 border-blue-200 px-4 py-3 text-sm font-medium transition-all",
                    "hover:border-blue-500 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-500 dark:hover:bg-blue-950/30",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {match.team1.shortName} Win
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitResult("team2_win")}
                  disabled={isPending}
                  className={cn(
                    "rounded-lg border-2 border-blue-200 px-4 py-3 text-sm font-medium transition-all",
                    "hover:border-blue-500 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-500 dark:hover:bg-blue-950/30",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {match.team2.shortName} Win
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitResult("draw")}
                  disabled={isPending}
                  className={cn(
                    "rounded-lg border-2 border-zinc-200 px-4 py-2 text-sm font-medium transition-all",
                    "hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/50",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  Draw
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitResult("abandoned")}
                  disabled={isPending}
                  className={cn(
                    "rounded-lg border-2 border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-500 transition-all",
                    "hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:hover:border-red-700 dark:hover:bg-red-950/20",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  Abandoned
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Feedback Message */}
      {message && (
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-sm font-medium",
            message.type === "success"
              ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
          )}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
