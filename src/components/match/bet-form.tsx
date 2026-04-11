"use client";

import type { CSSProperties } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { placeBet } from "@/lib/actions/place-bet";
import { applyPalat } from "@/lib/actions/use-palat";
import type { ActionResult, BetDTO, PalatUsageDTO } from "@/types/bets";
import { Badge } from "@/components/ui/badge";

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

function teamTintStyle(
  team: Team,
  selected: boolean,
): CSSProperties | undefined {
  if (!selected || !team.primaryColor) return undefined;
  // Why: subtle tint from franchise color without full opacity blocks.
  return {
    backgroundColor: `${team.primaryColor}26`,
    borderColor: team.primaryColor,
  };
}

/**
 * Interactive bet placement and Palat form — team-colored tiles, 2x chip, ticket-style locked state.
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
      {isBettingOpen ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[team1, team2].map((team) => {
              const selected = selectedTeam === team.id;
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setSelectedTeam(team.id)}
                  disabled={isPending}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center rounded-2xl border-2 px-3 py-5 text-center transition-all",
                    selected
                      ? "ring-2 ring-accent/40"
                      : "border-border hover:border-accent/30 hover:bg-muted/50",
                    "disabled:opacity-50",
                  )}
                  style={teamTintStyle(team, selected)}
                >
                  {team.primaryColor ? (
                    <span
                      className="mb-2 h-10 w-10 rounded-full ring-2 ring-white/10"
                      style={{ backgroundColor: team.primaryColor }}
                      aria-hidden
                    />
                  ) : null}
                  <p className="text-xl font-bold text-foreground">{team.shortName}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{team.name}</p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
            <button
              type="button"
              onClick={() => setIsDoubleDown((v) => !v)}
              className={cn(
                "rounded-full border-2 px-5 py-2 text-sm font-bold transition",
                isDoubleDown
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border bg-muted/30 text-muted-foreground hover:border-accent/40",
              )}
            >
              2x Double Down
            </button>
            <p className="text-center text-xs text-muted-foreground sm:max-w-xs sm:text-left">
              +4 pts if correct. Palat off for this match.
            </p>
          </div>

          <button
            type="button"
            onClick={handlePlaceBet}
            disabled={isPending || !selectedTeam}
            className={cn(
              "w-full rounded-xl bg-gradient-to-r from-accent to-amber-500 px-4 py-4 text-sm font-bold text-accent-foreground shadow-lg shadow-amber-900/20 transition hover:brightness-110",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {isPending ? "Placing…" : hasBet ? "Update Bet" : isDoubleDown ? "Place 2x bet" : "Place bet"}
          </button>
        </>
      ) : null}

      {!isBettingOpen && hasBet ? (
        <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-border bg-gradient-to-b from-muted/40 to-card/50 p-6 text-center shadow-inner ring-1 ring-white/5">
          <div className="absolute left-0 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background ring-2 ring-border" />
          <div className="absolute right-0 top-1/2 flex h-6 w-6 translate-x-1/2 -translate-y-1/2 rounded-full bg-background ring-2 ring-border" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Betting slip
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-foreground">
            {existingBet.selectedTeamId === team1.id ? team1.shortName : team2.shortName}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {existingBet.betType === "double_down" ? (
              <Badge variant="warning">2x</Badge>
            ) : null}
            {existingBet.hasPalated ? <Badge variant="accent">Palat</Badge> : null}
          </div>
        </div>
      ) : null}

      {!isBettingOpen && !hasBet ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Betting deadline has passed. No bet placed.
          </p>
        </div>
      ) : null}

      {canPalat ? (
        <button
          type="button"
          onClick={handlePalat}
          disabled={isPending}
          className={cn(
            "w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-4 text-sm font-bold text-white shadow-lg shadow-purple-900/30 transition hover:brightness-110",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {isPending ? (
            "Switching…"
          ) : (
            <span className="flex items-center justify-center gap-2">
              Palat — switch team
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
                {palatUsage!.maxAllowed - palatUsage!.usedCount} left
              </span>
            </span>
          )}
        </button>
      ) : null}

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

      {message ? (
        <p
          role="alert"
          className={cn(
            "rounded-xl px-4 py-3 text-sm font-medium",
            message.type === "success"
              ? "bg-success/15 text-success ring-1 ring-success/30"
              : "bg-destructive/15 text-destructive ring-1 ring-destructive/30",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
