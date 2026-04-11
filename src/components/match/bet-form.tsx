"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { placeBet } from "@/lib/actions/place-bet";
import { applyPalat } from "@/lib/actions/use-palat";
import type { ActionResult, BetDTO, PalatUsageDTO } from "@/types/bets";

interface Team {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string | null;
}

interface BetFormProps {
  userId: string;
  groupId: string;
  matchId: string;
  team1: Team;
  team2: Team;
  isBettingOpen: boolean;
  isPalatWindowOpen: boolean;
  existingBet: BetDTO | null;
  palatUsage: PalatUsageDTO | null;
  className?: string;
}

/**
 * Interactive bet placement and Palat form. Handles the full lifecycle:
 * team selection, double-down toggle, bet submission, and mid-match Palat switch.
 */
export function BetForm({
  userId,
  groupId,
  matchId,
  team1,
  team2,
  isBettingOpen,
  isPalatWindowOpen,
  existingBet,
  palatUsage,
  className,
}: BetFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedTeam, setSelectedTeam] = useState<string | null>(
    existingBet?.selectedTeamId ?? null,
  );
  const [isDoubleDown, setIsDoubleDown] = useState(
    existingBet?.betType === "double_down",
  );
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const hasBet = existingBet !== null;
  const canPalat =
    isPalatWindowOpen &&
    hasBet &&
    !existingBet?.hasPalated &&
    existingBet?.betType !== "double_down" &&
    palatUsage !== null &&
    palatUsage.usedCount < palatUsage.maxAllowed;

  function handlePlaceBet() {
    if (!selectedTeam) return;

    startTransition(async () => {
      setMessage(null);
      const result: ActionResult<BetDTO> = await placeBet({
        userId,
        groupId,
        matchId,
        selectedTeamId: selectedTeam,
        isDoubleDown,
      });

      if (result.error) {
        setMessage({ type: "error", text: result.error.message });
      } else {
        setMessage({ type: "success", text: "Bet placed!" });
        router.refresh();
      }
    });
  }

  function handlePalat() {
    startTransition(async () => {
      setMessage(null);
      const result: ActionResult<BetDTO> = await applyPalat({
        userId,
        groupId,
        matchId,
      });

      if (result.error) {
        setMessage({ type: "error", text: result.error.message });
      } else {
        setMessage({ type: "success", text: "Palat! Team switched." });
        router.refresh();
      }
    });
  }

  return (
    <div className={cn("space-y-5", className)}>
      {/* Team Selection */}
      {isBettingOpen && !hasBet ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[team1, team2].map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => setSelectedTeam(team.id)}
                disabled={isPending}
                className={cn(
                  "rounded-xl border-2 px-4 py-6 text-center transition-all",
                  selectedTeam === team.id
                    ? "border-accent bg-accent/5 ring-1 ring-accent/20"
                    : "border-border hover:border-accent/30 hover:bg-muted",
                  "disabled:opacity-50",
                )}
              >
                <p className="text-xl font-bold">{team.shortName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{team.name}</p>
              </button>
            ))}
          </div>

          {/* Double Down Toggle */}
          <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer hover:bg-muted transition-colors">
            <input
              type="checkbox"
              checked={isDoubleDown}
              onChange={(e) => setIsDoubleDown(e.target.checked)}
              className="h-4 w-4 rounded accent-accent"
            />
            <div>
              <p className="text-sm font-medium">Double Down</p>
              <p className="text-xs text-muted-foreground">
                +4 pts if correct (instead of +2). Palat disabled for this match.
              </p>
            </div>
          </label>

          <button
            type="button"
            onClick={handlePlaceBet}
            disabled={isPending || !selectedTeam}
            className={cn(
              "w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors",
              "bg-accent text-accent-foreground hover:bg-accent/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {isPending ? "Placing…" : isDoubleDown ? "Place Double Down Bet" : "Place Bet"}
          </button>
        </>
      ) : isBettingOpen && hasBet ? (
        <>
          {/* Edit existing bet while still open */}
          <div className="grid grid-cols-2 gap-3">
            {[team1, team2].map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => setSelectedTeam(team.id)}
                disabled={isPending}
                className={cn(
                  "rounded-xl border-2 px-4 py-6 text-center transition-all",
                  selectedTeam === team.id
                    ? "border-accent bg-accent/5 ring-1 ring-accent/20"
                    : "border-border hover:border-accent/30 hover:bg-muted",
                  "disabled:opacity-50",
                )}
              >
                <p className="text-xl font-bold">{team.shortName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{team.name}</p>
              </button>
            ))}
          </div>

          <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 cursor-pointer hover:bg-muted transition-colors">
            <input
              type="checkbox"
              checked={isDoubleDown}
              onChange={(e) => setIsDoubleDown(e.target.checked)}
              className="h-4 w-4 rounded accent-accent"
            />
            <div>
              <p className="text-sm font-medium">Double Down</p>
              <p className="text-xs text-muted-foreground">
                +4 pts if correct. Palat disabled.
              </p>
            </div>
          </label>

          <button
            type="button"
            onClick={handlePlaceBet}
            disabled={isPending || !selectedTeam}
            className={cn(
              "w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors",
              "bg-accent text-accent-foreground hover:bg-accent/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {isPending ? "Updating…" : "Update Bet"}
          </button>
        </>
      ) : null}

      {/* Locked Bet Display */}
      {!isBettingOpen && hasBet ? (
        <div className="rounded-xl border border-border bg-muted/50 p-5 text-center">
          <p className="text-xs text-muted-foreground mb-2">Your pick</p>
          <p className="text-2xl font-bold">
            {existingBet.selectedTeamId === team1.id ? team1.shortName : team2.shortName}
          </p>
          <div className="mt-2 flex items-center justify-center gap-2">
            {existingBet.betType === "double_down" ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                Double Down
              </span>
            ) : null}
            {existingBet.hasPalated ? (
              <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                Palated
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* No bet placed and deadline passed */}
      {!isBettingOpen && !hasBet ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Betting deadline has passed. No bet placed.
          </p>
        </div>
      ) : null}

      {/* Palat Button */}
      {canPalat ? (
        <button
          type="button"
          onClick={handlePalat}
          disabled={isPending}
          className={cn(
            "w-full rounded-lg border-2 border-purple-300 px-4 py-3 text-sm font-semibold transition-all",
            "bg-purple-50 text-purple-700 hover:bg-purple-100",
            "dark:border-purple-700 dark:bg-purple-950/30 dark:text-purple-300 dark:hover:bg-purple-950/50",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {isPending ? "Switching…" : `Palat! Switch team (${palatUsage!.maxAllowed - palatUsage!.usedCount} left)`}
        </button>
      ) : null}

      {/* Palat unavailable reasons */}
      {isPalatWindowOpen && hasBet && !canPalat ? (
        <p className="text-center text-xs text-muted-foreground">
          {existingBet?.betType === "double_down"
            ? "Palat unavailable: Double Down is active."
            : existingBet?.hasPalated
              ? "Already used Palat on this match."
              : palatUsage && palatUsage.usedCount >= palatUsage.maxAllowed
                ? "Palat quota exhausted for this stage."
                : null}
        </p>
      ) : null}

      {/* Feedback */}
      {message ? (
        <p
          role="alert"
          className={cn(
            "rounded-lg px-4 py-3 text-sm font-medium",
            message.type === "success"
              ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
