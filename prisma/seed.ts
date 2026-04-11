import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
// Relative path because seed.ts runs outside the Next.js build (no @/ alias)
import { PrismaClient } from "../src/generated/prisma/client.js";
// Why: import `password-hash` directly — `password.ts` uses `server-only`, which breaks `tsx prisma/seed.ts`.
import { hashPassword } from "../src/lib/auth/password-hash";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ---------------------------------------------------------------------------
// Stable IDs so the seed is idempotent and relations are easy to wire up.
// ---------------------------------------------------------------------------

const USER_IDS = {
  admin: "seed_user_admin",
  rahul: "seed_user_rahul",
  priya: "seed_user_priya",
  arjun: "seed_user_arjun",
  sneha: "seed_user_sneha",
  vikram: "seed_user_vikram",
} as const;

const LEAGUE_ID = "seed_league_ipl_2026";
const GROUP_ID = "seed_group_legends";

// All 10 IPL 2026 franchise IDs keyed by short name
const TEAM = {
  CSK: "seed_team_csk",
  MI: "seed_team_mi",
  RCB: "seed_team_rcb",
  KKR: "seed_team_kkr",
  DC: "seed_team_dc",
  SRH: "seed_team_srh",
  PBKS: "seed_team_pbks",
  RR: "seed_team_rr",
  GT: "seed_team_gt",
  LSG: "seed_team_lsg",
} as const;

type TeamKey = keyof typeof TEAM;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic match ID from match number */
function matchId(n: number): string {
  return `seed_match_${String(n).padStart(3, "0")}`;
}

/** Shorthand to build a UTC date for IPL 2026 (March–May window) */
function matchDate(month: number, day: number, hourUtc: number): Date {
  return new Date(Date.UTC(2026, month - 1, day, hourUtc, 0, 0));
}

// ---------------------------------------------------------------------------
// IPL 2026 full league schedule (70 matches) — pairings, dates, and results
// through completed fixtures as of 2026-04-11 (CREX / official order).
// ---------------------------------------------------------------------------

type Outcome =
  | "team1_win"
  | "team2_win"
  | "abandoned"
  | "upcoming"
  | "live_first_innings";

interface FixtureDef {
  matchNumber: number;
  team1: TeamKey;
  team2: TeamKey;
  startTimeUtc: Date;
  outcome: Outcome;
}

/**
 * Double-header first: ~3:30 PM IST ≈ 10:00 UTC.
 * Evening single-header / double-header second: 7:30 PM IST ≈ 14:00 UTC.
 * Why: keeps `startTimeUtc` aligned with real broadcast windows without inventing arbitrary values.
 */
