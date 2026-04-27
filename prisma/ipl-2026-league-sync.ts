/**
 * Shared IPL 2026 schedule + optional ESPN standings sync for any league id.
 * Why: `sync-ipl-2026-league.ts` and reset/activate scripts must not duplicate
 * upsert logic; Prisma client is injected so each CLI can use its own pool.
 */

import type { PrismaClient } from "../src/generated/prisma/client.js";
import {
  IPL_2026_TEAM_KEYS,
  buildIpl2026Fixtures,
  fixtureToPrismaMatchData,
  type IplTeamKey,
} from "../src/lib/ipl-2026-schedule";

const ESPN_STANDINGS_URL =
  "https://site.api.espn.com/apis/v2/sports/cricket/8048/standings?season=2026";

export interface SyncIpl2026LeagueOptions {
  /** Why: local/offline runs still need fixtures without calling ESPN. */
  skipStandings?: boolean;
}

interface EspnStandingEntry {
  team: { abbreviation: string };
  stats: Array<{ type: string; value?: number }>;
}

function statVal(
  stats: EspnStandingEntry["stats"],
  type: string,
): number | undefined {
  return stats.find((x) => x.type === type)?.value;
}

interface ParsedStandingsRow {
  abbr: string;
  rank: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  noResults: number;
  points: number;
  netRunRate: number;
}

async function fetchEspnStandings(): Promise<ParsedStandingsRow[]> {
  const res = await fetch(ESPN_STANDINGS_URL);
  if (!res.ok) {
    throw new Error(`ESPN standings HTTP ${res.status}`);
  }
  const json: unknown = await res.json();
  const root = json as {
    children?: Array<{
      standings?: { entries?: EspnStandingEntry[] };
    }>;
  };
  const entries = root.children?.[0]?.standings?.entries;
  if (!entries?.length) {
    throw new Error("ESPN standings: missing entries");
  }

  const rows: ParsedStandingsRow[] = [];
  for (const e of entries) {
    const abbr = e.team.abbreviation;
    const rank = statVal(e.stats, "rank");
    const matchesPlayed = statVal(e.stats, "matchesplayed");
    const wins = statVal(e.stats, "matcheswon");
    const losses = statVal(e.stats, "matcheslost");
    const draws = statVal(e.stats, "matchestied") ?? 0;
    const noResults = statVal(e.stats, "noresult") ?? 0;
    const points = statVal(e.stats, "matchpoints");
    const nrr = statVal(e.stats, "nrr");

    if (
      rank === undefined ||
      matchesPlayed === undefined ||
      wins === undefined ||
      losses === undefined ||
      points === undefined ||
      nrr === undefined
    ) {
      continue;
    }

    rows.push({
      abbr,
      rank,
      matchesPlayed,
      wins,
      losses,
      draws,
      noResults,
      points,
      netRunRate: nrr,
    });
  }

  return rows;
}

/**
 * Upserts all 10 franchises, 70 league-stage matches, and optionally ESPN standings.
 */
export async function syncIpl2026LeagueWithClient(
  prisma: PrismaClient,
  leagueId: string,
  options: SyncIpl2026LeagueOptions = {},
): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, name: true, seasonYear: true },
  });
  if (!league) {
    throw new Error(`League not found: ${leagueId}`);
  }
  if (league.seasonYear !== 2026) {
    console.warn(
      `Warning: league ${league.name} has seasonYear ${league.seasonYear} (expected 2026).`,
    );
  }

  const teamIdByKey = {} as Record<IplTeamKey, string>;
  for (const key of IPL_2026_TEAM_KEYS) {
    const team = await prisma.team.findUnique({
      where: { shortName: key },
      select: { id: true },
    });
    if (!team) {
      throw new Error(
        `Missing Team with shortName "${key}". Create franchise rows before syncing.`,
      );
    }
    teamIdByKey[key] = team.id;
  }

  for (const key of IPL_2026_TEAM_KEYS) {
    await prisma.leagueTeam.upsert({
      where: {
        leagueId_teamId: { leagueId, teamId: teamIdByKey[key] },
      },
      update: {},
      create: { leagueId, teamId: teamIdByKey[key] },
    });
  }
  console.log(`  Linked ${IPL_2026_TEAM_KEYS.length} teams to league ${leagueId}`);

  const fixtureDefs = buildIpl2026Fixtures();
  const rows = fixtureDefs.map((f) =>
    fixtureToPrismaMatchData(f, teamIdByKey),
  );

  for (const m of rows) {
    await prisma.match.upsert({
      where: {
        leagueId_matchNumber: { leagueId, matchNumber: m.matchNumber },
      },
      update: {
        team1Id: m.team1Id,
        team2Id: m.team2Id,
        startTimeUtc: m.startTimeUtc,
        result: m.result,
        status: m.status,
        winnerId: m.winnerId,
        firstInningsCompleteTimeUtc: null,
        stage: "league",
      },
      create: {
        leagueId,
        matchNumber: m.matchNumber,
        team1Id: m.team1Id,
        team2Id: m.team2Id,
        startTimeUtc: m.startTimeUtc,
        result: m.result,
        status: m.status,
        winnerId: m.winnerId,
        stage: "league",
      },
    });
  }
  console.log(`  Upserted ${rows.length} matches`);

  if (options.skipStandings) {
    return;
  }

  try {
    const standingRows = await fetchEspnStandings();
    let standingsCount = 0;
    for (const s of standingRows) {
      const key = s.abbr.toUpperCase() as IplTeamKey;
      if (!(key in teamIdByKey)) {
        continue;
      }
      const teamId = teamIdByKey[key];
      await prisma.teamPointsTable.upsert({
        where: { leagueId_teamId: { leagueId, teamId } },
        update: {
          matchesPlayed: s.matchesPlayed,
          wins: s.wins,
          losses: s.losses,
          draws: s.draws,
          noResults: s.noResults,
          netRunRate: s.netRunRate,
          points: s.points,
          rank: s.rank,
        },
        create: {
          leagueId,
          teamId,
          matchesPlayed: s.matchesPlayed,
          wins: s.wins,
          losses: s.losses,
          draws: s.draws,
          noResults: s.noResults,
          netRunRate: s.netRunRate,
          points: s.points,
          rank: s.rank,
        },
      });
      standingsCount++;
    }
    console.log(`  Updated ${standingsCount} team_points_table rows (ESPN)`);
  } catch (e) {
    console.warn("  ESPN standings skipped (matches still synced):", e);
  }
}
