import "server-only";

import type { PointSource } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { palatStageForMatch } from "@/lib/palat";

// --------------------------------------------------------------------------
// Scoring engine — processes a match result across every Group in the League.
//
// Called by the Super Admin after entering a match result. Each Group's bets
// are evaluated independently, and the append-only PointsLedger receives new
// rows for every point award.
//
// PRD references: Sections 5.4, 6.2, 6.3, 6.4, 6.5, 6.6, 7.3, 13.
// --------------------------------------------------------------------------

// Points awarded per bet outcome (PRD Section 9).
const STANDARD_WIN_POINTS = 2;
const PALAT_WIN_POINTS = 1;
const DOUBLE_DOWN_WIN_POINTS = 4;
const DRAW_POINTS = 1;
const HOME_TEAM_WIN_POINTS = 1;

// Streak bonus thresholds and values (PRD Section 6.5).
const STREAK_WINDOW = 5;
const STREAK_BIRDIE_THRESHOLD = 3;
const STREAK_EAGLE_THRESHOLD = 4;
const ALBATROSS_BONUS = 7;
const EAGLE_BONUS = 5;
const BIRDIE_BONUS = 2;

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Score a match after the Super Admin enters its result. Routes to the
 * appropriate handler based on the outcome (win, draw, abandoned).
 *
 * Why accept result/winnerId as params: the admin action already has these
 * values validated — passing them avoids re-reading fields we already have.
 * The function still reads the match for leagueId to fan out across groups.
 */
export async function scoreMatch(
  matchId: string,
  result: string,
  winnerId: string | null,
): Promise<void> {
  if (result === "abandoned") {
    await handleAbandonedMatch(matchId);
    return;
  }

  // Why: Prevents duplicate ledger rows if the function is called twice.
  const alreadyScored = await prisma.pointsLedger.findFirst({
    where: { matchId },
    select: { id: true },
  });
  if (alreadyScored) return;

  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: { leagueId: true },
  });

  const groups = await prisma.group.findMany({
    where: { leagueId: match.leagueId },
    select: { id: true },
  });

  if (result === "draw") {
    for (const group of groups) {
      await scoreGroupForDraw(matchId, group.id);
    }
    return;
  }

  // team1_win or team2_win — winnerId must be present.
  if (!winnerId) {
    throw new Error(`Match ${matchId} has result "${result}" but no winnerId.`);
  }

  for (const group of groups) {
    await scoreGroupForWin(matchId, group.id, winnerId);
  }
}

/**
 * Void an abandoned match: refund Palat usage and compensate any previously
 * scored points with negative ledger entries. Streaks are NOT affected.
 * (PRD Section 7.3)
 */
export async function voidAbandonedMatch(matchId: string): Promise<void> {
  await handleAbandonedMatch(matchId);
}

/**
 * Award pending streak bonuses for every group in a league at season end.
 * Any active streak that never broke still qualifies for its bonus.
 * (PRD Section 13: "Season End Streak")
 */
export async function finalizeLeagueStreaks(leagueId: string): Promise<void> {
  const groups = await prisma.group.findMany({
    where: { leagueId },
    select: { id: true },
  });

  for (const group of groups) {
    await finalizeGroupStreaks(group.id);
  }
}

/**
 * Award pending streak bonuses for a single group. Exported for cases where
 * only one group needs finalization (e.g. group-level settlement).
 */
export async function finalizeGroupStreaks(groupId: string): Promise<void> {
  // Why gte STREAK_BIRDIE_THRESHOLD: streaks below 3 earn no bonus.
  const streaks = await prisma.streak.findMany({
    where: { groupId, currentStreak: { gte: STREAK_BIRDIE_THRESHOLD } },
  });

  const ledgerEntries: LedgerEntry[] = [];

  for (const streak of streaks) {
    const bonuses = computeStreakBonuses(streak.currentStreak);
    for (const bonus of bonuses) {
      ledgerEntries.push({
        userId: streak.userId,
        groupId,
        matchId: streak.lastMatchId,
        source: bonus.source,
        points: bonus.points,
      });
    }
  }

  if (ledgerEntries.length === 0 && streaks.length === 0) return;

  // Why transaction: bonus awards and streak resets must be atomic.
  await prisma.$transaction([
    ...(ledgerEntries.length > 0
      ? [prisma.pointsLedger.createMany({ data: ledgerEntries })]
      : []),
    ...streaks.map((s) =>
      prisma.streak.update({
        where: { id: s.id },
        data: { currentStreak: 0 },
      }),
    ),
  ]);
}