function buildIpl2026Fixtures(): FixtureDef[] {
  const d = matchDate;
  return [
    { matchNumber: 1, team1: "RCB", team2: "SRH", startTimeUtc: d(3, 28, 14), outcome: "team1_win" },
    { matchNumber: 2, team1: "KKR", team2: "MI", startTimeUtc: d(3, 29, 14), outcome: "team2_win" },
    { matchNumber: 3, team1: "CSK", team2: "RR", startTimeUtc: d(3, 30, 14), outcome: "team2_win" },
    { matchNumber: 4, team1: "GT", team2: "PBKS", startTimeUtc: d(3, 31, 14), outcome: "team2_win" },
    { matchNumber: 5, team1: "DC", team2: "LSG", startTimeUtc: d(4, 1, 14), outcome: "team1_win" },
    { matchNumber: 6, team1: "KKR", team2: "SRH", startTimeUtc: d(4, 2, 14), outcome: "team2_win" },
    { matchNumber: 7, team1: "CSK", team2: "PBKS", startTimeUtc: d(4, 3, 14), outcome: "team2_win" },
    { matchNumber: 8, team1: "DC", team2: "MI", startTimeUtc: d(4, 4, 10), outcome: "team1_win" },
    { matchNumber: 9, team1: "GT", team2: "RR", startTimeUtc: d(4, 4, 14), outcome: "team2_win" },
    { matchNumber: 10, team1: "LSG", team2: "SRH", startTimeUtc: d(4, 5, 10), outcome: "team1_win" },
    { matchNumber: 11, team1: "CSK", team2: "RCB", startTimeUtc: d(4, 5, 14), outcome: "team2_win" },
    // Apr 6: rain — no result (CREX / press reports: KKR vs PBKS abandoned)
    { matchNumber: 12, team1: "KKR", team2: "PBKS", startTimeUtc: d(4, 6, 14), outcome: "abandoned" },
    { matchNumber: 13, team1: "MI", team2: "RR", startTimeUtc: d(4, 7, 14), outcome: "team2_win" },
    { matchNumber: 14, team1: "DC", team2: "GT", startTimeUtc: d(4, 8, 14), outcome: "team2_win" },
    { matchNumber: 15, team1: "KKR", team2: "LSG", startTimeUtc: d(4, 9, 14), outcome: "team2_win" },
    { matchNumber: 16, team1: "RCB", team2: "RR", startTimeUtc: d(4, 10, 14), outcome: "team2_win" },
    // 2026-04-11: double-header — first fixture “live” for demo; second still upcoming
    { matchNumber: 17, team1: "PBKS", team2: "SRH", startTimeUtc: d(4, 11, 10), outcome: "live_first_innings" },
    { matchNumber: 18, team1: "CSK", team2: "DC", startTimeUtc: d(4, 11, 14), outcome: "upcoming" },
    { matchNumber: 19, team1: "GT", team2: "LSG", startTimeUtc: d(4, 12, 10), outcome: "upcoming" },
    { matchNumber: 20, team1: "MI", team2: "RCB", startTimeUtc: d(4, 12, 14), outcome: "upcoming" },
    { matchNumber: 21, team1: "RR", team2: "SRH", startTimeUtc: d(4, 13, 14), outcome: "upcoming" },
    { matchNumber: 22, team1: "CSK", team2: "KKR", startTimeUtc: d(4, 14, 14), outcome: "upcoming" },
    { matchNumber: 23, team1: "LSG", team2: "RCB", startTimeUtc: d(4, 15, 14), outcome: "upcoming" },
    { matchNumber: 24, team1: "MI", team2: "PBKS", startTimeUtc: d(4, 16, 14), outcome: "upcoming" },
    { matchNumber: 25, team1: "GT", team2: "KKR", startTimeUtc: d(4, 17, 14), outcome: "upcoming" },
    { matchNumber: 26, team1: "DC", team2: "RCB", startTimeUtc: d(4, 18, 10), outcome: "upcoming" },
    { matchNumber: 27, team1: "CSK", team2: "SRH", startTimeUtc: d(4, 18, 14), outcome: "upcoming" },
    { matchNumber: 28, team1: "KKR", team2: "RR", startTimeUtc: d(4, 19, 10), outcome: "upcoming" },
    { matchNumber: 29, team1: "LSG", team2: "PBKS", startTimeUtc: d(4, 19, 14), outcome: "upcoming" },
    { matchNumber: 30, team1: "GT", team2: "MI", startTimeUtc: d(4, 20, 14), outcome: "upcoming" },
    { matchNumber: 31, team1: "DC", team2: "SRH", startTimeUtc: d(4, 21, 14), outcome: "upcoming" },
    { matchNumber: 32, team1: "LSG", team2: "RR", startTimeUtc: d(4, 22, 14), outcome: "upcoming" },
    { matchNumber: 33, team1: "CSK", team2: "MI", startTimeUtc: d(4, 23, 14), outcome: "upcoming" },
    { matchNumber: 34, team1: "GT", team2: "RCB", startTimeUtc: d(4, 24, 14), outcome: "upcoming" },
    { matchNumber: 35, team1: "DC", team2: "PBKS", startTimeUtc: d(4, 25, 10), outcome: "upcoming" },
    { matchNumber: 36, team1: "RR", team2: "SRH", startTimeUtc: d(4, 25, 14), outcome: "upcoming" },
    { matchNumber: 37, team1: "CSK", team2: "GT", startTimeUtc: d(4, 26, 10), outcome: "upcoming" },
    { matchNumber: 38, team1: "KKR", team2: "LSG", startTimeUtc: d(4, 26, 14), outcome: "upcoming" },
    { matchNumber: 39, team1: "DC", team2: "RCB", startTimeUtc: d(4, 27, 14), outcome: "upcoming" },
    { matchNumber: 40, team1: "PBKS", team2: "RR", startTimeUtc: d(4, 28, 14), outcome: "upcoming" },
    { matchNumber: 41, team1: "MI", team2: "SRH", startTimeUtc: d(4, 29, 14), outcome: "upcoming" },
    { matchNumber: 42, team1: "GT", team2: "RCB", startTimeUtc: d(4, 30, 14), outcome: "upcoming" },
    { matchNumber: 43, team1: "DC", team2: "RR", startTimeUtc: d(5, 1, 14), outcome: "upcoming" },
    { matchNumber: 44, team1: "CSK", team2: "MI", startTimeUtc: d(5, 2, 14), outcome: "upcoming" },
    { matchNumber: 45, team1: "KKR", team2: "SRH", startTimeUtc: d(5, 3, 10), outcome: "upcoming" },
    { matchNumber: 46, team1: "GT", team2: "PBKS", startTimeUtc: d(5, 3, 14), outcome: "upcoming" },
    { matchNumber: 47, team1: "LSG", team2: "MI", startTimeUtc: d(5, 4, 14), outcome: "upcoming" },
    { matchNumber: 48, team1: "CSK", team2: "DC", startTimeUtc: d(5, 5, 14), outcome: "upcoming" },
    { matchNumber: 49, team1: "PBKS", team2: "SRH", startTimeUtc: d(5, 6, 14), outcome: "upcoming" },
    { matchNumber: 50, team1: "LSG", team2: "RCB", startTimeUtc: d(5, 7, 14), outcome: "upcoming" },
    { matchNumber: 51, team1: "DC", team2: "KKR", startTimeUtc: d(5, 8, 14), outcome: "upcoming" },
    { matchNumber: 52, team1: "GT", team2: "RR", startTimeUtc: d(5, 9, 14), outcome: "upcoming" },
    { matchNumber: 53, team1: "CSK", team2: "LSG", startTimeUtc: d(5, 10, 10), outcome: "upcoming" },
    { matchNumber: 54, team1: "MI", team2: "RCB", startTimeUtc: d(5, 10, 14), outcome: "upcoming" },
    { matchNumber: 55, team1: "DC", team2: "PBKS", startTimeUtc: d(5, 11, 14), outcome: "upcoming" },
    { matchNumber: 56, team1: "GT", team2: "SRH", startTimeUtc: d(5, 12, 14), outcome: "upcoming" },
    { matchNumber: 57, team1: "KKR", team2: "RCB", startTimeUtc: d(5, 13, 14), outcome: "upcoming" },
    { matchNumber: 58, team1: "MI", team2: "PBKS", startTimeUtc: d(5, 14, 14), outcome: "upcoming" },
    { matchNumber: 59, team1: "CSK", team2: "LSG", startTimeUtc: d(5, 15, 14), outcome: "upcoming" },
    { matchNumber: 60, team1: "GT", team2: "KKR", startTimeUtc: d(5, 16, 14), outcome: "upcoming" },
    { matchNumber: 61, team1: "PBKS", team2: "RCB", startTimeUtc: d(5, 17, 10), outcome: "upcoming" },
    { matchNumber: 62, team1: "DC", team2: "RR", startTimeUtc: d(5, 17, 14), outcome: "upcoming" },
    { matchNumber: 63, team1: "CSK", team2: "SRH", startTimeUtc: d(5, 18, 14), outcome: "upcoming" },
    { matchNumber: 64, team1: "LSG", team2: "RR", startTimeUtc: d(5, 19, 14), outcome: "upcoming" },
    { matchNumber: 65, team1: "KKR", team2: "MI", startTimeUtc: d(5, 20, 14), outcome: "upcoming" },
    { matchNumber: 66, team1: "CSK", team2: "GT", startTimeUtc: d(5, 21, 14), outcome: "upcoming" },
    { matchNumber: 67, team1: "RCB", team2: "SRH", startTimeUtc: d(5, 22, 14), outcome: "upcoming" },
    { matchNumber: 68, team1: "LSG", team2: "PBKS", startTimeUtc: d(5, 23, 14), outcome: "upcoming" },
    { matchNumber: 69, team1: "MI", team2: "RR", startTimeUtc: d(5, 24, 10), outcome: "upcoming" },
    { matchNumber: 70, team1: "DC", team2: "KKR", startTimeUtc: d(5, 24, 14), outcome: "upcoming" },
  ];
}

