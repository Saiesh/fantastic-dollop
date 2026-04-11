"use server";

import { z } from "zod/v4";

import { prisma } from "@/lib/prisma";
import { isPalatWindowOpen } from "@/lib/matches";
import { palatStageForMatch, maxPalatForStage } from "@/lib/palat";
import type { ActionResult, BetDTO } from "@/types/bets";

// --------------------------------------------------------------------------
// applyPalat — Switch a locked bet to the other team mid-match.
//
// Named "apply" instead of "use" to avoid the React hook naming convention
// (ESLint react-hooks/rules-of-hooks trips on "use*" in async functions).
//
// Business rules (PRD Section 6.3):
//   1. An existing bet must already be placed for this match + group.
//   2. The bet must NOT be a Double Down (DD disables Palat).
//   3. The Palat time-window must be open: after bet deadline, before
//      first innings is marked complete.
//   4. The user must have remaining Palat quota for the match's stage
//      (league: 7, playoffs: 1).
//   5. The new team must be the *other* team in the match (a switch).
//   6. A bet can only be Palated once — no double-Palat on the same match.
// --------------------------------------------------------------------------

const ApplyPalatSchema = z.object({
  userId: z.string().min(1),
  groupId: z.string().min(1),
  matchId: z.string().min(1),
});

async function executePalat(
  input: unknown,
): Promise<ActionResult<BetDTO>> {
  const parsed = ApplyPalatSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid Palat payload.",
        fieldErrors: flattenZodErrors(parsed.error),
      },
    };
  }

  const { userId, groupId, matchId } = parsed.data;

  // --- 1. Load match for window + stage checks ------------------------------
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      leagueId: true,
      startTimeUtc: true,
      stage: true,
      team1Id: true,
      team2Id: true,
      firstInningsCompleteTimeUtc: true,
      result: true,
    },
  });

  if (!match) {
    return { error: { code: "MATCH_NOT_FOUND", message: "Match does not exist." } };
  }

  if (match.result !== "upcoming") {
    return {
      error: { code: "MATCH_CONCLUDED", message: "Palat is unavailable — this match already has a result." },
    };
  }

  // --- 2. Load existing bet --------------------------------------------------
  const existingBet = await prisma.bet.findUnique({
    where: { userId_matchId_groupId: { userId, matchId, groupId } },
  });

  if (!existingBet) {
    return {
      error: { code: "NO_BET", message: "You haven't placed a bet on this match yet." },
    };
  }

  // --- 3. Double Down bets cannot be Palated ---------------------------------
  if (existingBet.betType === "double_down") {
    return {
      error: {
        code: "DOUBLE_DOWN_NO_PALAT",
        message: "Palat is disabled because you chose Double Down on this match.",
      },
    };
  }

  // --- 4. Cannot Palat the same match twice ----------------------------------
  if (existingBet.hasPalated) {
    return {
      error: { code: "ALREADY_PALATED", message: "You have already used Palat on this match." },
    };
  }

  // --- 5. Palat time-window check --------------------------------------------
  const now = new Date();
  if (!isPalatWindowOpen(match.startTimeUtc, match.firstInningsCompleteTimeUtc, now)) {
    return {
      error: {
        code: "PALAT_WINDOW_CLOSED",
        message: "Palat window is not open. It opens after the bet deadline and closes when the first innings ends.",
      },
    };
  }

  // --- 6. Palat quota check + atomic decrement --------------------------------
  const stage = palatStageForMatch(match.stage);
  const max = maxPalatForStage(stage);

  // Determine the other team — a Palat always flips the selection.
  const newTeamId =
    existingBet.selectedTeamId === match.team1Id
      ? match.team2Id
      : match.team1Id;

  // Wrap the quota increment + bet update in a transaction so they either
  // both succeed or neither does (prevents race conditions on quota).
  const updatedBet = await prisma.$transaction(async (tx) => {
    const usage = await tx.palatUsage.upsert({
      where: { userId_groupId_stage: { userId, groupId, stage } },
      create: { userId, groupId, stage, usedCount: 0, maxAllowed: max },
      update: {},
    });

    if (usage.usedCount >= usage.maxAllowed) {
      throw new PalatQuotaExhausted(stage, usage.maxAllowed);
    }

    // Increment usage count atomically.
    await tx.palatUsage.update({
      where: { id: usage.id },
      data: { usedCount: { increment: 1 } },
    });

    // Flip the bet to the other team and record the Palat.
    return tx.bet.update({
      where: { id: existingBet.id },
      data: {
        // palatTeamId stores the *new* team (post-switch) for audit.
        palatTeamId: newTeamId,
        selectedTeamId: newTeamId,
        hasPalated: true,
      },
    });
  });

  return {
    data: {
      id: updatedBet.id,
      userId: updatedBet.userId,
      groupId: updatedBet.groupId,
      matchId: updatedBet.matchId,
      selectedTeamId: updatedBet.selectedTeamId,
      betType: updatedBet.betType,
      hasPalated: updatedBet.hasPalated,
      palatTeamId: updatedBet.palatTeamId,
      createdAt: updatedBet.createdAt.toISOString(),
      lockedAt: updatedBet.lockedAt.toISOString(),
    },
  };
}

// --------------------------------------------------------------------------
// Custom error thrown inside transaction — caught and mapped to ActionResult.
// --------------------------------------------------------------------------

class PalatQuotaExhausted extends Error {
  readonly stage: string;
  readonly max: number;

  constructor(stage: string, max: number) {
    super(`Palat quota exhausted for ${stage} stage (max ${max}).`);
    this.stage = stage;
    this.max = max;
  }
}

/**
 * Public entry point — wraps executePalat to catch the transaction-thrown
 * PalatQuotaExhausted error and return a typed ActionResult.
 */
export async function applyPalat(
  input: unknown,
): Promise<ActionResult<BetDTO>> {
  try {
    return await executePalat(input);
  } catch (err) {
    if (err instanceof PalatQuotaExhausted) {
      return {
        error: {
          code: "PALAT_QUOTA_EXHAUSTED",
          message: `You have used all your Palat switches for the ${err.stage} stage (max ${err.max}).`,
        },
      };
    }
    throw err;
  }
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
