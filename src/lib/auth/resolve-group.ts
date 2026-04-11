import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeInviteCode } from "@/lib/auth/invite-code";

/**
 * Looks up a group by invite code, tolerating hyphen/case differences from PRD examples.
 * Why: organisers may store codes with or without punctuation; input should still match.
 */
export async function findGroupByInviteCode(raw: string) {
  const trimmed = raw.trim();
  const normalized = normalizeInviteCode(trimmed);
  if (normalized.length === 0) {
    return null;
  }

  const byNormalized = await prisma.group.findUnique({
    where: { inviteCode: normalized },
  });
  if (byNormalized) {
    return byNormalized;
  }

  return prisma.group.findFirst({
    where: {
      inviteCode: { equals: trimmed, mode: "insensitive" },
    },
  });
}