function fixtureToMatchRow(f: FixtureDef): {
  matchNumber: number;
  team1Id: string;
  team2Id: string;
  date: Date;
  result: "upcoming" | "team1_win" | "team2_win" | "draw" | "abandoned";
  status: "upcoming" | "live_first_innings" | "live_second_innings" | "completed" | "abandoned";
  winnerId?: string;
} {
  const team1Id = TEAM[f.team1];
  const team2Id = TEAM[f.team2];

  if (f.outcome === "abandoned") {
    return {
      matchNumber: f.matchNumber,
      team1Id,
      team2Id,
      date: f.startTimeUtc,
      result: "abandoned",
      status: "abandoned",
      winnerId: undefined,
    };
  }

  if (f.outcome === "live_first_innings") {
    return {
      matchNumber: f.matchNumber,
      team1Id,
      team2Id,
      date: f.startTimeUtc,
      result: "upcoming",
      status: "live_first_innings",
    };
  }

  if (f.outcome === "upcoming") {
    return {
      matchNumber: f.matchNumber,
      team1Id,
      team2Id,
      date: f.startTimeUtc,
      result: "upcoming",
      status: "upcoming",
    };
  }

  const winnerId = f.outcome === "team1_win" ? team1Id : team2Id;
  return {
    matchNumber: f.matchNumber,
    team1Id,
    team2Id,
    date: f.startTimeUtc,
    result: f.outcome,
    status: "completed",
    winnerId,
  };
}

