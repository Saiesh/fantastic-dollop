"use server";

import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Payment Tracking (Organiser)
// ---------------------------------------------------------------------------

const TogglePaymentSchema = z.object({
  membershipId: z.string().min(1),
  hasPaid: z.boolean(),
});

export async function togglePaymentStatus(
  input: unknown
): Promise<{ data?: { membershipId: string }; error?: string }> {
  const parsed = TogglePaymentSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { membershipId, hasPaid } = parsed.data;

  const membership = await prisma.groupMembership.findUnique({
    where: { id: membershipId },
    select: { id: true, groupId: true },
  });
  if (!membership) return { error: "Membership not found." };

  // Why: Organiser manually marks players as paid/unpaid — actual payment
  // happens offline via UPI/cash (PRD Section 6.7).
  await prisma.groupMembership.update({
    where: { id: membershipId },
    data: { hasPaid },
  });

  revalidatePath(`/group/${membership.groupId}/manage`);
  return { data: { membershipId } };
}

// ---------------------------------------------------------------------------
// Prize Distribution Configuration (Organiser)
// ---------------------------------------------------------------------------

// Why: The PRD offers preset splits plus a custom option. We validate that
// percentages sum to exactly 100 and have 1-10 positions (reasonable max).
const PrizeDistributionSchema = z.object({
  groupId: z.string().min(1),
  preset: z.enum(["top3", "top2", "winner_takes_all", "custom"]),
  customSplits: z
    .array(z.object({ position: z.number().int().positive(), percentage: z.number().positive() }))
    .optional(),
});

interface PrizeSplit {
  position: number;
  percentage: number;
  amount: number;
}

const PRESETS: Record<string, Array<{ position: number; percentage: number }>> = {
  top3: [
    { position: 1, percentage: 50 },
    { position: 2, percentage: 30 },
    { position: 3, percentage: 20 },
  ],
  top2: [
    { position: 1, percentage: 60 },
    { position: 2, percentage: 40 },
  ],
  winner_takes_all: [{ position: 1, percentage: 100 }],
};

export async function calculatePrizeDistribution(
  input: unknown
): Promise<{ data?: { splits: PrizeSplit[]; totalPool: number }; error?: string }> {
  const parsed = PrizeDistributionSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { groupId, preset, customSplits } = parsed.data;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      buyInAmount: true,
      memberships: {
        where: { hasPaid: true },
        select: { id: true },
      },
    },
  });
  if (!group) return { error: "Group not found." };

  const paidCount = group.memberships.length;
  const totalPool = Number(group.buyInAmount) * paidCount;

  let splits: Array<{ position: number; percentage: number }>;

  if (preset === "custom") {
    if (!customSplits || customSplits.length === 0) {
      return { error: "Custom splits are required when preset is 'custom'." };
    }
    const total = customSplits.reduce((sum, s) => sum + s.percentage, 0);
    if (Math.abs(total - 100) > 0.01) {
      return { error: `Percentages must sum to 100 (got ${total}).` };
    }
    splits = customSplits;
  } else {
    splits = PRESETS[preset] ?? PRESETS.top3;
  }

  const result: PrizeSplit[] = splits.map((s) => ({
    ...s,
    amount: Math.round((totalPool * s.percentage) / 100),
  }));

  return { data: { splits: result, totalPool } };
}

// ---------------------------------------------------------------------------
// Settle Group (Organiser marks payouts as done)
// ---------------------------------------------------------------------------

const SettleGroupSchema = z.object({
  groupId: z.string().min(1),
});

export async function settleGroup(
  input: unknown
): Promise<{ data?: { groupId: string }; error?: string }> {
  const parsed = SettleGroupSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { groupId } = parsed.data;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, status: true },
  });
  if (!group) return { error: "Group not found." };

  // Why: Only completed groups can be settled — prevents premature settlement.
  if (group.status !== "completed") {
    return { error: "Group must be in 'completed' status before settling." };
  }

  await prisma.group.update({
    where: { id: groupId },
    data: { status: "settled" },
  });

  revalidatePath(`/group/${groupId}/manage`);
  return { data: { groupId } };
}
