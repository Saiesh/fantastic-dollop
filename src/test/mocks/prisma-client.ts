import { vi } from "vitest";

/**
 * Minimal Prisma surface exercised by `login` / `joinGroupWithInvite` tests — extend as new queries are covered.
 * Why: keeps the fake client small; add methods here when tests need them instead of stubbing the whole `PrismaClient` type.
 */
export function createPrismaMock() {
  return {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    groupMembership: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    leagueBan: {
      findUnique: vi.fn(),
    },
  };
}

export const prismaMock = createPrismaMock();

export type PrismaMock = typeof prismaMock;

/**
 * Clear all nested `vi.fn` implementations between tests to avoid leaked resolves/rejects.
 */
export function resetPrismaMock(): void {
  const stack: unknown[] = [prismaMock];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") {
      continue;
    }
    for (const value of Object.values(current)) {
      if (typeof value === "function" && "mockReset" in value) {
        (value as { mockReset: () => void }).mockReset();
      } else if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }
}