// ---------------------------------------------------------------------------
// Seed data definitions
// ---------------------------------------------------------------------------

const teams = [
  { id: TEAM.CSK, name: "Chennai Super Kings", shortName: "CSK", primaryColor: "#FCCA06" },
  { id: TEAM.MI, name: "Mumbai Indians", shortName: "MI", primaryColor: "#004BA0" },
  { id: TEAM.RCB, name: "Royal Challengers Bengaluru", shortName: "RCB", primaryColor: "#EC1C24" },
  { id: TEAM.KKR, name: "Kolkata Knight Riders", shortName: "KKR", primaryColor: "#3A225D" },
  { id: TEAM.DC, name: "Delhi Capitals", shortName: "DC", primaryColor: "#004C93" },
  { id: TEAM.SRH, name: "Sunrisers Hyderabad", shortName: "SRH", primaryColor: "#FF822A" },
  { id: TEAM.PBKS, name: "Punjab Kings", shortName: "PBKS", primaryColor: "#DD1F2D" },
  { id: TEAM.RR, name: "Rajasthan Royals", shortName: "RR", primaryColor: "#EA1A85" },
  { id: TEAM.GT, name: "Gujarat Titans", shortName: "GT", primaryColor: "#1C1C1C" },
  { id: TEAM.LSG, name: "Lucknow Super Giants", shortName: "LSG", primaryColor: "#A72056" },
];

