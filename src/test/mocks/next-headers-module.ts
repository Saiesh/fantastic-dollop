import { nextHeadersMocks } from "@/test/mocks/next-headers";

/**
 * Drop-in substitute for `next/headers` named exports used by server actions under test.
 * Why: loaded via `vi.mock("next/headers", () => import(...))` so the mock resolves after `nextHeadersMocks` exists (no hoist issues).
 */
export function cookies() {
  return nextHeadersMocks.cookies();
}

export function headers() {
  return nextHeadersMocks.headers();
}
