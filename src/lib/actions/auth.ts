"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { MemberRole } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { findGroupByInviteCode } from "@/lib/auth/resolve-group";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getEligibleHomeTeams, validateHomeTeamChoice } from "@/lib/groups";
import {
  clearSessionCookie,
  getSessionTokenFromCookie,
  setSessionCookie,
} from "@/lib/auth/session-cookie";
import { signSessionToken, verifySessionToken } from "@/lib/auth/session-token";
import { checkInviteRateLimit } from "@/lib/rate-limit";

const JoinSchema = z.object({
  inviteCode: z.string().min(1).max(32),
  /** Required when no valid session; optional when cookie already identifies the user. */
  displayName: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .nullable(),
  /**
   * Required when joining without a session (new account in this flow).
   * Why: optional in the schema so logged-in users joining another group are not forced to resend it.
   */
  password: z.string().min(4).optional(),
  /**
   * Required when creating a new membership (new user or logged-in user joining a new group).
   */
  homeTeamId: z.string().min(1).optional(),
});

export type JoinGroupResult =
  | {
      ok: true;
      groupId: string;
      userId: string;
      wasExistingMember: boolean;
    }
  | {
      ok: false;
      error: string;
      code?:
        | "ALREADY_IN_LEAGUE"
        | "INVALID_INVITE"
        | "VALIDATION"
        | "RATE_LIMIT"
        | "NAME_TAKEN"
        | "BANNED";
    };

export type LeagueTeamsForInviteResult =
  | {
      ok: true;
      teams: { id: string; name: string; shortName: string; primaryColor: string | null }[];
    }
  | { ok: false; error: "INVALID_INVITE" };

const LoginSchema = z.object({
  displayName: z.string().min(1).max(50),
  password: z.string().min(1),
});

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * Issues a player session after verifying display name + password against stored scrypt hash.
 * Why: returning players sign in here instead of reconnecting by name on the join flow.
 */
export async function login(input: unknown): Promise<LoginResult> {
  const parsed = LoginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid name or password." };
  }

  const displayName = normalizeDisplayName(parsed.data.displayName);
  if (displayName.length === 0) {
    return { ok: false, error: "Invalid name or password." };
  }

  const user = await prisma.user.findFirst({
    where: {
      displayName: { equals: displayName, mode: "insensitive" },
      passwordHash: { not: null },
    },
    select: { id: true, passwordHash: true },
  });

  if (!user?.passwordHash) {
    return { ok: false, error: "Invalid name or password." };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return { ok: false, error: "Invalid name or password." };
  }

  await setSessionCookie(await signSessionToken(user.id));
  return { ok: true, userId: user.id };
}

/**
 * Resolves the invite to a league and returns teams eligible for home-team pick.
 * Why: drives the join form dropdown with the same roster the server will accept.
 */
export async function getLeagueTeamsForInvite(
  rawInvite: string,
): Promise<LeagueTeamsForInviteResult> {
  const group = await findGroupByInviteCode(rawInvite);
  if (!group) {
    return { ok: false, error: "INVALID_INVITE" };
  }
  const teams = await getEligibleHomeTeams(group.leagueId);
  return { ok: true, teams };
}

async function getClientRateLimitKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  return `invite:${ip}`;
}

function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Joins a group via invite code. New users set a password; returning users sign in via `/login`.
 * Why one action: one entry point keeps cookie + membership rules in one place.
 */
