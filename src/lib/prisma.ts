import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "@/generated/prisma";

/**
 * Single Prisma client + pg pool for the app (AGENTS.md singleton pattern).
 * Why adapter-pg: Prisma 7 requires a driver adapter or Accelerate URL for the client.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: pg.Pool | undefined;
};

function getPool(): pg.Pool {
  if (globalForPrisma.pool) {
    return globalForPrisma.pool;
  }
  // Why: On Vercel, `DATABASE_URL` should use Supabase’s *Transaction* pooler (port 6543,
  // host like `…pooler.supabase.com`), not the direct host `db.<project>.supabase.co:5432`.
  // The direct URL often fails from serverless with “Can’t reach database server” (IPv6 / routing).
  // Prisma needs `?pgbouncer=true` on pooler URLs. Migrations use `MIGRATE_DATABASE_URL` (session pooler); see prisma.config.ts.
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  globalForPrisma.pool = new pg.Pool({ connectionString: url });
  return globalForPrisma.pool;
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(getPool()),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Why: always cache on globalThis so warm Vercel invocations reuse the same
// client + pg.Pool instead of creating a new pool per request, which would
// exhaust the database's connection limit under any real load.
globalForPrisma.prisma = prisma;
