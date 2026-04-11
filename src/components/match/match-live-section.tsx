"use client";

import { useState } from "react";
import { LiveScore } from "@/components/match/live-score";
import { BetForm } from "@/components/match/bet-form";
import type { BetDTO, PalatUsageDTO } from "@/types/bets";

// ---------------------------------------------------------------------------
// MatchLiveSection — client wrapper coordinating LiveScore and BetForm.
//
// Why: LiveScore detects first-innings completion from Cricinfo and must
// disable the Palat button immediately in the UI without waiting for a full
// server-side page reload. Both components are client-rendered here, sharing
// state via a single parent.
// ---------------------------------------------------------------------------

interface Team {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string | null;
}

interface MatchLiveSectionProps {
  // LiveScore props
  matchId: string;
  matchStatus: string;
  initialFirstInningsComplete: boolean;
  // BetForm props
  userId: string;
  groupId: string;
  team1: Team;
  team2: Team;
  isBettingOpen: boolean;
  isPalatWindowOpen: boolean;
  existingBet: BetDTO | null;
  palatUsage: PalatUsageDTO | null;
}

export function MatchLiveSection({
  matchId,
  matchStatus,
  initialFirstInningsComplete,
  userId,
  groupId,
  team1,
  team2,
  isBettingOpen,
  isPalatWindowOpen,
  existingBet,
  palatUsage,
}: MatchLiveSectionProps) {
  // Tracks whether live data has signalled first innings is done.
  // If true, Palat is disabled regardless of the server-side value.
  const [liveFirstInningsComplete, setLiveFirstInningsComplete] =
    useState(false);

  const effectivePalatWindowOpen =
    isPalatWindowOpen && !liveFirstInningsComplete;

  const isLiveStatus =
    matchStatus === "live_first_innings" ||
    matchStatus === "live_second_innings";

  return (
    <>
      {/* Live score card — shown whenever match is live (or just tossed) */}
      {isLiveStatus || matchStatus === "upcoming" ? (
        <LiveScore
          matchId={matchId}
          initialStatus={matchStatus}
          initialFirstInningsComplete={initialFirstInningsComplete}
          onFirstInningsDetected={() => setLiveFirstInningsComplete(true)}
        />
      ) : null}

      <BetForm
        userId={userId}
        groupId={groupId}
        matchId={matchId}
        team1={team1}
        team2={team2}
        isBettingOpen={isBettingOpen}
        isPalatWindowOpen={effectivePalatWindowOpen}
        existingBet={existingBet}
        palatUsage={palatUsage}
      />
    </>
  );
}
