import { vi } from "vitest";

/**
 * Optional stand-ins for JWT helpers when tests must avoid real signing (`AUTH_SECRET`, jose).
 * Why: add `vi.mock("@/lib/auth/session-token", () => import("@/test/mocks/session-token"))` in a test file to use these.
 */
export const signSessionToken = vi.fn(async (userId: string): Promise<string> => {
  return `mock-jwt-${userId}`;
});

export const verifySessionToken = vi.fn(
  async (): Promise<{ userId: string } | null> => {
    return null;
  },
);

/**
 * Reset default implementations between examples when this module is mocked.
 */
export function resetSessionTokenMocks(): void {
  signSessionToken.mockReset();
  signSessionToken.mockImplementation(async (userId: string) => `mock-jwt-${userId}`);
  verifySessionToken.mockReset();
  verifySessionToken.mockImplementation(async () => null);
}
