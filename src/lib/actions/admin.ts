"use server";

import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import {
  scoreMatch,
  finalizeLeagueStreaks,
  recomputeGroupStreaks,
} from "@/lib/scoring";
import { palatStageForMatch } from "@/lib/palat";
import { getSessionUser } from "@/lib/auth/get-session";
import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { MemberRole } from "@/generated/prisma";
import { validateHomeTeamChoice } from "@/lib/groups";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Match Result Entry (Super Admin)
// ---------------------------------------------------------------------------

const SubmitMatchResultSchema = z.object({
  matchId: z.string().min(1),
  // Why: result must be a concrete outcome, not "upcoming" — that's the default.
  result: z.enum(["team1_win", "team2_win", "draw", "abandoned"]),
  winnerId: z.string().nullable(),
});

export async function submitMatchResult(
  input: unknown
): Promise<{ data?: { matchId: string }; error?: string }> {
  const parsed = SubmitMatchResultSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { matchId, result, winnerId } = parsed.data;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, leagueId: true, result: true, status: true },
  });
  if (!match) return { error: "Match not found." };

  // Why: Prevent re-scoring an already-completed match.
  if (match.status === "completed" || match.status === "abandoned") {
    return { error: "Match result already entered." };
  }

  // Why: team1_win/team2_win must have a winnerId; draw/abandoned must not.
  if ((result === "team1_win" || result === "team2_win") && !winnerId) {
    return { error: "Winner must be specified for a win result." };
  }
  if ((result === "draw" || result === "abandoned") && winnerId) {
    return { error: "Winner must not be specified for draw/abandoned." };
  }

  const newStatus = result === "abandoned" ? "abandoned" : "completed";

  await prisma.match.update({
    where: { id: matchId },
    data: {
      result,
      winnerId,
      status: newStatus as "completed" | "abandoned",
    },
  });

  // Why: scoreMatch routes internally to the correct handler (win scoring,
  // draw scoring, or abandoned void+refund) based on the result value.
  await scoreMatch(matchId, result, winnerId);

  revalidatePath(`/admin/league/${match.leagueId}`);
  return { data: { matchId } };
}

// ---------------------------------------------------------------------------
// First Innings Completion (Super Admin)
// ---------------------------------------------------------------------------

const MarkFirstInningsSchema = z.object({
  matchId: z.string().min(1),
});

export async function markFirstInningsComplete(
  input: unknown
): Promise<{ data?: { matchId: string }; error?: string }> {
  const parsed = MarkFirstInningsSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { matchId } = parsed.data;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      leagueId: true,
      status: true,
      firstInningsCompleteTimeUtc: true,
    },
  });
  if (!match) return { error: "Match not found." };

  if (match.firstInningsCompleteTimeUtc) {
    return { error: "First innings already marked complete." };
  }
  if (match.status === "completed" || match.status === "abandoned") {
    return { error: "Cannot mark first innings on a finished match." };
  }

  // Why: Setting this timestamp closes the Palat window across all groups.
  // Status advances to live_second_innings (PRD 6.3).
  await prisma.match.update({
    where: { id: matchId },
    data: {
      firstInningsCompleteTimeUtc: new Date(),
      status: "live_second_innings",
    },
  });

  revalidatePath(`/admin/league/${match.leagueId}`);
  return { data: { matchId } };
}

// ---------------------------------------------------------------------------
// Start Match / Set Live (Super Admin convenience)
// ---------------------------------------------------------------------------

const SetMatchLiveSchema = z.object({
  matchId: z.string().min(1),
});

const CricinfoUrlPattern = /^https?:\/\/(?:www\.)?espncricinfo\.com\/.+/i;

export async function setMatchLive(
  input: unknown
): Promise<{ data?: { matchId: string }; error?: string }> {
  const parsed = SetMatchLiveSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { matchId } = parsed.data;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, leagueId: true, status: true },
  });
  if (!match) return { error: "Match not found." };

  if (match.status !== "upcoming") {
    return { error: "Only upcoming matches can be set live." };
  }

  // Why: Transitions match to first innings so the Palat window opens.
  await prisma.match.update({
    where: { id: matchId },
    data: { status: "live_first_innings" },
  });

  revalidatePath(`/admin/league/${match.leagueId}`);
  return { data: { matchId } };
}

const SetMatchCricinfoUrlSchema = z.object({
  matchId: z.string().min(1),
  espncricinfoUrl: z.string().trim().nullable(),
});

