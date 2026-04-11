"use server";

import { z } from "zod/v4";

import { prisma } from "@/lib/prisma";
import { getBetDeadline, isBettingOpen } from "@/lib/matches";
import type { ActionResult, BetDTO } from "@/types/bets";

// --------------------------------------------------------------------------
// placeBet — Creates or updates a player's prediction for a match.
//
// Business rules enforced (PRD Section 6.2 / 6.4):
//   1. Match must exist and belong to the same league as the group.
//   2. User must be a member of the group.
//   3. Selected team must be one of the two teams in the match.
//   4. Current time must be before the 1-hour pre-match deadline.
//   5. If the user already has a bet, they can modify it only while betting
//      is still open (before deadline). After lock, changes require Palat.
//   6. Double Down flag disables Palat eligibility for this match.
// --------------------------------------------------------------------------

const PlaceBetSchema = z.object({
  userId: z.string().min(1),
  groupId: z.string().min(1),
  matchId: z.string().min(1),
  selectedTeamId: z.string().min(1),
  /** When true, the bet is a Double Down (+4 if correct, Palat disabled). */
  isDoubleDown: z.boolean().default(false),
});

export async function placeBet(
  input: unknown,
): Promise<ActionResult<BetDTO>> {
  const parsed = PlaceBetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid bet payload.",
        fieldErrors: flattenZodErrors(parsed.error),
      },
    };
  }

  const { userId, groupId, matchId, selectedTeamId, isDoubleDown } =
    parsed.data;

  // --- 1. Load match ---------------------------------------------------------
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      leagueId: true,
      startTimeUtc: true,
      team1Id: true,
      team2Id: true,
      result: true,
    },
  });

  if (!match) {
    return { error: { code: "MATCH_NOT_FOUND", message: "Match does not exist." } };
  }

  if (match.result !== "upcoming") {
    return {
      error: { code: "MATCH_NOT_UPCOMING", message: "Betting is closed — this match already has a result." },
    };
  }

  // --- 2. Verify group membership in the same league -------------------------
  const membership = await prisma.groupMembership.findFirst({
    where: { userId, groupId },
    select: { leagueId: true },
  });

  if (!membership) {
    return { error: { code: "NOT_A_MEMBER", message: "You are not a member of this group." } };
  }

  if (membership.leagueId !== match.leagueId) {
    return {
      error: {
        code: "LEAGUE_MISMATCH",
        message: "This match does not belong to the league your group is in.",
      },
    };
  }

  // --- 3. Selected team must be playing in this match ------------------------
  if (selectedTeamId !== match.team1Id && selectedTeamId !== match.team2Id) {
    return {
      error: {
        code: "INVALID_TEAM",
        message: "Selected team is not playing in this match.",
      },
    };
  }

  // --- 4. Deadline enforcement -----------------------------------------------
  const now = new Date();
  if (!isBettingOpen(match.startTimeUtc, now)) {
    return {
      error: {
        code: "DEADLINE_PASSED",
        message: "Betting deadline has passed (1 hour before match start).",
      },
    };
  }

  // --- 5. Upsert the bet (idempotent: create or update) ----------------------
  // lockedAt records when the bet deadline will close, useful for audit.
  const deadline = getBetDeadline(match.startTimeUtc);

  const bet = await prisma.bet.upsert({
    where: { userId_matchId_groupId: { userId, matchId, groupId } },
    create: {
      userId,
      groupId,
      matchId,
      selectedTeamId,
      betType: isDoubleDown ? "double_down" : "standard",
      hasPalated: false,
      lockedAt: deadline,
    },
    update: {
      selectedTeamId,
      betType: isDoubleDown ? "double_down" : "standard",
      // Reset Palat state on pre-deadline edits — the player is changing their
      // mind before lock, so any prior Palat usage would be stale.
      hasPalated: false,
      palatTeamId: null,
    },
  });

  return {
    data: {
      id: bet.id,
      userId: bet.userId,
      groupId: bet.groupId,
      matchId: bet.matchId,
      selectedTeamId: bet.selectedTeamId,
      betType: bet.betType,
      hasPalated: bet.hasPalated,
      palatTeamId: bet.palatTeamId,
      createdAt: bet.createdAt.toISOString(),
      lockedAt: bet.lockedAt.toISOString(),
    },
  };
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function flattenZodErrors(
  error: z.ZodError,
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!fieldErrors[key]) fieldErrors[key] = [];
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}
