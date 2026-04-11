import "server-only";

import { normShort } from "@/lib/cricinfo";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// ESPN standings scraper — fetches the official IPL points table from the
// ESPN site API and upserts into TeamPointsTable.
//
// Why ESPN site API instead of the hs-consumer Cricinfo API: the Cricinfo
// consumer API is behind Akamai CDN which blocks requests from many server
// IPs (including Vercel). The ESPN site API (site.api.espn.com) is publicly
// accessible and returns the same data in a well-structured format.
//
// Why a separate module: standings change once per completed match and need
// a different API endpoint than live scores. Keeping it isolated lets the
// cron job call it independently and makes caching simple.
// ---------------------------------------------------------------------------

// Why 8048: this is ESPN's stable league ID for the Indian Premier League.
// Found via: site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard
const ESPN_IPL_LEAGUE_ID = 8048;
const ESPN_STANDINGS_URL =
  `https://site.api.espn.com/apis/v2/sports/cricket/${ESPN_IPL_LEAGUE_ID}/standings`;

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};

// Cache parsed standings to avoid redundant DB writes when nothing changed.
let standingsHash = "";
let standingsHashAt = 0;
const STANDINGS_MIN_INTERVAL_MS = 120_000; // 2 min — match cron interval

// ---------------------------------------------------------------------------
// Safe property accessors (same pattern as cricinfo.ts)
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ScrapedStandingsRow {
  teamShortName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  noResults: number;
  netRunRate: number;
  points: number;
  rank: number;
}

export interface StandingsUpdateSummary {
  updated: boolean;
  rowCount: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Fetch & parse standings from ESPN site API
// ---------------------------------------------------------------------------

async function fetchStandings(seasonYear: number): Promise<ScrapedStandingsRow[]> {
  try {
    const url = `${ESPN_STANDINGS_URL}?season=${seasonYear}`;
    const res = await fetch(url, {
      headers: REQUEST_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return [];

    const raw = obj(await res.json());
    return parseEspnStandingsResponse(raw);
  } catch {
    return [];
  }
}

/**
 * ESPN standings shape:
 * { children: [{ standings: { entries: [{ team: {...}, stats: [...] }] } }] }
 *
 * Each entry's `stats` is an array of stat objects with `name` and `value`.
 */
function parseEspnStandingsResponse(raw: Record<string, unknown>): ScrapedStandingsRow[] {
  const children = arr(raw.children);
  const rows: ScrapedStandingsRow[] = [];

  for (const child of children) {
    const group = obj(child);
    const standings = obj(group.standings);
    const entries = arr(standings.entries);

    for (let i = 0; i < entries.length; i++) {
      const entry = obj(entries[i]);
      const team = obj(entry.team);
      const teamShortName = str(team.abbreviation ?? team.shortDisplayName ?? "");
      if (!teamShortName) continue;

      // Why: stats are returned as an array of {name, value} objects rather
      // than a flat map; convert to a lookup for clean access.
      const statsArr = arr(entry.stats);
      const stats = new Map<string, number>();
      for (const s of statsArr) {
        const stat = obj(s);
        const name = str(stat.name);
        if (name && typeof stat.value === "number") {
          stats.set(name, stat.value);
        }
      }

      rows.push({
        teamShortName,
        matchesPlayed: stats.get("matchesPlayed") ?? 0,
        wins: stats.get("matchesWon") ?? 0,
        losses: stats.get("matchesLost") ?? 0,
        draws: stats.get("matchesTied") ?? 0,
        noResults: stats.get("noresult") ?? 0,
        netRunRate: stats.get("netrr") ?? 0,
        points: stats.get("matchPoints") ?? 0,
        rank: stats.get("rank") ?? i + 1,
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Match scraped rows to DB teams and upsert TeamPointsTable
// ---------------------------------------------------------------------------

async function upsertStandings(
  leagueId: string,
  rows: ScrapedStandingsRow[],
): Promise<number> {
  // Why: fetch all teams in the league once so we can match by normalized
  // short name without per-row queries.
  const leagueTeams = await prisma.leagueTeam.findMany({
    where: { leagueId },
    select: { teamId: true, team: { select: { shortName: true } } },
  });

  const teamMap = new Map<string, string>();
  for (const lt of leagueTeams) {
    teamMap.set(normShort(lt.team.shortName), lt.teamId);
  }

  let upserted = 0;

  for (const row of rows) {
    const teamId = teamMap.get(normShort(row.teamShortName));
    if (!teamId) continue;

    await prisma.teamPointsTable.upsert({
      where: { leagueId_teamId: { leagueId, teamId } },
      update: {
        matchesPlayed: row.matchesPlayed,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        noResults: row.noResults,
        netRunRate: row.netRunRate,
        points: row.points,
        rank: row.rank,
      },
      create: {
        leagueId,
        teamId,
        matchesPlayed: row.matchesPlayed,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        noResults: row.noResults,
        netRunRate: row.netRunRate,
        points: row.points,
        rank: row.rank,
      },
    });
    upserted++;
  }

  return upserted;
}

// ---------------------------------------------------------------------------
// Public entry point — called by cron after match polling
// ---------------------------------------------------------------------------

export async function updateStandingsFromCricinfo(
  leagueId: string,
): Promise<StandingsUpdateSummary> {
  const now = Date.now();

  // Why: skip if we just updated — standings change at most once per match
  // completion, not every 2-minute cron tick.
  if (standingsHash && now - standingsHashAt < STANDINGS_MIN_INTERVAL_MS) {
    return { updated: false, rowCount: 0, error: null };
  }

  // Why: derive season year from the league so this works across seasons
  // without hardcoding a year.
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { seasonYear: true },
  });
  if (!league) {
    return { updated: false, rowCount: 0, error: "League not found." };
  }

  const rows = await fetchStandings(league.seasonYear);
  if (rows.length === 0) {
    return {
      updated: false,
      rowCount: 0,
      error: "Standings response was empty or unparseable.",
    };
  }

  // Why: compute a fingerprint of the standings to skip redundant DB writes
  // when nothing actually changed between cron cycles.
  const hash = rows
    .map((r) => `${r.teamShortName}:${r.matchesPlayed}:${r.points}:${r.netRunRate}`)
    .join("|");

  if (hash === standingsHash) {
    standingsHashAt = now;
    return { updated: false, rowCount: rows.length, error: null };
  }

  const upserted = await upsertStandings(leagueId, rows);

  standingsHash = hash;
  standingsHashAt = now;

  return { updated: upserted > 0, rowCount: upserted, error: null };
}