export async function setMatchCricinfoUrl(
  input: unknown,
): Promise<{ data?: { matchId: string; espncricinfoUrl: string | null }; error?: string }> {
  const parsed = SetMatchCricinfoUrlSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { matchId, espncricinfoUrl } = parsed.data;

  if (espncricinfoUrl && !CricinfoUrlPattern.test(espncricinfoUrl)) {
    return { error: "URL must be a valid espncricinfo.com link." };
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, leagueId: true },
  });
  if (!match) return { error: "Match not found." };

  // Why: nullable persistence lets admins intentionally clear stale URLs so
  // the poller can rediscover the current link via Gemini grounding.
  await prisma.match.update({
    where: { id: matchId },
    data: { espncricinfoUrl: espncricinfoUrl ?? null },
  });

  revalidatePath(`/admin/league/${match.leagueId}`);
  return {
    data: {
      matchId,
      espncricinfoUrl: espncricinfoUrl ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Create League (Super Admin)
// ---------------------------------------------------------------------------

const CreateLeagueSchema = z.object({
  name: z.string().min(1).max(100),
  seasonYear: z.number().int().min(2020).max(2099),
});

// Why: Super Admin creates a league to host a tournament schedule.
// The creator is recorded as the league owner.
export async function createLeague(
  input: unknown
): Promise<{ data?: { leagueId: string }; error?: string }> {
  const parsed = CreateLeagueSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const user = await getSessionUser();
  if (!user) return { error: "Not authenticated." };

  const { name, seasonYear } = parsed.data;

  const league = await prisma.league.create({
    data: {
      name,
      seasonYear,
      createdBy: user.id,
    },
  });

  return { data: { leagueId: league.id } };
}

// ---------------------------------------------------------------------------
// Complete League (Super Admin — Season End)
// ---------------------------------------------------------------------------
//
// PRD Section 13 ("Season End Streak"): If a player is on a streak when the
// season ends (no loss to trigger evaluation), the streak bonus is awarded
// based on the final streak length at season close.
//
// PRD Section 8.2 (End-of-Season Flow): Super Admin enters final match result
// → scoring fans out → pending streaks evaluated → home team points finalized
// → final leaderboard published → Organisers review distribution.
// ---------------------------------------------------------------------------

const CompleteLeagueSchema = z.object({
  leagueId: z.string().min(1),
});

export async function completeLeague(
  input: unknown
): Promise<{ data?: { leagueId: string }; error?: string }> {
  const parsed = CompleteLeagueSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { leagueId } = parsed.data;

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, status: true },
  });
  if (!league) return { error: "League not found." };

  if (league.status === "completed") {
    return { error: "League is already completed." };
  }

  // Why: All matches must be resolved before the league can be completed.
  // An unresolved match means results are still pending.
  const unresolvedCount = await prisma.match.count({
    where: { leagueId, result: "upcoming" },
  });

  if (unresolvedCount > 0) {
    return {
      error: `Cannot complete league — ${unresolvedCount} match${unresolvedCount > 1 ? "es" : ""} still have no result.`,
    };
  }

  // Why: Finalize active streaks before transitioning statuses so that
  // any player on a streak at season end receives their bonus (PRD §13).
  await finalizeLeagueStreaks(leagueId);

  // Why: Transition the league and all its groups atomically. Groups move
  // to "completed" so Organisers can review and settle prize distributions.
  await prisma.$transaction([
    prisma.league.update({
      where: { id: leagueId },
      data: { status: "completed" },
    }),
    prisma.group.updateMany({
      where: { leagueId, status: { in: ["pre_season", "active"] } },
      data: { status: "completed" },
    }),
  ]);

  revalidatePath(`/admin/league/${leagueId}`);
  return { data: { leagueId } };
}

// ---------------------------------------------------------------------------
// Reverse Match Result (Super Admin — Error Correction)
// ---------------------------------------------------------------------------
//
// PRD Section 13 ("Ledger Immutability"): Corrections are made by appending
// compensating negative entries across all affected Groups, never by editing
// or deleting rows.
//
// This action voids a previously entered result by:
//   1. Appending negative compensating PointsLedger entries to zero-out all
//      points awarded for this match (preserving append-only semantics).
//   2. Refunding any Palat usages on the match.
//   3. Recomputing streak state for all affected groups (since the original
//      result may have advanced or broken streaks).
//   4. Resetting the match status to "upcoming" so a new result can be entered.
// ---------------------------------------------------------------------------

const ReverseMatchResultSchema = z.object({
  matchId: z.string().min(1),
});

