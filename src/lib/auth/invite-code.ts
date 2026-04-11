/**
 * Normalizes invite codes so users can type "fan-x7k" or "FANX7K" interchangeably.
 * Why: PRD shows hyphenated codes; storage may omit punctuation — compare one shape.
 */
export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}
