"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { MatchList } from "@/components/admin/match-list";
import { MatchActions } from "@/components/admin/match-actions";
import { triggerManualSync } from "@/lib/actions/admin";
import type { MatchStage, MatchStatus, MatchResult } from "@/generated/prisma";

interface MatchTeam {
  id: string;
  name: string;
  shortName: string;
}

// Why: This mirrors the shape returned by getMatchesForLeague, with team1Id/team2Id
// added from the match-actions component requirement.
interface MatchData {
  id: string;
  matchNumber: number;
  espncricinfoUrl: string | null;
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

interface LeagueAdminPanelProps {
  leagueId: string;
  leagueName: string;
  matches: MatchData[];
  className?: string;
}

export function LeagueAdminPanel({ leagueId, leagueName, matches, className }: LeagueAdminPanelProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "upcoming" | "live" | "completed">("all");
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSync() {
    setSyncStatus(null);
    startTransition(async () => {
      const res = await triggerManualSync({ leagueId });
      if (res.error) {
        setSyncStatus(`Error: ${res.error}`);
      } else if (res.data) {
        const { polled, updated, standingsUpdated } = res.data;
        setSyncStatus(
          `Done — ${polled} match${polled !== 1 ? "es" : ""} checked, ${updated} updated` +
          (standingsUpdated ? ", standings refreshed" : ", standings unchanged"),
        );
      }
    });
  }

  const selectedMatch = matches.find((m) => m.id === selectedMatchId);

  const filteredMatches = matches.filter((m) => {
    if (filter === "all") return true;
    if (filter === "upcoming") return m.status === "upcoming";
    if (filter === "live") return m.status === "live_first_innings" || m.status === "live_second_innings";
    if (filter === "completed") return m.status === "completed" || m.status === "abandoned";
    return true;
  });

  const stats = {
    total: matches.length,
    upcoming: matches.filter((m) => m.status === "upcoming").length,
    live: matches.filter((m) => m.status === "live_first_innings" || m.status === "live_second_innings").length,
    completed: matches.filter((m) => m.status === "completed" || m.status === "abandoned").length,
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{leagueName}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">League Administration</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={handleSync}
            disabled={isPending}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              isPending
                ? "cursor-not-allowed border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
                : "border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50",
            )}
          >
            {isPending ? "Syncing…" : "↻ Sync matches & standings"}
          </button>
          {syncStatus ? (
            <p className={cn(
              "text-xs",
              syncStatus.startsWith("Error") ? "text-red-500" : "text-green-600 dark:text-green-400",
            )}>
              {syncStatus}
            </p>
          ) : null}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-3">
        {([
          { key: "all" as const, label: "Total", value: stats.total, color: "text-foreground" },
          { key: "upcoming" as const, label: "Upcoming", value: stats.upcoming, color: "text-blue-600 dark:text-blue-400" },
          { key: "live" as const, label: "Live", value: stats.live, color: "text-amber-600 dark:text-amber-400" },
          { key: "completed" as const, label: "Done", value: stats.completed, color: "text-green-600 dark:text-green-400" },
        ] as const).map((stat) => (
          <button
            key={stat.key}
            type="button"
            onClick={() => setFilter(stat.key)}
            className={cn(
              "rounded-xl border p-3 text-center transition-colors",
              filter === stat.key
                ? "border-blue-500 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20"
                : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50"
            )}
          >
            <p className={cn("text-xl font-bold", stat.color)}>{stat.value}</p>
            <p className="text-xs text-zinc-500">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Match List (left sidebar) */}
        <div className="lg:col-span-2 max-h-[600px] overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
          <MatchList
            matches={filteredMatches}
            onSelectMatch={setSelectedMatchId}
            selectedMatchId={selectedMatchId}
          />
        </div>

        {/* Match Actions (right panel) */}
        <div className="lg:col-span-3">
          {selectedMatch ? (
            <MatchActions
              key={selectedMatch.id}
              match={{
                ...selectedMatch,
                team1Id: selectedMatch.team1.id,
                team2Id: selectedMatch.team2.id,
              }}
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
              <p className="text-sm text-zinc-400">Select a match to manage</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
