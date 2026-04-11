import { vi } from "vitest";

/**
 * Optional fake for invite rate limiting — default allows all calls; override to simulate exhaustion.
 * Why: `checkInviteRateLimit` is in-memory and time-dependent; mocking yields a stable `RATE_LIMIT` branch.
 */
export const checkInviteRateLimit = vi.fn((): boolean => true);

export function resetRateLimitMock(): void {
  checkInviteRateLimit.mockReset();
  checkInviteRateLimit.mockImplementation(() => true);
}
