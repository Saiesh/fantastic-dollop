/**
 * One-off reset: single user "Saiesh", Banana Republic league, one group (invite AbbaPass).
 * Why: destructive local/staging reset without hand-editing many tables; order respects FKs.
 */
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { hashPassword } from "../src/lib/auth/password-hash";
import { normalizeInviteCode } from "../src/lib/auth/invite-code";
import { syncIpl2026LeagueWithClient } from "./ipl-2026-league-sync";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const SAIESH_DISPLAY_NAME = "Saiesh";
const LEAGUE_NAME = "Banana Republic";
const GROUP_NAME = "Abba Pass";
const RAW_INVITE = "AbbaPass";

async function main(): Promise<void> {
  const inviteCode = normalizeInviteCode(RAW_INVITE);
  // Why: match `/login` expectations — seeded users use the same scrypt helper as the app.
  const passwordHash = await hashPassword("Puggy");

  const { leagueId, groupId } = await prisma.$transaction(async (tx) => {
    // Why: cache rows are keyed by external match identity; stale rows confuse live sync after a wipe.
    await tx.matchSyncCache.deleteMany();

    // Why: cascades matches, groups, bets, memberships, ledger, etc.; must run before users (league.createdBy is Restrict).
    await tx.league.deleteMany();

    await tx.user.deleteMany();

    const saiesh = await tx.user.create({
      data: {
        displayName: SAIESH_DISPLAY_NAME,
        passwordHash,
      },
    });

    const league = await tx.league.create({
      data: {
        name: LEAGUE_NAME,
        seasonYear: 2026,
        status: "pre_season",
        createdBy: saiesh.id,
      },
    });

    // Why: group membership requires a home team; league must list teams via LeagueTeam.
    let teams = await tx.team.findMany({ select: { id: true } });
    if (teams.length === 0) {
      const t = await tx.team.create({
        data: {
          name: "Placeholder XI",
          shortName: "PHXI",
          primaryColor: "#000000",
        },
      });
      teams = [{ id: t.id }];
    }

    await tx.leagueTeam.createMany({
      data: teams.map((t) => ({ leagueId: league.id, teamId: t.id })),
      skipDuplicates: true,
    });

    // Why: Saiesh’s home franchise is RCB (catalog name uses Bengaluru; shortName is stable).
    const rcb = await tx.team.findFirst({
      where: { shortName: "RCB" },
      select: { id: true },
    });
    const homeTeamId = rcb?.id ?? teams[0]!.id;

    const group = await tx.group.create({
      data: {
        leagueId: league.id,
        name: GROUP_NAME,
        inviteCode,
        buyInAmount: 500,
        currency: "INR",
        organiserId: saiesh.id,
        status: "pre_season",
      },
    });

    await tx.groupMembership.create({
      data: {
        userId: saiesh.id,
        groupId: group.id,
        leagueId: league.id,
        homeTeamId,
        role: "organiser",
        hasPaid: true,
      },
    });

    return { leagueId: league.id, groupId: group.id };
  });

  // Why: same schedule as production IPL 2026; skip ESPN so reset works offline.
  await syncIpl2026LeagueWithClient(prisma, leagueId, { skipStandings: true });
  await prisma.$transaction([
    prisma.league.update({
      where: { id: leagueId },
      data: { status: "active" },
    }),
    prisma.group.update({
      where: { id: groupId },
      data: { status: "active" },
    }),
  ]);

  console.log("Done. User:", SAIESH_DISPLAY_NAME, "| League:", LEAGUE_NAME, "| Invite:", inviteCode);
  console.log("Player login password (hashed): Puggy — change in production.");
  console.log(
    "Note: /admin uses ADMIN_PASSWORD (env), not this user row — set ADMIN_PASSWORD to gate the admin UI.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