// --------------------------------------------------------------------------
// Internal: score a group for a match with a winner
// --------------------------------------------------------------------------

async function scoreGroupForWin(
  matchId: string,
  groupId: string,
  winnerId: string,
): Promise<void> {
  // Why parallel: bets, members, and streaks are independent reads. Batching
  // avoids sequential round-trips before we start computing.
  const [bets, members, existingStreaks] = await Promise.all([
    prisma.bet.findMany({
      where: { matchId, groupId },
      select: {
        userId: true,
        selectedTeamId: true,
        betType: true,
        hasPalated: true,
        palatTeamId: true,
      },
    }),
    prisma.groupMembership.findMany({
      where: { groupId },
      select: { userId: true, homeTeamId: true },
    }),
    prisma.streak.findMany({
      where: { groupId },
      select: { userId: true, currentStreak: true },
    }),
  ]);

  const betByUser = new Map(bets.map((b) => [b.userId, b]));
  const streakByUser = new Map(existingStreaks.map((s) => [s.userId, s.currentStreak]));

  const ledgerEntries: LedgerEntry[] = [];
  const streakUpserts: { userId: string; newStreak: number }[] = [];

  for (const member of members) {
    // Why outside bet conditional: home team points are awarded to every member
    // whose home team won, regardless of whether they placed a bet (PRD §6.1).
    if (member.homeTeamId === winnerId) {
      ledgerEntries.push({
        userId: member.userId,
        groupId,
        matchId,
        source: "home_team_win",
        points: HOME_TEAM_WIN_POINTS,
      });
    }

    const bet = betByUser.get(member.userId);
    const current = streakByUser.get(member.userId) ?? 0;

    if (!bet) {
      // Missed bet: 0 points, streak resets (PRD Section 6.2).
      appendStreakBonuses(ledgerEntries, member.userId, groupId, matchId, current);
      streakUpserts.push({ userId: member.userId, newStreak: 0 });
      continue;
    }

    // Why palatTeamId: when a player Palats, their effective prediction changes
    // to the new team. selectedTeamId is the original pick. (PRD Section 6.3)
    const effectiveTeamId = bet.hasPalated
      ? bet.palatTeamId!
      : bet.selectedTeamId;

    const isCorrect = effectiveTeamId === winnerId;

    if (isCorrect) {
      const { source, points } = betWinReward(bet.betType, bet.hasPalated);
      ledgerEntries.push({ userId: member.userId, groupId, matchId, source, points });
      streakUpserts.push({ userId: member.userId, newStreak: current + 1 });
    } else {
      // Incorrect prediction: streak breaks, bonus awarded for the peak.
      appendStreakBonuses(ledgerEntries, member.userId, groupId, matchId, current);
      streakUpserts.push({ userId: member.userId, newStreak: 0 });
    }
  }

  // Why transaction: ledger entries and streak mutations for the group must be
  // atomic — a partial write would leave the leaderboard in an inconsistent state.
  await prisma.$transaction(async (tx) => {
    if (ledgerEntries.length > 0) {
      await tx.pointsLedger.createMany({ data: ledgerEntries });
    }

    for (const u of streakUpserts) {
      await tx.streak.upsert({
        where: { userId_groupId: { userId: u.userId, groupId } },
        create: {
          userId: u.userId,
          groupId,
          currentStreak: u.newStreak,
          lastMatchId: matchId,
        },
        update: {
          currentStreak: u.newStreak,
          lastMatchId: matchId,
        },
      });
    }
  });
}

// --------------------------------------------------------------------------
// Internal: score a group for a draw
// --------------------------------------------------------------------------

