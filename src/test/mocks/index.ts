/**
 * Shared Vitest mocks for server actions and Next.js request APIs.
 *
 * **Always-on (via `src/test/vitest-setup.ts`):**
 * - `next/headers` → `@/test/mocks/next-headers-module` (re-exported through async `vi.mock`)
 * - `@/lib/prisma` → `prismaMock` from `@/test/mocks/prisma-client`
 *
 * **Opt-in:** import the module and register a `vi.mock` in the test file, e.g.
 * `vi.mock("@/lib/auth/session-token", () => import("@/test/mocks/session-token"))`
 */
export {
  nextHeadersMocks,
  resetNextHeadersMocks,
} from "@/test/mocks/next-headers";
export {
  createPrismaMock,
  prismaMock,
  resetPrismaMock,
  type PrismaMock,
} from "@/test/mocks/prisma-client";
export {
  resetSessionTokenMocks,
  signSessionToken,
  verifySessionToken,
} from "@/test/mocks/session-token";
export { checkInviteRateLimit, resetRateLimitMock } from "@/test/mocks/rate-limit";
export {
  getEligibleHomeTeams,
  resetGroupsMocks,
  validateHomeTeamChoice,
} from "@/test/mocks/groups";
