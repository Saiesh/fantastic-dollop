import { cookies } from "next/headers";

/** Cookie name for the session JWT — scoped to this app only. */
export const SESSION_COOKIE_NAME = "fanbet_session";

/**
 * Persists the JWT in an httpOnly cookie so the token is not readable by JS
 * (mitigates XSS stealing sessions). Why SameSite=lax: CSRF balance for same-site.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionTokenFromCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE_NAME)?.value;
  return value ?? null;
}