const users = [
  { id: USER_IDS.admin, displayName: "Super Admin" },
  { id: USER_IDS.rahul, displayName: "Rahul Sharma" },
  { id: USER_IDS.priya, displayName: "Priya Patel" },
  { id: USER_IDS.arjun, displayName: "Arjun Mehta" },
  { id: USER_IDS.sneha, displayName: "Sneha Reddy" },
  { id: USER_IDS.vikram, displayName: "Vikram Singh" },
];

/** Why: shared demo password for every seeded user; same scrypt digest works for login for all. */
const SHARED_LOGIN_PASSWORD = "Puggy";

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("🌱 Seeding database…");

  // Why: reuse app hashing so `/login` accepts `SHARED_LOGIN_PASSWORD` for every user row.
  const sharedPasswordHash = await hashPassword(SHARED_LOGIN_PASSWORD);

  const fixtureDefs = buildIpl2026Fixtures();
  const matches = fixtureDefs.map(fixtureToMatchRow);

  // Increased timeout because Supabase has network latency on each sequential query
  await prisma.$transaction(async (tx) => {
    // ------ Users ------
    for (const u of users) {
      await tx.user.upsert({
        where: { id: u.id },
        update: { displayName: u.displayName, passwordHash: sharedPasswordHash },
        create: { ...u, passwordHash: sharedPasswordHash },
      });
    }
    console.log(`  ✔ ${users.length} users`);

    // ------ Teams ------
    for (const t of teams) {
      await tx.team.upsert({
        where: { id: t.id },
        update: { name: t.name, shortName: t.shortName, primaryColor: t.primaryColor },
        create: t,
      });
    }
    console.log(`  ✔ ${teams.length} teams`);

    // ------ League ------
    await tx.league.upsert({
      where: { id: LEAGUE_ID },
      update: { name: "IPL 2026", seasonYear: 2026, status: "active" },
      create: {
        id: LEAGUE_ID,
        name: "IPL 2026",
        seasonYear: 2026,
        status: "active",
        createdBy: USER_IDS.admin,
      },
    });
    console.log("  ✔ 1 league (IPL 2026)");

    // ------ LeagueTeams (junction) ------
    for (const t of teams) {
      await tx.leagueTeam.upsert({
        where: { leagueId_teamId: { leagueId: LEAGUE_ID, teamId: t.id } },
        update: {},
        create: { leagueId: LEAGUE_ID, teamId: t.id },
      });
    }
    console.log(`  ✔ ${teams.length} league–team links`);

    // ------ Group ------
    await tx.group.upsert({
      where: { id: GROUP_ID },
      update: { name: "Legends XI", buyInAmount: 500 },
      create: {
        id: GROUP_ID,
        leagueId: LEAGUE_ID,
        name: "Legends XI",
        inviteCode: "LEGENDS2026",
        buyInAmount: 500,
        currency: "INR",
        organiserId: USER_IDS.rahul,
        status: "active",
      },
    });
    console.log("  ✔ 1 group (Legends XI)");

    // ------ Group memberships ------
    // Rahul is the organiser; the rest are players.
    // Why: `homeTeamId` is optional here so any member without one gets a random IPL franchise for the league.
    const members: Array<{
      userId: string;
      role: "organiser" | "player";
      homeTeamId?: string;
      hasPaid: boolean;
    }> = [
      { userId: USER_IDS.rahul, role: "organiser", homeTeamId: TEAM.CSK, hasPaid: true },
      { userId: USER_IDS.priya, role: "player", homeTeamId: TEAM.MI, hasPaid: true },
      { userId: USER_IDS.arjun, role: "player", homeTeamId: TEAM.RCB, hasPaid: true },
      { userId: USER_IDS.sneha, role: "player", hasPaid: true },
      { userId: USER_IDS.vikram, role: "player", homeTeamId: TEAM.DC, hasPaid: true },
    ];

    const leagueTeamIds = Object.values(TEAM) as string[];
    const resolvedMembers = members.map((m) => ({
      ...m,
      homeTeamId:
        m.homeTeamId ??
        leagueTeamIds[Math.floor(Math.random() * leagueTeamIds.length)]!,
    }));

    for (const m of resolvedMembers) {
      await tx.groupMembership.upsert({
        where: { userId_leagueId: { userId: m.userId, leagueId: LEAGUE_ID } },
        update: { homeTeamId: m.homeTeamId, role: m.role, hasPaid: m.hasPaid },
        create: {
          userId: m.userId,
          groupId: GROUP_ID,
          leagueId: LEAGUE_ID,
          homeTeamId: m.homeTeamId,
          role: m.role,
          hasPaid: m.hasPaid,
        },
      });
    }
    console.log(`  ✔ ${members.length} group memberships`);

    // ------ Matches ------
    for (const m of matches) {
      await tx.match.upsert({
        where: { leagueId_matchNumber: { leagueId: LEAGUE_ID, matchNumber: m.matchNumber } },
        update: {
          team1Id: m.team1Id,
          team2Id: m.team2Id,
          startTimeUtc: m.date,
          result: m.result,
          status: m.status,
          winnerId: m.winnerId ?? null,
        },
        create: {
          id: matchId(m.matchNumber),
          leagueId: LEAGUE_ID,
          matchNumber: m.matchNumber,
          team1Id: m.team1Id,
          team2Id: m.team2Id,
          startTimeUtc: m.date,
          stage: "league",
          result: m.result,
          status: m.status,
          winnerId: m.winnerId ?? null,
        },
      });
    }
    console.log(`  ✔ ${matches.length} matches`);

    // ------ Bets on first five completed league matches (real IPL 2026 results) ------
    const playerIds = [USER_IDS.rahul, USER_IDS.priya, USER_IDS.arjun, USER_IDS.sneha, USER_IDS.vikram];
    const completedMatches = matches.filter((m) => m.status === "completed").sort((a, b) => a.matchNumber - b.matchNumber);
    const betSample = completedMatches.slice(0, 5);

    // Bet selections — rows are players, cols are matches 1–5.
    // true = picked team1, false = picked team2 (same narrative as before: Rahul perfect, Vikram 0/5).
    const picks: boolean[][] = [
      [true, false, false, false, true],
      [true, true, true, false, true],
      [false, false, true, false, false],
      [true, false, true, false, true],
      [false, true, true, true, false],
    ];

    let betCount = 0;
    for (let pi = 0; pi < playerIds.length; pi++) {
      for (let mi = 0; mi < betSample.length; mi++) {
        const m = betSample[mi];
        const pickedTeam1 = picks[pi][mi];
        const selectedTeamId = pickedTeam1 ? m.team1Id : m.team2Id;
        const betId = `seed_bet_p${pi}_m${m.matchNumber}`;

        await tx.bet.upsert({
          where: { userId_matchId_groupId: { userId: playerIds[pi], matchId: matchId(m.matchNumber), groupId: GROUP_ID } },
          update: { selectedTeamId },
          create: {
            id: betId,
            userId: playerIds[pi],
            groupId: GROUP_ID,
            matchId: matchId(m.matchNumber),
            selectedTeamId,
            betType: "standard",
            lockedAt: m.date,
          },
        });
        betCount++;
      }
    }
    console.log(`  ✔ ${betCount} bets on completed matches`);

    // ------ Points ledger entries for completed match bets ------
    // +10 for a correct standard bet, 0 for incorrect (no negative rows needed)
    const CORRECT_BET_POINTS = 10;
    let ledgerCount = 0;

    for (let pi = 0; pi < playerIds.length; pi++) {
      for (let mi = 0; mi < betSample.length; mi++) {
        const m = betSample[mi];
        const pickedTeam1 = picks[pi][mi];
        const isCorrect =
          (pickedTeam1 && m.result === "team1_win") ||
          (!pickedTeam1 && m.result === "team2_win");

        if (isCorrect) {
          const ledgerId = `seed_pts_p${pi}_m${m.matchNumber}`;
          await tx.pointsLedger.upsert({
            where: { id: ledgerId },
            update: { points: CORRECT_BET_POINTS },
            create: {
              id: ledgerId,
              userId: playerIds[pi],
              groupId: GROUP_ID,
              matchId: matchId(m.matchNumber),
              source: "bet",
              points: CORRECT_BET_POINTS,
            },
          });
          ledgerCount++;
        }
      }
    }

    // Home-team-win bonus: +5 whenever your home team wins a completed match in the sample
    const HOME_TEAM_BONUS = 5;
    // Why: must match resolved membership home teams (including random assignment for Sneha).
    const homeTeams: Record<string, string> = Object.fromEntries(
      resolvedMembers.map((m) => [m.userId, m.homeTeamId]),
    );

    for (const playerId of playerIds) {
      for (const m of betSample) {
        if (m.winnerId === homeTeams[playerId]) {
          const ledgerId = `seed_htw_${playerId.split("_")[2]}_m${m.matchNumber}`;
          await tx.pointsLedger.upsert({
            where: { id: ledgerId },
            update: { points: HOME_TEAM_BONUS },
            create: {
              id: ledgerId,
              userId: playerId,
              groupId: GROUP_ID,
              matchId: matchId(m.matchNumber),
              source: "home_team_win",
              points: HOME_TEAM_BONUS,
            },
          });
          ledgerCount++;
        }
      }
    }
    console.log(`  ✔ ${ledgerCount} points ledger entries`);

    // ------ Streaks ------
    // Why: Rahul went 5/5 on the sample; others reflect partial runs ending at match 5.
    const streakData = [
      { userId: USER_IDS.rahul, currentStreak: 5, lastMatchNumber: betSample[4].matchNumber },
      { userId: USER_IDS.priya, currentStreak: 2, lastMatchNumber: betSample[4].matchNumber },
      { userId: USER_IDS.arjun, currentStreak: 0, lastMatchNumber: betSample[4].matchNumber },
      { userId: USER_IDS.sneha, currentStreak: 2, lastMatchNumber: betSample[4].matchNumber },
      { userId: USER_IDS.vikram, currentStreak: 0, lastMatchNumber: betSample[4].matchNumber },
    ];

    for (const s of streakData) {
      await tx.streak.upsert({
        where: { userId_groupId: { userId: s.userId, groupId: GROUP_ID } },
        update: { currentStreak: s.currentStreak, lastMatchId: matchId(s.lastMatchNumber) },
        create: {
          userId: s.userId,
          groupId: GROUP_ID,
          currentStreak: s.currentStreak,
          lastMatchId: matchId(s.lastMatchNumber),
        },
      });
    }
    console.log(`  ✔ ${streakData.length} streak trackers`);

    // ------ Palat usages ------
    // Initialise league-stage quotas (max 7) for each player
    for (const playerId of playerIds) {
      await tx.palatUsage.upsert({
        where: { userId_groupId_stage: { userId: playerId, groupId: GROUP_ID, stage: "league" } },
        update: {},
        create: {
          userId: playerId,
          groupId: GROUP_ID,
          stage: "league",
          usedCount: 0,
          maxAllowed: 7,
        },
      });
    }
    console.log(`  ✔ ${playerIds.length} palat usage quotas`);

    // ------ Team points table (standings after match 16 + NR for match 12) ------
    // Why: counts mirror IPL rules (2 pts win, 1 pt no-result); NRR rounded for demo readability.
    const standings: { teamId: string; mp: number; w: number; l: number; nr: number; nrr: number; pts: number; rank: number }[] = [
      { teamId: TEAM.RR, mp: 4, w: 4, l: 0, nr: 0, nrr: 2.403, pts: 8, rank: 1 },
      { teamId: TEAM.PBKS, mp: 3, w: 2, l: 0, nr: 1, nrr: 0.637, pts: 5, rank: 2 },
      { teamId: TEAM.RCB, mp: 3, w: 2, l: 1, nr: 0, nrr: 2.501, pts: 4, rank: 3 },
      { teamId: TEAM.DC, mp: 3, w: 2, l: 1, nr: 0, nrr: 1.17, pts: 4, rank: 4 },
      { teamId: TEAM.LSG, mp: 3, w: 2, l: 1, nr: 0, nrr: 0.42, pts: 4, rank: 5 },
      { teamId: TEAM.GT, mp: 3, w: 1, l: 2, nr: 0, nrr: -0.31, pts: 2, rank: 6 },
      { teamId: TEAM.MI, mp: 3, w: 1, l: 2, nr: 0, nrr: -0.12, pts: 2, rank: 7 },
      { teamId: TEAM.SRH, mp: 3, w: 1, l: 2, nr: 0, nrr: -0.44, pts: 2, rank: 8 },
      { teamId: TEAM.KKR, mp: 4, w: 0, l: 3, nr: 1, nrr: -0.85, pts: 1, rank: 9 },
      { teamId: TEAM.CSK, mp: 3, w: 0, l: 3, nr: 0, nrr: -2.517, pts: 0, rank: 10 },
    ];

    for (const s of standings) {
      await tx.teamPointsTable.upsert({
        where: { leagueId_teamId: { leagueId: LEAGUE_ID, teamId: s.teamId } },
        update: {
          matchesPlayed: s.mp,
          wins: s.w,
          losses: s.l,
          noResults: s.nr,
          netRunRate: s.nrr,
          points: s.pts,
          rank: s.rank,
        },
        create: {
          leagueId: LEAGUE_ID,
          teamId: s.teamId,
          matchesPlayed: s.mp,
          wins: s.w,
          losses: s.l,
          noResults: s.nr,
          netRunRate: s.nrr,
          points: s.pts,
          rank: s.rank,
        },
      });
    }
    console.log(`  ✔ ${standings.length} team standings rows`);
  }, {
    // 60s timeout — each upsert is a network roundtrip to Supabase
    timeout: 120_000,
  });

  // Why: any non-seed users (or restored DBs) still get the shared password and paid status.
  await prisma.user.updateMany({ data: { passwordHash: sharedPasswordHash } });
  await prisma.groupMembership.updateMany({ data: { hasPaid: true } });

  // Why: if a row points at a team not in its league (or legacy bad data), pick a random valid league team.
  const memberships = await prisma.groupMembership.findMany({
    select: { id: true, leagueId: true, homeTeamId: true },
  });
  const leagueTeamsCache = new Map<string, string[]>();
  for (const row of memberships) {
    let teamIds = leagueTeamsCache.get(row.leagueId);
    if (!teamIds) {
      const rows = await prisma.leagueTeam.findMany({
        where: { leagueId: row.leagueId },
        select: { teamId: true },
      });
      teamIds = rows.map((r) => r.teamId);
      leagueTeamsCache.set(row.leagueId, teamIds);
    }
    if (teamIds.length === 0) continue;
    const valid = teamIds.includes(row.homeTeamId);
    if (!valid) {
      const homeTeamId = teamIds[Math.floor(Math.random() * teamIds.length)]!;
      await prisma.groupMembership.update({
        where: { id: row.id },
        data: { homeTeamId },
      });
    }
  }

  console.log("\n✅ Seed complete!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
