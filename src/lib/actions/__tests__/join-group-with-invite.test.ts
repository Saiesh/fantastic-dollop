import { beforeEach, describe, expect, it, vi } from "vitest";

import { joinGroupWithInvite } from "@/lib/actions/auth";
import { prismaMock } from "@/test/mocks/prisma-client";

/**
 * Hoisted mocks for modules outside the shared Prisma / `next/headers` setup — why: Vitest
 * hoists `vi.mock`; stable refs keep session + invite resolution under explicit control per case.
 */
const mocks = vi.hoisted(() => ({
  checkInviteRateLimit: vi.fn(() => true),
  findGroupByInviteCode: vi.fn(),
  validateHomeTeamChoice: vi.fn(),
  getSessionTokenFromCookie: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  signSessionToken: vi.fn(),
  verifySessionToken: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkInviteRateLimit: mocks.checkInviteRateLimit,
}));

vi.mock("@/lib/auth/resolve-group", () => ({
  findGroupByInviteCode: mocks.findGroupByInviteCode,
}));

vi.mock("@/lib/groups", () => ({
  validateHomeTeamChoice: mocks.validateHomeTeamChoice,
  getEligibleHomeTeams: vi.fn(),
}));

vi.mock("@/lib/auth/session-cookie", () => ({
  clearSessionCookie: mocks.clearSessionCookie,
  getSessionTokenFromCookie: mocks.getSessionTokenFromCookie,
  setSessionCookie: mocks.setSessionCookie,
}));

vi.mock("@/lib/auth/session-token", () => ({
  signSessionToken: mocks.signSessionToken,
  verifySessionToken: mocks.verifySessionToken,
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: vi.fn(),
  hashPassword: mocks.hashPassword,
}));

const GROUP = {
  id: "group-1",
  leagueId: "league-1",
  inviteCode: "INV",
};

const NEW_USER_ID = "new-user-1";
const SESSION_USER_ID = "session-user-1";
const TEAM_ID = "team-1";

function newUserPayload(overrides: Record<string, unknown> = {}) {
  return {
    inviteCode: "INV",
    displayName: "Player One",
    password: "secret",
    homeTeamId: TEAM_ID,
    ...overrides,
  };
}

