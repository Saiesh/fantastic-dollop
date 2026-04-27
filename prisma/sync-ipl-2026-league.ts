/**
 * One-off / repeat sync: upserts the full IPL 2026 league-stage schedule (70
 * matches), results for completed fixtures, and the official points table
 * from the ESPN API for a target `League` id.
 *
 * Why: production leagues use real CUIDs for teams/matches — the seed file
 * cannot target them; this script resolves `Team` rows by `shortName` and
 * writes the same canonical schedule as `src/lib/ipl-2026-schedule.ts`.
 *
 * Run: `npx tsx prisma/sync-ipl-2026-league.ts` (requires `DATABASE_URL`).
 */

import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import { PrismaClient } from "../src/generated/prisma/client.js";
import { syncIpl2026LeagueWithClient } from "./ipl-2026-league-sync";

const TARGET_LEAGUE_ID = "cmoh520t5000ocuug5rq2u0xb";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  console.log(`Syncing IPL 2026 data for league ${TARGET_LEAGUE_ID}…`);
  await syncIpl2026LeagueWithClient(prisma, TARGET_LEAGUE_ID);
  console.log("Done.");
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
