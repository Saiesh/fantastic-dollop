import { SignJWT, jwtVerify } from "jose";

/**
 * Fixed dev key so `npm run dev` and tests can issue sessions without a local `.env`.
 * Why: avoids opaque 500s when AUTH_SECRET is unset; production still requires a real secret.
 */
const DEV_AUTH_SECRET_FALLBACK =
  "ipl-fanbet-dev-only-secret-do-not-use-in-prod";

/** HS256 key material — validated lazily so `next build` can run without env in some setups. */
export function getAuthSecretBytes(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  // Why 32+: enough entropy for HS256 signing keys in production.
  if (isProduction) {
    if (!secret || secret.length < 32) {
      throw new Error(
        "AUTH_SECRET must be set to a string at least 32 characters long",
      );
    }
    return new TextEncoder().encode(secret);
  }

  // Non-production: accept a long env value, otherwise use the dev fallback above.
  const effective =
    secret && secret.length >= 32 ? secret : DEV_AUTH_SECRET_FALLBACK;
  return new TextEncoder().encode(effective);
}

/** PRD §4.1: session TTL is 30 days. */
const SESSION_MAX_AGE = "30d" as const;

/**
 * Issues a signed JWT whose subject is the user id — stored in an httpOnly cookie.
 * Why JWT: stateless verification on each request without server-side session storage.
 */
export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(SESSION_MAX_AGE)
    .sign(getAuthSecretBytes());
}

export async function verifySessionToken(
  token: string,
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecretBytes(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return null;
    }
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
