/**
 * Serializable leaderboard row for server components and API boundaries (PRD §6.6).
 */
export interface LeaderboardRowDTO {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  homeTeamShortName: string | null;
  homeTeamPrimaryColor: string | null;
  betPoints: number;
  streakBonusPoints: number;
  homeTeamPoints: number;
  totalPoints: number;
  correctPredictions: number;
  doubleDownWins: number;
  currentStreak: number;
  palatLeagueRemaining: number;
  palatLeagueMax: number;
  palatPlayoffRemaining: number;
  palatPlayoffMax: number;
}

export interface GroupLeaderboardDTO {
  groupId: string;
  groupName: string;
  leagueName: string;
  rows: LeaderboardRowDTO[];
  computedAt: string;
}
