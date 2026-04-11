"use server";

import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { validateHomeTeamChoice } from "@/lib/groups";
import { revalidatePath } from "next/cache";

// --------------------------------------------------------------------------
// selectHomeTeam — Player picks their home IPL franchise for a Group.
//
// Edge cases enforced (PRD Section 6.1, Section 13):
//   1. Player must be a member of the group.
//   2. Home team selection is immutable once the league starts (first match
//      startTimeUTC has passed). Players who already have a home team
//      cannot change it.
//   3. Late joiners (joining mid-season) are restricted to teams that haven't
//      been eliminated — i.e. teams that still appear in upcoming matches.
//   4. Selected team must be part of the league's team roster.
// --------------------------------------------------------------------------

const SelectHomeTeamSchema = z.object({
  userId: z.string().min(1),
  groupId: z.string().min(1),
  teamId: z.string().min(1),
});

export async function selectHomeTeam(
  input: unknown,
): Promise<{ data?: { membershipId: string }; error?: string }> {
  const parsed = SelectHomeTeamSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input." };

  const { userId, groupId, teamId } = parsed.data;

  const membership = await prisma.groupMembership.findFirst({
    where: { userId, groupId },
    select: { id: true, leagueId: true, homeTeamId: true },
  });

  if (!membership) return { error: "You are not a member of this group." };

  // Why: Check if the league has started by looking for any match whose
  // startTimeUTC is in the past. If it has, existing home team selections
  // are locked (PRD §6.1).
  const leagueId = membership.leagueId;

  const firstStartedMatch = await prisma.match.findFirst({
    where: {
      leagueId,
      startTimeUtc: { lte: new Date() },
    },
    select: { id: true },
  });

  const leagueHasStarted = firstStartedMatch !== null;

  // Why: Once the league has started, a player who already chose a home
  // team cannot change it — the selection is immutable (PRD §6.1).
  if (leagueHasStarted && membership.homeTeamId) {
    return { error: "Home team selection is locked once the league has started." };
  }

  const validation = await validateHomeTeamChoice(leagueId, teamId);
  if (!validation.ok) {
    return { error: validation.error };
  }

  await prisma.groupMembership.update({
    where: { id: membership.id },
    data: { homeTeamId: teamId },
  });

  revalidatePath(`/group/${groupId}`);
  return { data: { membershipId: membership.id } };
}
