"use client";

import { cn } from "@/lib/utils";
import type { MatchStage, MatchStatus, MatchResult } from "@/generated/prisma";

interface MatchTeam {
  id: string;
  name: string;
  shortName: string;
}

interface MatchRow {
  id: string;
  matchNumber: number;
  startTimeUtc: Date;
  stage: MatchStage;
  status: MatchStatus;
  result: MatchResult;
  winnerId: string | null;
  firstInningsCompleteTimeUtc: Date | null;
  team1: MatchTeam;
  team2: MatchTeam;
  winner: MatchTeam | null;
}

interface MatchListProps {
  matches: MatchRow[];
  onSelectMatch: (matchId: string) => void;
  selectedMatchId: string | null;
  className?: string;
}

// Why: Visual status badges help admin quickly scan match states.
const STATUS_STYLES: Record<MatchStatus, string> = {
  upcoming: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  live_first_innings: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  live_second_innings: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  abandoned: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const STATUS_LABELS: Record<MatchStatus, string> = {
  upcoming: "Upcoming",
  live_first_innings: "1st Innings",
  live_second_innings: "2nd Innings",
  completed: "Completed",
  abandoned: "Abandoned",
};

const STAGE_LABELS: Record<MatchStage, string> = {
  league: "League",
  qualifier_1: "Qualifier 1",
  eliminator: "Eliminator",
  qualifier_2: "Qualifier 2",
  final: "Final",
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MatchList({ matches, onSelectMatch, selectedMatchId, className }: MatchListProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {matches.map((match) => (
        <button
          key={match.id}
          type="button"
          onClick={() => onSelectMatch(match.id)}
          className={cn(
            "w-full rounded-lg border px-4 py-3 text-left transition-colors",
            "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
            selectedMatchId === match.id
              ? "border-blue-500 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20"
              : "border-zinc-200 dark:border-zinc-700"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-mono text-zinc-400 shrink-0">
                #{match.matchNumber}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {match.team1.shortName} vs {match.team2.shortName}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDate(match.startTimeUtc)}
                  {match.stage !== "league" && (
                    <span className="ml-2 font-medium text-purple-600 dark:text-purple-400">
                      {STAGE_LABELS[match.stage]}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {match.winner && (
                <span className="text-xs font-medium text-green-700 dark:text-green-400">
                  {match.winner.shortName} won
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  STATUS_STYLES[match.status]
                )}
              >
                {STATUS_LABELS[match.status]}
              </span>
            </div>
          </div>
        </button>
      ))}
      {matches.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-400">No matches found.</p>
      )}
    </div>
  );
}
