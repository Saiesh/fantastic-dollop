/**
 * Sync IPL 2026 fixtures into the "Banana Republic" league and mark league + groups active.
 * Why: the Saiesh reset path creates an empty pre_season league; this turns on the real schedule for the UI.
 */
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { syncIpl2026LeagueWithClient } from "./ipl-2026-league-sync";

const BANANA_LEAGUE_NAME = "Banana Republic";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const league = await prisma.league.findFirst({
    where: { name: BANANA_LEAGUE_NAME },
    select: { id: true },
  });
  if (!league) {
    throw new Error(`League "${BANANA_LEAGUE_NAME}" not found.`);
  }

  console.log(`Syncing IPL 2026 schedule for "${BANANA_LEAGUE_NAME}"…`);
  await syncIpl2026LeagueWithClient(prisma, league.id);

  await prisma.$transaction([
    prisma.league.update({
      where: { id: league.id },
      data: { status: "active" },
    }),
    prisma.group.updateMany({
      where: { leagueId: league.id },
      data: { status: "active" },
    }),
  ]);

  console.log(`League + groups set to active. Open the group dashboard to see upcoming matches.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
