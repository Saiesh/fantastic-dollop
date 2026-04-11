import type { BetType, MatchStage, MatchStatus, PointSource } from "@/generated/prisma";

// --------------------------------------------------------------------------
// DTOs crossing the server/client boundary for the betting engine.
// Raw Prisma model types never leak to client components (AGENTS.md rule).
// --------------------------------------------------------------------------

export interface MatchDTO {
  id: string;
  leagueId: string;
  matchNumber: number;
  team1: TeamBriefDTO;
  team2: TeamBriefDTO;
  startTimeUtc: string;
  stage: MatchStage;
  status: MatchStatus;
  winnerId: string | null;
  /** ISO string or null — marks end of the Palat window */
  firstInningsCompleteTimeUtc: string | null;
  /**
   * Why: the live-score route uses this to fall back to HTML scraping when
   * the cricketdata.org API returns no data. Null when not yet discovered.
   */
  espncricinfoUrl: string | null;
}

export interface TeamBriefDTO {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

export interface BetDTO {
  id: string;
  userId: string;
  groupId: string;
  matchId: string;
  selectedTeamId: string;
  betType: BetType;
  hasPalated: boolean;
  palatTeamId: string | null;
  createdAt: string;
  lockedAt: string;
}

export interface PalatUsageDTO {
  stage: "league" | "playoffs";
  usedCount: number;
  maxAllowed: number;
}

export interface PointsLedgerEntryDTO {
  id: string;
  userId: string;
  groupId: string;
  matchId: string | null;
  source: PointSource;
  points: number;
  createdAt: string;
}

/** Returned by server actions — discriminated union keeps error handling typed. */
export type ActionResult<T> =
  | { data: T; error?: never }
  | { error: ActionError; data?: never };

export interface ActionError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}