export async function joinGroupWithInvite(
  input: unknown,
): Promise<JoinGroupResult> {
  const key = await getClientRateLimitKey();
  if (!checkInviteRateLimit(key)) {
    return {
      ok: false,
      error: "Too many attempts. Try again later.",
      code: "RATE_LIMIT",
    };
  }

  const parsed = JoinSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      code: "VALIDATION",
    };
  }

  const {
    inviteCode,
    displayName: rawName,
    password: rawPassword,
    homeTeamId: rawHomeTeamId,
  } = parsed.data;
  const group = await findGroupByInviteCode(inviteCode);
  if (!group) {
    return {
      ok: false,
      error: "That invite code is not valid.",
      code: "INVALID_INVITE",
    };
  }

  const homeTeamId = rawHomeTeamId?.trim();
  const token = await getSessionTokenFromCookie();
  const sessionUserId =
    token !== null ? (await verifySessionToken(token))?.userId : null;

  if (sessionUserId) {
    return joinWithExistingSession(
      sessionUserId,
      group.id,
      group.leagueId,
      homeTeamId,
    );
  }

  if (rawName == null || rawName.trim().length === 0) {
    return {
      ok: false,
      error: "Enter a display name to join.",
      code: "VALIDATION",
    };
  }

  const displayName = normalizeDisplayName(rawName);
  if (displayName.length === 0) {
    return {
      ok: false,
      error: "Enter a display name to join.",
      code: "VALIDATION",
    };
  }

  if (rawPassword == null || rawPassword.length < 4) {
    return {
      ok: false,
      error: "Choose a password of at least 4 characters.",
      code: "VALIDATION",
    };
  }

  const existingMember = await prisma.groupMembership.findFirst({
    where: {
      groupId: group.id,
      user: {
        displayName: { equals: displayName, mode: "insensitive" },
      },
    },
    include: { user: true },
  });

  if (existingMember) {
    // Why: same display name in this group means the account already exists — use `/login`, not a second join.
    const banInLeague = await prisma.leagueBan.findUnique({
      where: {
        userId_leagueId: {
          userId: existingMember.userId,
          leagueId: group.leagueId,
        },
      },
      select: { id: true },
    });
    if (banInLeague) {
      return {
        ok: false,
        error: "You are not allowed to join this league.",
        code: "BANNED",
      };
    }
    return {
      ok: false,
      error:
        "This display name is already taken in this group. Sign in on the login page to continue.",
      code: "VALIDATION",
    };
  }

  // Why: login is keyed by display name + password; a globally registered name must stay unique among password users.
  const passwordNameTaken = await prisma.user.findFirst({
    where: {
      displayName: { equals: displayName, mode: "insensitive" },
      passwordHash: { not: null },
    },
    select: { id: true },
  });
  if (passwordNameTaken) {
    return {
      ok: false,
      error: "That display name is already taken. Sign in or pick another name.",
      code: "NAME_TAKEN",
    };
  }

  if (!homeTeamId || homeTeamId.length === 0) {
    return {
      ok: false,
      error: "Choose your home IPL team for this league.",
      code: "VALIDATION",
    };
  }

  const teamOk = await validateHomeTeamChoice(group.leagueId, homeTeamId);
  if (!teamOk.ok) {
    return { ok: false, error: teamOk.error, code: "VALIDATION" };
  }

  const passwordHash = await hashPassword(rawPassword);
  const user = await prisma.user.create({
    data: { displayName, passwordHash },
  });

  await prisma.groupMembership.create({
    data: {
      userId: user.id,
      groupId: group.id,
      leagueId: group.leagueId,
      role: MemberRole.player,
      homeTeamId,
    },
  });

  await setSessionCookie(await signSessionToken(user.id));

  return {
    ok: true,
    groupId: group.id,
    userId: user.id,
    wasExistingMember: false,
  };
}

async function joinWithExistingSession(
  userId: string,
  groupId: string,
  leagueId: string,
  homeTeamId: string | undefined,
): Promise<JoinGroupResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    await clearSessionCookie();
    return {
      ok: false,
      error: "Session expired. Enter your invite code and display name again.",
      code: "VALIDATION",
    };
  }

  // Why: league-level bans block invite joins for this user until an admin removes the ban.
  const leagueBan = await prisma.leagueBan.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
    select: { id: true },
  });
  if (leagueBan) {
    return {
      ok: false,
      error: "You are not allowed to join this league.",
      code: "BANNED",
    };
  }

  const existingInGroup = await prisma.groupMembership.findFirst({
    where: { userId, groupId },
  });

  if (existingInGroup) {
    await setSessionCookie(await signSessionToken(userId));
    return {
      ok: true,
      groupId,
      userId,
      wasExistingMember: true,
    };
  }

  const otherGroupInLeague = await prisma.groupMembership.findFirst({
    where: { userId, leagueId },
  });

  if (otherGroupInLeague) {
    return {
      ok: false,
      error:
        "You already belong to another group in this league. One group per league per player.",
      code: "ALREADY_IN_LEAGUE",
    };
  }

  const nameTaken = await prisma.groupMembership.findFirst({
    where: {
      groupId,
      user: {
        displayName: { equals: user.displayName, mode: "insensitive" },
      },
      NOT: { userId },
    },
  });

  if (nameTaken) {
    return {
      ok: false,
      error: "Another member in this group already uses that display name.",
      code: "NAME_TAKEN",
    };
  }

  if (!homeTeamId || homeTeamId.length === 0) {
    return {
      ok: false,
      error: "Choose your home IPL team for this league.",
      code: "VALIDATION",
    };
  }

  const teamOk = await validateHomeTeamChoice(leagueId, homeTeamId);
  if (!teamOk.ok) {
    return { ok: false, error: teamOk.error, code: "VALIDATION" };
  }

  await prisma.groupMembership.create({
    data: {
      userId,
      groupId,
      leagueId,
      role: MemberRole.player,
      homeTeamId,
    },
  });

  await setSessionCookie(await signSessionToken(userId));

  return {
    ok: true,
    groupId,
    userId,
    wasExistingMember: false,
  };
}

/**
 * Clears the session cookie so the browser no longer sends a JWT.
 * Why: explicit logout or switching devices without keeping old sessions.
 */
export async function logout(): Promise<void> {
  await clearSessionCookie();
}
