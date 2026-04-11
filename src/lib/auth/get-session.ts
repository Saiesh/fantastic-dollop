import "server-only";

import { prisma } from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth/session-token";
import { getSessionTokenFromCookie } from "@/lib/auth/session-cookie";

/** Safe user shape for server components — no secrets (AGENTS.md DTO boundary). */
export interface SessionUserDTO {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Resolves the current user from the session cookie, or null if missing/invalid.
 * Why: server components and actions call this instead of touching cookies directly.
 */
export async function getSessionUser(): Promise<SessionUserDTO | null> {
  const token = await getSessionTokenFromCookie();
  if (!token) return null;

  const verified = await verifySessionToken(token);
  if (!verified) return null;

  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { id: true, displayName: true, avatarUrl: true },
  });

  return user;
}