export async function reverseMatchResult(
  input: unknown
): Promise<{ data?: { matchId: string }; error?: string }> {
  const parsed = ReverseMatchResultSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { matchId } = parsed.data;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, leagueId: true, result: true, status: true, stage: true },
  });
  if (!match) return { error: "Match not found." };

  // Why: Only completed or abandoned matches can be reversed. An upcoming
  // match has no result to undo.
  if (match.result === "upcoming") {
    return { error: "Match has no result to reverse." };
  }

  // --- 1. Compensating ledger entries ----------------------------------------
  const existingEntries = await prisma.pointsLedger.findMany({
    where: { matchId },
    select: { userId: true, groupId: true, source: true, points: true },
  });

  const compensations = existingEntries.map((e) => ({
    userId: e.userId,
    groupId: e.groupId,
    matchId,
    source: e.source,
    points: -e.points,
  }));

  // --- 2. Refund Palat usages ------------------------------------------------
  const palatBets = await prisma.bet.findMany({
    where: { matchId, hasPalated: true },
    select: { userId: true, groupId: true },
  });

  const stage = palatStageForMatch(match.stage);

  // --- 3. Apply compensations, refund Palat, reset match in one transaction --
  await prisma.$transaction([
    ...(compensations.length > 0
      ? [prisma.pointsLedger.createMany({ data: compensations })]
      : []),
    ...palatBets.map((bet) =>
      prisma.palatUsage.update({
        where: {
          userId_groupId_stage: {
            userId: bet.userId,
            groupId: bet.groupId,
            stage,
          },
        },
        data: { usedCount: { decrement: 1 } },
      }),
    ),
    // Why: Reset match to upcoming so a corrected result can be entered.
    prisma.match.update({
      where: { id: matchId },
      data: {
        result: "upcoming",
        status: "upcoming",
        winnerId: null,
        firstInningsCompleteTimeUtc: null,
      },
    }),
  ]);

  // --- 4. Recompute streaks for all affected groups --------------------------
  // Why: The original result modified streak counters. Since we've voided the
  // match, we must rebuild streak state from the remaining completed matches.
  const affectedGroupIds = [
    ...new Set(existingEntries.map((e) => e.groupId)),
  ];

  for (const groupId of affectedGroupIds) {
    await recomputeGroupStreaks(groupId);
  }

  // Why: If no ledger entries existed (e.g. abandoned match with no prior
  // scoring), we still need to recompute streaks for all groups in the league
  // because the abandoned status may have been set after a scoring pass.
  if (affectedGroupIds.length === 0) {
    const groups = await prisma.group.findMany({
      where: { leagueId: match.leagueId },
      select: { id: true },
    });
    for (const group of groups) {
      await recomputeGroupStreaks(group.id);
    }
  }

  revalidatePath(`/admin/league/${match.leagueId}`);
  return { data: { matchId } };
}

// ---------------------------------------------------------------------------
// Player management (Super Admin)
// ---------------------------------------------------------------------------

/**
 * Deletes points, bets, palat, and streak rows for a user within a group, then the membership.
 * Why: those tables reference `userId` + `groupId`, not `group_memberships.id`, so Prisma will not
 * cascade when removing a membership row alone.
 */
async function deleteGroupScopedDataAndMembership(
  membershipId: string,
): Promise<{ leagueId: string } | null> {
  const membership = await prisma.groupMembership.findUnique({
    where: { id: membershipId },
    select: { id: true, userId: true, groupId: true, leagueId: true },
  });
  if (!membership) return null;

  const { userId, groupId } = membership;

  await prisma.$transaction(async (tx) => {
    await tx.pointsLedger.deleteMany({ where: { userId, groupId } });
    await tx.bet.deleteMany({ where: { userId, groupId } });
    await tx.palatUsage.deleteMany({ where: { userId, groupId } });
    await tx.streak.deleteMany({ where: { userId, groupId } });
    await tx.groupMembership.delete({ where: { id: membershipId } });
  });

  return { leagueId: membership.leagueId };
}

