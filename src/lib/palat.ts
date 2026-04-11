import "server-only";

import type { MatchStage } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import type { PalatUsageDTO } from "@/types/bets";

// --------------------------------------------------------------------------
// Palat quota queries and helpers.
// League stage: 7 uses max.  Playoff stage: 1 use max. (PRD Section 6.3)
// --------------------------------------------------------------------------

const LEAGUE_PALAT_MAX = 7;
const PLAYOFF_PALAT_MAX = 1;

/** Map a match's stage enum to the Palat quota bucket. */
export function palatStageForMatch(
  matchStage: MatchStage,
): "league" | "playoffs" {
  // Any non-league match (qualifier_1, eliminator, qualifier_2, final) uses the
  // single playoff Palat quota.
  return matchStage === "league" ? "league" : "playoffs";
}

/** Return the hard cap for a given Palat stage. */
export function maxPalatForStage(stage: "league" | "playoffs"): number {
  return stage === "league" ? LEAGUE_PALAT_MAX : PLAYOFF_PALAT_MAX;
}

/**
 * Get or lazily create the PalatUsage record for a user in a group + stage.
 * Upsert guarantees we always have a row to read/increment atomically.
 */
export async function getOrCreatePalatUsage(
  userId: string,
  groupId: string,
  stage: "league" | "playoffs",
): Promise<PalatUsageDTO> {
  const max = maxPalatForStage(stage);

  const row = await prisma.palatUsage.upsert({
    where: { userId_groupId_stage: { userId, groupId, stage } },
    create: { userId, groupId, stage, usedCount: 0, maxAllowed: max },
    update: {},
    select: { stage: true, usedCount: true, maxAllowed: true },
  });

  return row;
}

/**
 * True when the user still has Palat uses left for the relevant stage.
 * Does NOT check the Palat time-window — that's the caller's responsibility.
 */
export async function hasPalatQuota(
  userId: string,
  groupId: string,
  stage: "league" | "playoffs",
): Promise<boolean> {
  const usage = await getOrCreatePalatUsage(userId, groupId, stage);
  return usage.usedCount < usage.maxAllowed;
}
