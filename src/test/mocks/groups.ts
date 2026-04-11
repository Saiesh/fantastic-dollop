import { vi } from "vitest";

/**
 * Optional stubs for `@/lib/groups` used by join/login flows when tests should not hit the full league/match graph.
 * Why: `validateHomeTeamChoice` queries teams and matches; swapping these keeps focus on auth branching.
 */
export const getEligibleHomeTeams = vi.fn(async (): Promise<
  {
    id: string;
    name: string;
    shortName: string;
    primaryColor: string | null;
  }[]
> => {
  return [];
});

export const validateHomeTeamChoice = vi.fn(
  async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    return { ok: true };
  },
);

export function resetGroupsMocks(): void {
  getEligibleHomeTeams.mockReset();
  getEligibleHomeTeams.mockImplementation(async () => []);
  validateHomeTeamChoice.mockReset();
  validateHomeTeamChoice.mockImplementation(async () => ({ ok: true }));
}