async function assertAdmin(): Promise<{ error: string } | null> {
  if (!(await isAdminAuthenticated())) {
    return { error: "Unauthorized." };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Manual cron trigger — sync match statuses and IPL standings on demand.
// Useful during local development (Vercel crons don't run on localhost) and
// as an emergency refresh button in production.
// ---------------------------------------------------------------------------

const TriggerSyncSchema = z.object({
  leagueId: z.string().min(1),
});

export interface ManualSyncResult {
  polled: number;
  updated: number;
  standingsUpdated: boolean;
  error?: string;
}

export async function triggerManualSync(
  input: unknown,
): Promise<{ data?: ManualSyncResult; error?: string }> {
  const auth = await assertAdmin();
  if (auth) return auth;

  const parsed = TriggerSyncSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { leagueId } = parsed.data;

  // Import here to avoid making heavy modules part of the default server-action
  // bundle — they are only loaded when this action is actually invoked.
  const { pollAndUpdateMatches } = await import("@/lib/match-poller");
  const { updateStandingsFromCricinfo } = await import("@/lib/standings-scraper");

  let polled = 0;
  let updated = 0;
  let standingsUpdated = false;

  try {
    const summary = await pollAndUpdateMatches();
    polled = summary.polled;
    updated = summary.updated;
  } catch {
    return { error: "Match poll failed." };
  }

  try {
    const standings = await updateStandingsFromCricinfo(leagueId);
    standingsUpdated = standings.updated;

    if (standings.updated) {
      revalidatePath(`/group/[groupId]/leaderboard`, "page");
      revalidatePath(`/group/[groupId]`, "page");
    }
  } catch {
    // Standings failure is non-fatal — match poll already succeeded.
  }

  revalidatePath(`/admin/league/${leagueId}`);

  return { data: { polled, updated, standingsUpdated } };
}

function revalidateLeagueAdminPaths(leagueId: string): void {
  revalidatePath(`/admin/league/${leagueId}`);
  revalidatePath(`/admin/league/${leagueId}/players`);
}

const RemovePlayerFromLeagueSchema = z.object({
  membershipId: z.string().min(1),
});

export async function removePlayerFromLeague(
  input: unknown,
): Promise<{ data?: { membershipId: string }; error?: string }> {
  const auth = await assertAdmin();
  if (auth) return auth;

  const parsed = RemovePlayerFromLeagueSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { membershipId } = parsed.data;

  const result = await deleteGroupScopedDataAndMembership(membershipId);
  if (!result) return { error: "Membership not found." };

  revalidateLeagueAdminPaths(result.leagueId);
  return { data: { membershipId } };
}

const BanPlayerFromLeagueSchema = z.object({
  userId: z.string().min(1),
  leagueId: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
});

export async function banPlayerFromLeague(
  input: unknown,
): Promise<{ data?: { userId: string; leagueId: string }; error?: string }> {
  const auth = await assertAdmin();
  if (auth) return auth;

  const parsed = BanPlayerFromLeagueSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { userId, leagueId, reason } = parsed.data;

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true },
  });
  if (!league) return { error: "League not found." };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return { error: "User not found." };

  await prisma.$transaction(async (tx) => {
    const m = await tx.groupMembership.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
      select: { id: true, userId: true, groupId: true },
    });
    if (m) {
      await tx.pointsLedger.deleteMany({
        where: { userId: m.userId, groupId: m.groupId },
      });
      await tx.bet.deleteMany({
        where: { userId: m.userId, groupId: m.groupId },
      });
      await tx.palatUsage.deleteMany({
        where: { userId: m.userId, groupId: m.groupId },
      });
      await tx.streak.deleteMany({
        where: { userId: m.userId, groupId: m.groupId },
      });
      await tx.groupMembership.delete({ where: { id: m.id } });
    }

    // Why: upsert lets an admin re-record a ban with an updated reason if needed.
    await tx.leagueBan.upsert({
      where: { userId_leagueId: { userId, leagueId } },
      create: { userId, leagueId, reason: reason ?? null },
      update: { reason: reason ?? undefined },
    });
  });

  revalidateLeagueAdminPaths(leagueId);
  return { data: { userId, leagueId } };
}

const UnbanPlayerFromLeagueSchema = z.object({
  userId: z.string().min(1),
  leagueId: z.string().min(1),
});

export async function unbanPlayerFromLeague(
  input: unknown,
): Promise<{ data?: { userId: string; leagueId: string }; error?: string }> {
  const auth = await assertAdmin();
  if (auth) return auth;

  const parsed = UnbanPlayerFromLeagueSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { userId, leagueId } = parsed.data;

  const deleted = await prisma.leagueBan.deleteMany({
    where: { userId, leagueId },
  });
  if (deleted.count === 0) return { error: "Ban not found." };

  revalidateLeagueAdminPaths(leagueId);
  return { data: { userId, leagueId } };
}

const AddPlayerToGroupSchema = z.object({
  userId: z.string().min(1),
  groupId: z.string().min(1),
  homeTeamId: z.string().min(1),
});

export async function addPlayerToGroup(
  input: unknown,
): Promise<{ data?: { membershipId: string }; error?: string }> {
  const auth = await assertAdmin();
  if (auth) return auth;

  const parsed = AddPlayerToGroupSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { userId, groupId, homeTeamId } = parsed.data;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, leagueId: true },
  });
  if (!group) return { error: "Group not found." };

  const leagueId = group.leagueId;

  const ban = await prisma.leagueBan.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
    select: { id: true },
  });
  if (ban) {
    return { error: "User is banned from this league." };
  }

  const existingInLeague = await prisma.groupMembership.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
    select: { id: true },
  });
  if (existingInLeague) {
    return { error: "User already belongs to a group in this league." };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return { error: "User not found." };

  const teamOk = await validateHomeTeamChoice(leagueId, homeTeamId);
  if (!teamOk.ok) {
    return { error: teamOk.error };
  }

  const membership = await prisma.groupMembership.create({
    data: {
      userId,
      groupId,
      leagueId,
      homeTeamId,
      role: MemberRole.player,
    },
    select: { id: true },
  });

  revalidateLeagueAdminPaths(leagueId);
  return { data: { membershipId: membership.id } };
}
