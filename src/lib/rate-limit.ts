/**
 * Best-effort in-memory rate limit for invite-code attempts (PRD §10 security).
 * Why in-memory: avoids new infra; acceptable for early deploys (resets on cold start).
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 30;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkInviteRateLimit(key: string): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || now > existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (existing.count >= MAX_ATTEMPTS) {
    return false;
  }
  existing.count += 1;
  return true;
}