describe("joinGroupWithInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkInviteRateLimit.mockReturnValue(true);
    mocks.findGroupByInviteCode.mockResolvedValue(GROUP);
    mocks.getSessionTokenFromCookie.mockResolvedValue(null);
    mocks.validateHomeTeamChoice.mockResolvedValue({ ok: true });
    mocks.hashPassword.mockResolvedValue("hashed-password");
    mocks.signSessionToken.mockResolvedValue("signed-token");
    mocks.setSessionCookie.mockResolvedValue(undefined);
    mocks.clearSessionCookie.mockResolvedValue(undefined);
    mocks.verifySessionToken.mockResolvedValue(undefined);
  });

  it("returns RATE_LIMIT when checkInviteRateLimit is exhausted", async () => {
    mocks.checkInviteRateLimit.mockReturnValue(false);

    const result = await joinGroupWithInvite(newUserPayload());

    expect(result).toEqual({
      ok: false,
      error: "Too many attempts. Try again later.",
      code: "RATE_LIMIT",
    });
    expect(mocks.findGroupByInviteCode).not.toHaveBeenCalled();
  });

  it("returns VALIDATION for Zod-invalid payload (missing invite code)", async () => {
    const result = await joinGroupWithInvite({});

    expect(result).toEqual({
      ok: false,
      error: "Invalid input.",
      code: "VALIDATION",
    });
  });

  it("returns INVALID_INVITE when the invite does not resolve to a group", async () => {
    mocks.findGroupByInviteCode.mockResolvedValue(null);

    const result = await joinGroupWithInvite(newUserPayload());

    expect(result).toEqual({
      ok: false,
      error: "That invite code is not valid.",
      code: "INVALID_INVITE",
    });
  });

  describe("new user (no session)", () => {
    it("creates user + membership, signs session, on valid invite and inputs", async () => {
      prismaMock.groupMembership.findFirst.mockResolvedValueOnce(null);
      prismaMock.user.findFirst.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValue({
        id: NEW_USER_ID,
        displayName: "Player One",
        passwordHash: "hashed-password",
      });
      prismaMock.groupMembership.create.mockResolvedValue({} as never);

      const result = await joinGroupWithInvite(newUserPayload());

      expect(result).toEqual({
        ok: true,
        groupId: GROUP.id,
        userId: NEW_USER_ID,
        wasExistingMember: false,
      });
      expect(mocks.hashPassword).toHaveBeenCalledWith("secret");
      expect(mocks.signSessionToken).toHaveBeenCalledWith(NEW_USER_ID);
      expect(mocks.setSessionCookie).toHaveBeenCalledWith("signed-token");
      expect(mocks.validateHomeTeamChoice).toHaveBeenCalledWith(
        GROUP.leagueId,
        TEAM_ID,
      );
    });

    it("returns VALIDATION when display name is missing", async () => {
      const result = await joinGroupWithInvite(
        newUserPayload({ displayName: undefined }),
      );

      expect(result).toEqual({
        ok: false,
        error: "Enter a display name to join.",
        code: "VALIDATION",
      });
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it("returns VALIDATION when password is shorter than 4 characters (Zod rejects before explicit branch)", async () => {
      const result = await joinGroupWithInvite(
        newUserPayload({ password: "abc" }),
      );

      // Why: JoinSchema’s `password: z.string().min(4).optional()` fails first — same code path as other bad payloads.
      expect(result).toEqual({
        ok: false,
        error: "Invalid input.",
        code: "VALIDATION",
      });
    });

    it("returns VALIDATION when display name already exists in group (directs to login)", async () => {
      prismaMock.groupMembership.findFirst.mockResolvedValueOnce({
        userId: "existing",
        user: { id: "existing", displayName: "Player One" },
      } as never);
      prismaMock.leagueBan.findUnique.mockResolvedValue(null);

      const result = await joinGroupWithInvite(newUserPayload());

      expect(result).toEqual({
        ok: false,
        error:
          "This display name is already taken in this group. Sign in on the login page to continue.",
        code: "VALIDATION",
      });
    });

    it("returns BANNED when existing member by name is league-banned", async () => {
      prismaMock.groupMembership.findFirst.mockResolvedValueOnce({
        userId: "banned-user",
        user: { id: "banned-user", displayName: "Banned" },
      } as never);
      prismaMock.leagueBan.findUnique.mockResolvedValue({ id: "ban-1" } as never);

      const result = await joinGroupWithInvite(
        newUserPayload({ displayName: "Banned" }),
      );

      expect(result).toEqual({
        ok: false,
        error: "You are not allowed to join this league.",
        code: "BANNED",
      });
    });

    it("returns NAME_TAKEN when another password user already owns the display name globally", async () => {
      prismaMock.groupMembership.findFirst.mockResolvedValueOnce(null);
      prismaMock.user.findFirst.mockResolvedValueOnce({ id: "other-user" });

      const result = await joinGroupWithInvite(newUserPayload());

      expect(result).toEqual({
        ok: false,
        error:
          "That display name is already taken. Sign in or pick another name.",
        code: "NAME_TAKEN",
      });
    });

    it("returns VALIDATION when home team is missing", async () => {
      prismaMock.groupMembership.findFirst.mockResolvedValueOnce(null);
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      // Why: empty string fails JoinSchema’s `min(1)` — omit the field to reach the server branch.
      const result = await joinGroupWithInvite({
        inviteCode: "INV",
        displayName: "Player One",
        password: "secret",
      });

      expect(result).toEqual({
        ok: false,
        error: "Choose your home IPL team for this league.",
        code: "VALIDATION",
      });
    });

    it("returns VALIDATION with team error when validateHomeTeamChoice fails", async () => {
      prismaMock.groupMembership.findFirst.mockResolvedValueOnce(null);
      prismaMock.user.findFirst.mockResolvedValueOnce(null);
      mocks.validateHomeTeamChoice.mockResolvedValue({
        ok: false,
        error: "Selected team is not part of this league.",
      });

      const result = await joinGroupWithInvite(newUserPayload());

      expect(result).toEqual({
        ok: false,
        error: "Selected team is not part of this league.",
        code: "VALIDATION",
      });
    });
  });

  describe("existing session", () => {
    beforeEach(() => {
      mocks.getSessionTokenFromCookie.mockResolvedValue("jwt-here");
      mocks.verifySessionToken.mockResolvedValue({ userId: SESSION_USER_ID });
    });

    it("returns ok and refreshes cookie when user is already in the group", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: SESSION_USER_ID,
        displayName: "Member",
      } as never);
      prismaMock.leagueBan.findUnique.mockResolvedValue(null);
      prismaMock.groupMembership.findFirst.mockResolvedValueOnce({
        id: "gm-1",
      } as never);

      const result = await joinGroupWithInvite({
        inviteCode: "INV",
        homeTeamId: TEAM_ID,
      });

      expect(result).toEqual({
        ok: true,
        groupId: GROUP.id,
        userId: SESSION_USER_ID,
        wasExistingMember: true,
      });
      expect(mocks.signSessionToken).toHaveBeenCalledWith(SESSION_USER_ID);
      expect(mocks.setSessionCookie).toHaveBeenCalledWith("signed-token");
      expect(prismaMock.groupMembership.create).not.toHaveBeenCalled();
    });

    it("clears session and returns VALIDATION when session user row is missing", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await joinGroupWithInvite({
        inviteCode: "INV",
        homeTeamId: TEAM_ID,
      });

      expect(result).toEqual({
        ok: false,
        error:
          "Session expired. Enter your invite code and display name again.",
        code: "VALIDATION",
      });
      expect(mocks.clearSessionCookie).toHaveBeenCalled();
    });

    it("returns BANNED when user is banned in the league", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: SESSION_USER_ID,
        displayName: "Banned",
      } as never);
      prismaMock.leagueBan.findUnique.mockResolvedValue({ id: "ban" } as never);

      const result = await joinGroupWithInvite({
        inviteCode: "INV",
        homeTeamId: TEAM_ID,
      });

      expect(result).toEqual({
        ok: false,
        error: "You are not allowed to join this league.",
        code: "BANNED",
      });
    });

    it("returns ALREADY_IN_LEAGUE when user belongs to another group in the same league", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: SESSION_USER_ID,
        displayName: "Mover",
      } as never);
      prismaMock.leagueBan.findUnique.mockResolvedValue(null);
      prismaMock.groupMembership.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "other-gm" } as never);

      const result = await joinGroupWithInvite({
        inviteCode: "INV",
        homeTeamId: TEAM_ID,
      });

      expect(result).toEqual({
        ok: false,
        error:
          "You already belong to another group in this league. One group per league per player.",
        code: "ALREADY_IN_LEAGUE",
      });
    });

    it("returns NAME_TAKEN when another member in the group shares the session user's display name", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: SESSION_USER_ID,
        displayName: "DupName",
      } as never);
      prismaMock.leagueBan.findUnique.mockResolvedValue(null);
      prismaMock.groupMembership.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "collision" } as never);

      const result = await joinGroupWithInvite({
        inviteCode: "INV",
        homeTeamId: TEAM_ID,
      });

      expect(result).toEqual({
        ok: false,
        error:
          "Another member in this group already uses that display name.",
        code: "NAME_TAKEN",
      });
    });

    it("returns VALIDATION when home team is missing for a new membership", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: SESSION_USER_ID,
        displayName: "Joiner",
      } as never);
      prismaMock.leagueBan.findUnique.mockResolvedValue(null);
      prismaMock.groupMembership.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      // Why: `homeTeamId: ""` is rejected by Zod before the action’s own checks.
      const result = await joinGroupWithInvite({
        inviteCode: "INV",
      });

      expect(result).toEqual({
        ok: false,
        error: "Choose your home IPL team for this league.",
        code: "VALIDATION",
      });
    });

    it("returns VALIDATION when validateHomeTeamChoice fails for session join", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: SESSION_USER_ID,
        displayName: "Joiner",
      } as never);
      prismaMock.leagueBan.findUnique.mockResolvedValue(null);
      prismaMock.groupMembership.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mocks.validateHomeTeamChoice.mockResolvedValue({
        ok: false,
        error: "This team has been eliminated and is no longer available for home team selection.",
      });

      const result = await joinGroupWithInvite({
        inviteCode: "INV",
        homeTeamId: TEAM_ID,
      });

      expect(result).toEqual({
        ok: false,
        error:
          "This team has been eliminated and is no longer available for home team selection.",
        code: "VALIDATION",
      });
    });

    it("creates membership when session user joins a new group in the league with valid home team", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: SESSION_USER_ID,
        displayName: "Joiner",
      } as never);
      prismaMock.leagueBan.findUnique.mockResolvedValue(null);
      prismaMock.groupMembership.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prismaMock.groupMembership.create.mockResolvedValue({} as never);

      const result = await joinGroupWithInvite({
        inviteCode: "INV",
        homeTeamId: TEAM_ID,
      });

      expect(result).toEqual({
        ok: true,
        groupId: GROUP.id,
        userId: SESSION_USER_ID,
        wasExistingMember: false,
      });
      expect(prismaMock.groupMembership.create).toHaveBeenCalled();
      expect(mocks.setSessionCookie).toHaveBeenCalled();
    });
  });
});
