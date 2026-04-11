import "server-only";

import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

import { getAuthSecretBytes } from "@/lib/auth/session-token";

/** Matches the admin session cookie name from the product spec (separate from player `fanbet_session`). */
export const ADMIN_SESSION_COOKIE_NAME = "fanbet_admin_session";

/** Admin sessions are short-lived so a stolen cookie window stays small compared to player sessions. */
const ADMIN_SESSION_MAX_AGE_SEC = 60 * 60 * 8;

/** JWT audience claim so admin tokens cannot be confused with player session JWTs. */
const ADMIN_JWT_AUDIENCE = "fanbet_admin";

/**
 * Reads the admin password from the `ADMIN_PASSWORD` env var.
 * Why: decoupled from DATABASE_URL so the DB credential and admin password can rotate independently.
 */
function getAdminPassword(): string | null {
  return process.env.ADMIN_PASSWORD ?? null;
}

/**
 * Compares two strings in a way that does not short-circuit on length alone.
 * Why: reduces timing leaks when guessing password length vs the configured DB password.
 */
function constantTimeCompareStrings(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Validates the submitted password against the `ADMIN_PASSWORD` env var.
 */
export function verifyAdminPassword(input: string): boolean {
  const expected = getAdminPassword();
  if (expected === null || expected.length === 0) {
    return false;
  }
  return constantTimeCompareStrings(input, expected);
}

async function signAdminSessionToken(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("fanbet-admin")
    .setAudience(ADMIN_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_MAX_AGE_SEC}s`)
    .sign(getAuthSecretBytes());
}

async function verifyAdminSessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getAuthSecretBytes(), {
      algorithms: ["HS256"],
      audience: ADMIN_JWT_AUDIENCE,
    });
    return true;
  } catch {
    return false;
  }
}

export async function setAdminCookie(): Promise<void> {
  const token = await signAdminSessionToken();
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SEC,
  });
}

export async function clearAdminCookie(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

async function getAdminSessionTokenFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const token = await getAdminSessionTokenFromCookie();
  if (!token) return false;
  return verifyAdminSessionToken(token);
}
