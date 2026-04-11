import { afterEach, vi } from "vitest";

/**
 * Why: `next/headers`, `server-only`, and `import "server-only"` are no-ops in Vitest; without
 * this stub, any module that imports `server-only` throws before tests run.
 */
vi.mock("server-only", () => ({}));

import { resetNextHeadersMocks } from "@/test/mocks/next-headers";
import { resetPrismaMock } from "@/test/mocks/prisma-client";

/**
 * Next.js marks server-only modules with `server-only`; Vitest has no RSC boundary, so the real package throws. Stub it so `@/lib/*` server code can load under tests.
 */
vi.mock("server-only", () => ({}));

/**
 * Async factory so `prismaMock` is initialized before the mock binds — avoids `vi.mock` hoist/temporal dead zone issues.
 */
vi.mock("@/lib/prisma", async () => {
  const { prismaMock } = await import("@/test/mocks/prisma-client");
  return { prisma: prismaMock };
});

/**
 * Reuse the same named exports as `next/headers` while keeping mutable state in `next-headers.ts`.
 */
vi.mock("next/headers", async () => {
  return import("@/test/mocks/next-headers-module");
});

afterEach(() => {
  resetNextHeadersMocks();
  resetPrismaMock();
});