async function scoreGroupForDraw(
  matchId: string,
  groupId: string,
): Promise<void> {
  // Why only bettors: PRD Section 6.2 says draw awards +1 to every player who
  // placed a bet, not to all group members. Draws don't affect streaks.
  const bets = await prisma.bet.findMany({
    where: { matchId, groupId },
    select: { userId: true },
  });

  const ledgerEntries: LedgerEntry[] = bets.map((bet) => ({
    userId: bet.userId,
    groupId,
    matchId,
    source: "draw" as PointSource,
    points: DRAW_POINTS,
  }));

  if (ledgerEntries.length > 0) {
    await prisma.pointsLedger.createMany({ data: ledgerEntries });
  }
}

// --------------------------------------------------------------------------
// Internal: handle an abandoned match
// --------------------------------------------------------------------------

async function handleAbandonedMatch(matchId: string): Promise<void> {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: { id: true, leagueId: true, stage: true },
  });

  // Why compensating entries: if the match was previously scored (admin error
  // correction), we append negative rows to zero-out the points. The ledger
  // is append-only — we never delete. (PRD Section 13)
  const existingEntries = await prisma.pointsLedger.findMany({
    where: { matchId },
    select: { userId: true, groupId: true, source: true, points: true },
  });

  const compensations: LedgerEntry[] = existingEntries.map((e) => ({
    userId: e.userId,
    groupId: e.groupId,
    matchId,
    source: e.source,
    points: -e.points,
  }));

  // Why refund Palat: PRD Section 7.3 says Palat used on an abandoned match
  // must be refunded so the player doesn't lose a quota slot unfairly.
  const palatBets = await prisma.bet.findMany({
    where: { matchId, hasPalated: true },
    select: { userId: true, groupId: true },
  });

  const stage = palatStageForMatch(match.stage);

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
  ]);

  // Why recompute streaks: if this match was previously scored (e.g. admin
  // entered a result and then corrected to abandoned), the streak records
  // are stale. Abandoned matches are invisible to streaks (PRD §13), so we
  // must rebuild from the remaining completed matches.
  if (existingEntries.length > 0) {
    const affectedGroupIds = [...new Set(existingEntries.map((e) => e.groupId))];
    for (const groupId of affectedGroupIds) {
      await recomputeGroupStreaks(groupId);
    }
  }
}

// --------------------------------------------------------------------------
// Streak bonus computation
// --------------------------------------------------------------------------

interface StreakBonus {
  source: PointSource;
  points: number;
}

/**
 * Compute all streak bonuses owed for a given streak length.
 *
 * Why windowed: PRD Section 6.5 says bonuses repeat every 5 consecutive wins
 * (Birdie at 3,8,13…  Eagle at 4,9,14…  Albatross at 5,10,15…). Within each
 * 5-win window only the highest tier applies ("mutually exclusive per streak
 * window"), but bonuses across windows DO accumulate.
 *
 * Example: streak of 9 that breaks → albatross(7) for window 1 + eagle(5)
 * for partial window 2 = +12 total.
 */
function computeStreakBonuses(streakLength: number): StreakBonus[] {
  if (streakLength < STREAK_BIRDIE_THRESHOLD) return [];

  const bonuses: StreakBonus[] = [];

  // Each complete 5-win window earns an albatross.
  const completeWindows = Math.floor(streakLength / STREAK_WINDOW);
  for (let i = 0; i < completeWindows; i++) {
    bonuses.push({ source: "streak_albatross", points: ALBATROSS_BONUS });
  }

  // The partial window (remainder) earns the highest applicable tier.
  const remainder = streakLength % STREAK_WINDOW;
  if (remainder >= STREAK_EAGLE_THRESHOLD) {
    bonuses.push({ source: "streak_eagle", points: EAGLE_BONUS });
  } else if (remainder >= STREAK_BIRDIE_THRESHOLD) {
    bonuses.push({ source: "streak_birdie", points: BIRDIE_BONUS });
  }

  return bonuses;
}

/**
 * Append streak bonus ledger entries in-place for a breaking streak.
 * No-ops if the streak is too short to qualify.
 */
