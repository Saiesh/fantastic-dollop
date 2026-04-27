/**
 * One-off script: fetches live IPL scores from Gemini and updates the DB.
 * Why: runs outside the Next.js server context where `server-only` is enforced,
 * so it replicates the core sync logic directly without importing server-only modules.
 *
 * Run: npx tsx prisma/trigger-live-sync.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
import { z } from "zod";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "../src/generated/prisma/client.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const LIVE_CACHE_TTL_MS = 12 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Schema (mirrors gemini-live-data.ts)
// ---------------------------------------------------------------------------

const InningsSchema = z.object({
  inningsNumber: z.number(),
  battingTeamShort: z.string(),
  runs: z.number(),
  wickets: z.number(),
  overs: z.string(),
  isComplete: z.boolean(),
});

const MatchSchema = z.object({
  matchNumber: z.number(),
  team1ShortName: z.string(),
  team2ShortName: z.string(),
  matchOngoing: z.boolean(),
  matchStarted: z.boolean(),
  matchScore: z.string(),
  isFirstInnings: z.boolean(),
  firstInningsComplete: z.boolean(),
  tossResult: z.string().nullable(),
  winningTeamShortName: z.string().nullable(),
  resultText: z.string().nullable(),
  innings: z.array(InningsSchema).default([]),
});

type MatchData = z.infer<typeof MatchSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normShort(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function extractJsonObject(text: string): unknown {
  const stripped = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function buildPrompt(
  leagueName: string,
  seasonYear: number,
  matchNumber: number,
  team1Short: string,
  team2Short: string,
): string {
  return `You are a data extraction assistant for the Indian Premier League.

Context: **${leagueName}** (${seasonYear}), **Match ${matchNumber}** — ${team1Short} vs ${team2Short}.

Use Google Search for the current score, toss, and live status of this one fixture.

Return **only** valid JSON (no markdown) for a single object with these exact fields:
{
  "matchNumber": ${matchNumber},
  "team1ShortName": "${team1Short}",
  "team2ShortName": "${team2Short}",
  "matchOngoing": <boolean>,
  "matchStarted": <boolean>,
  "matchScore": "<one line summary or empty string>",
  "isFirstInnings": <boolean>,
  "firstInningsComplete": <boolean>,
  "tossResult": <string or null>,
  "winningTeamShortName": <string or null>,
  "resultText": <string or null>,
  "innings": [
    {
      "inningsNumber": <1 or 2>,
      "battingTeamShort": "<e.g. MI>",
      "runs": <number>,
      "wickets": <number>,
      "overs": "<e.g. 20.0>",
      "isComplete": <boolean>
    }
  ]
}`;
}

async function callGemini(prompt: string): Promise<MatchData | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set");
    return null;
  }

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store" as RequestCache,
    });
  } catch (err) {
    console.error("Gemini fetch failed:", err);
    return null;
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "(unreadable)");
    console.error(`Gemini API error ${res.status}: ${errBody.slice(0, 500)}`);
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const content =
    candidates[0] && typeof candidates[0] === "object"
      ? ((candidates[0] as Record<string, unknown>).content as Record<string, unknown>)
      : {};
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text =
    parts[0] && typeof parts[0] === "object"
      ? ((parts[0] as Record<string, unknown>).text as string)
      : "";

  if (!text) {
    console.error("Empty response from Gemini");
    return null;
  }

  const raw = extractJsonObject(text);
  if (!raw) {
    console.error("Could not parse JSON from Gemini response:", text.slice(0, 300));
    return null;
  }

  const parsed = MatchSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Schema validation failed:", parsed.error.issues);
    return null;
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const activeLeague = await prisma.league.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, seasonYear: true },
  });

  if (!activeLeague) {
    console.log("No active league found.");
    return;
  }

  console.log(`League: ${activeLeague.name} (${activeLeague.seasonYear})`);

  const now = new Date();
  const windowStart = new Date(now.getTime() - 6 * 60 * 60 * 1_000);
  const windowEnd = new Date(now.getTime() + 30 * 60 * 1_000);

  const candidates = await prisma.match.findMany({
    where: {
      leagueId: activeLeague.id,
      status: { in: ["upcoming", "live_first_innings", "live_second_innings"] },
      startTimeUtc: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { startTimeUtc: "asc" },
    select: {
      id: true,
      matchNumber: true,
      status: true,
      startTimeUtc: true,
      team1: { select: { id: true, shortName: true } },
      team2: { select: { id: true, shortName: true } },
    },
  });

  if (candidates.length === 0) {
    console.log("No matches in the live window right now.");
    console.log(`  Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);

    // Show nearest upcoming match for reference
    const next = await prisma.match.findFirst({
      where: {
        leagueId: activeLeague.id,
        status: "upcoming",
        startTimeUtc: { gt: now },
      },
      orderBy: { startTimeUtc: "asc" },
      select: {
        matchNumber: true,
        startTimeUtc: true,
        team1: { select: { shortName: true } },
        team2: { select: { shortName: true } },
      },
    });
    if (next) {
      const istTime = next.startTimeUtc.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      console.log(`  Next match: M${next.matchNumber} ${next.team1.shortName} vs ${next.team2.shortName} at ${istTime} IST`);
    }
    return;
  }

  console.log(`Found ${candidates.length} match(es) in window:`);
  for (const m of candidates) {
    console.log(`  M${m.matchNumber} ${m.team1.shortName} vs ${m.team2.shortName} [${m.status}]`);
  }
  console.log("");

  let synced = 0;
  for (const m of candidates) {
    console.log(`Syncing M${m.matchNumber} ${m.team1.shortName} vs ${m.team2.shortName}…`);
    const prompt = buildPrompt(
      activeLeague.name,
      activeLeague.seasonYear,
      m.matchNumber,
      m.team1.shortName,
      m.team2.shortName,
    );

    const row = await callGemini(prompt);
    if (!row) {
      console.log(`  ✗ Gemini returned nothing`);
      continue;
    }

    // Validate team alignment
    const a = [normShort(m.team1.shortName), normShort(m.team2.shortName)].sort().join("");
    const b = [normShort(row.team1ShortName), normShort(row.team2ShortName)].sort().join("");
    if (a !== b) {
      console.log(`  ✗ Team mismatch: DB has "${m.team1.shortName}/${m.team2.shortName}", Gemini returned "${row.team1ShortName}/${row.team2ShortName}"`);
      continue;
    }

    console.log(`  matchOngoing: ${row.matchOngoing}`);
    console.log(`  matchScore:   ${row.matchScore || "(empty)"}`);
    console.log(`  toss:         ${row.tossResult ?? "(none)"}`);
    console.log(`  resultText:   ${row.resultText ?? "(none)"}`);
    console.log(`  innings:      ${row.innings.length} innings received`);
    for (const inn of row.innings) {
      const status = inn.isComplete ? "complete" : "in progress";
      console.log(`    Inn ${inn.inningsNumber}: ${inn.battingTeamShort} ${inn.runs}/${inn.wickets} (${inn.overs} ov) — ${status}`);
    }

    // Write to MatchSyncCache
    const payload = {
      matches: [row],
      standings: [],
      fetchedAt: new Date().toISOString(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloadJson = payload as unknown as any;
    const fetchedAt = new Date();
    await prisma.matchSyncCache.upsert({
      where: { cacheKey: `live:${m.id}` },
      create: {
        cacheKey: `live:${m.id}`,
        payload: payloadJson,
        fetchedAt,
        expiresAt: new Date(fetchedAt.getTime() + LIVE_CACHE_TTL_MS),
      },
      update: {
        payload: payloadJson,
        fetchedAt,
        expiresAt: new Date(fetchedAt.getTime() + LIVE_CACHE_TTL_MS),
      },
    });
    console.log(`  ✓ Cache written (expires in 12 min)\n`);
    synced += 1;
  }

  console.log(`Done — synced ${synced}/${candidates.length} match(es).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
