import { describe, expect, it } from "vitest";

import { prismaMock } from "@/test/mocks/prisma-client";
import { nextHeadersMocks } from "@/test/mocks/next-headers";

/**
 * Ensures global Vitest setup wires `next/headers` and `@/lib/prisma` mocks so action tests can run.
 * Why: fails fast if setup path or aliases break before larger `auth` suites land.
 */
describe("vitest setup", () => {
  it("exposes a prisma stub", () => {
    expect(prismaMock.user.findFirst).toBeDefined();
  });

  it("resolves headers() to a Headers instance", async () => {
    const h = await nextHeadersMocks.headers();
    expect(h).toBeInstanceOf(Headers);
  });
});