function appendStreakBonuses(
  entries: LedgerEntry[],
  userId: string,
  groupId: string,
  matchId: string,
  streakLength: number,
): void {
  const bonuses = computeStreakBonuses(streakLength);
  for (const bonus of bonuses) {
    entries.push({ userId, groupId, matchId, source: bonus.source, points: bonus.points });
  }
}

// --------------------------------------------------------------------------
// Bet reward mapping
// --------------------------------------------------------------------------

/**
 * Map bet type and palat status to the ledger source and point value.
 *
 * Why hasPalated takes priority: Palat reduces the payout to +1 regardless
 * of the original bet type. Double Down + Palat is blocked at placement time,
 * but this ordering is defensive. (PRD Sections 6.3, 6.4)
 */
function betWinReward(
  betType: string,
  hasPalated: boolean,
): { source: PointSource; points: number } {
  if (hasPalated) {
    return { source: "palat_bet", points: PALAT_WIN_POINTS };
  }
  if (betType === "double_down") {
    return { source: "double_down_bet", points: DOUBLE_DOWN_WIN_POINTS };
  }
  return { source: "bet", points: STANDARD_WIN_POINTS };
}

// --------------------------------------------------------------------------
// Streak recomputation — rebuild streak state from completed match history.
//
// Why: When a match result is reversed (admin error correction) or an already-
// scored match is later marked abandoned, the streak records become stale.
// Replaying all completed matches in matchNumber order restores correctness
// without violating the append-only ledger. (PRD Section 13)
// --------------------------------------------------------------------------

/**
 * Rebuild the Streak record for every member of a group by replaying all
 * completed matches in matchNumber order. This is expensive but only runs
 * on admin corrections — not on normal scoring flow.
 */
export async function recomputeGroupStreaks(groupId: string): Promise<void> {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    select: { leagueId: true },
  });

  const members = await prisma.groupMembership.findMany({
    where: { groupId },
    select: { userId: true },
  });

  // Why matchNumber order: PRD §13 says "Streak order follows matchNumber
  // sequence", so we replay in that order to get correct streak state.
  const completedMatches = await prisma.match.findMany({
    where: {
      leagueId: group.leagueId,
      status: "completed",
    },
    orderBy: { matchNumber: "asc" },
    select: { id: true, winnerId: true, result: true },
  });

  const streakState = new Map<string, number>();
  for (const m of members) {
    streakState.set(m.userId, 0);
  }

  for (const match of completedMatches) {
    if (match.result === "draw") {
      // Draws are invisible to streaks (PRD §6.2 / §13).
      continue;
    }

    const bets = await prisma.bet.findMany({
      where: { matchId: match.id, groupId },
      select: { userId: true, selectedTeamId: true, hasPalated: true, palatTeamId: true },
    });
    const betByUser = new Map(bets.map((b) => [b.userId, b]));

    for (const m of members) {
      const bet = betByUser.get(m.userId);
      const current = streakState.get(m.userId) ?? 0;

      if (!bet) {
        // Missed bet resets the streak (PRD §6.2).
        streakState.set(m.userId, 0);
        continue;
      }

      const effectiveTeamId = bet.hasPalated ? bet.palatTeamId! : bet.selectedTeamId;
      const isCorrect = effectiveTeamId === match.winnerId;

      streakState.set(m.userId, isCorrect ? current + 1 : 0);
    }
  }

  // Why: Find the last completed match to set lastMatchId on streak records.
  const lastMatch = completedMatches.length > 0
    ? completedMatches[completedMatches.length - 1]!
    : null;

  await prisma.$transaction(
    members.map((m) =>
      prisma.streak.upsert({
        where: { userId_groupId: { userId: m.userId, groupId } },
        create: {
          userId: m.userId,
          groupId,
          currentStreak: streakState.get(m.userId) ?? 0,
          lastMatchId: lastMatch?.id ?? null,
        },
        update: {
          currentStreak: streakState.get(m.userId) ?? 0,
          lastMatchId: lastMatch?.id ?? null,
        },
      }),
    ),
  );
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface LedgerEntry {
  userId: string;
  groupId: string;
  matchId: string | null;
  source: PointSource;
  points: number;
}
