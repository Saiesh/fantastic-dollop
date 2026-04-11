import { beforeEach, describe, expect, it, vi } from "vitest";

import { login } from "@/lib/actions/auth";
import { prismaMock } from "@/test/mocks/prisma-client";

/**
 * Hoisted mocks for modules not covered by `vitest-setup.ts` — why: login only needs cookie
 * + token + password helpers mocked; Prisma comes from the shared `prismaMock`.
 */
const mocks = vi.hoisted(() => ({
  setSessionCookie: vi.fn(),
  signSessionToken: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/auth/session-cookie", () => ({
  setSessionCookie: mocks.setSessionCookie,
  getSessionTokenFromCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
}));

vi.mock("@/lib/auth/session-token", () => ({
  signSessionToken: mocks.signSessionToken,
  verifySessionToken: vi.fn(),
}));

/** Why: `login` uses `verifyPassword` only — mock it so tests never touch scrypt or DB. */
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: mocks.verifyPassword,
  hashPassword: vi.fn(),
}));

const invalidCredentials = { ok: false as const, error: "Invalid name or password." };

describe("login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setSessionCookie.mockResolvedValue(undefined);
    mocks.signSessionToken.mockResolvedValue("signed-session-token");
  });

  it("returns ok with userId and sets session when password matches a password user", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      passwordHash: "stored-hash",
    });
    mocks.verifyPassword.mockResolvedValue(true);

    const result = await login({ displayName: "Alice", password: "correct" });

    expect(result).toEqual({ ok: true, userId: "user-1" });
    expect(mocks.signSessionToken).toHaveBeenCalledWith("user-1");
    expect(mocks.setSessionCookie).toHaveBeenCalledWith("signed-session-token");
  });

  it("returns generic failure when password does not match", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      passwordHash: "stored-hash",
    });
    mocks.verifyPassword.mockResolvedValue(false);

    const result = await login({ displayName: "Alice", password: "wrong" });

    expect(result).toEqual(invalidCredentials);
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
    expect(mocks.signSessionToken).not.toHaveBeenCalled();
  });

  it("returns generic failure when no password user exists for that name", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const result = await login({ displayName: "Nobody", password: "secret" });

    expect(result).toEqual(invalidCredentials);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  /**
   * Why: defensive branch if storage ever returns a row without a hash — same UX as
   * “wrong credentials” and must not issue a session.
   */
  it("returns generic failure when user record has no password hash", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      passwordHash: null,
    });

    const result = await login({ displayName: "Alice", password: "secret" });

    expect(result).toEqual(invalidCredentials);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it("returns generic failure for Zod-invalid payload (empty name or password)", async () => {
    await expect(login({ displayName: "", password: "x" })).resolves.toEqual(
      invalidCredentials,
    );
    await expect(login({ displayName: "Bob", password: "" })).resolves.toEqual(
      invalidCredentials,
    );
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  /**
   * Why: join stores normalized names; login must query with the same normalized form so
   * spaced input still resolves to the stored display name.
   */
  it("looks up by normalized display name (trim + collapse internal spaces)", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-2",
      passwordHash: "hash",
    });
    mocks.verifyPassword.mockResolvedValue(true);

    await login({ displayName: "  Foo   Bar  ", password: "secret" });

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        displayName: { equals: "Foo Bar", mode: "insensitive" },
        passwordHash: { not: null },
      },
      select: { id: true, passwordHash: true },
    });
    expect(mocks.verifyPassword).toHaveBeenCalledWith("secret", "hash");
  });

  /** Why: Zod accepts whitespace-only strings; normalization must reject before Prisma. */
  it("returns generic failure when normalized display name is empty", async () => {
    const result = await login({ displayName: "   ", password: "secret" });

    expect(result).toEqual(invalidCredentials);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});
