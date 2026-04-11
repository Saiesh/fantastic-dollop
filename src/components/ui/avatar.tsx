import { cn } from "@/lib/utils";

interface AvatarProps {
  /** Display name used to derive initials — why: consistent avatar without storing images. */
  displayName: string;
  className?: string;
}

/**
 * Derives 1–2 initials from a display name for the avatar label.
 * Why: deterministic so the same name always maps to the same initials.
 */
function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Simple hash for picking a gradient from the name — why: same user always gets same colors.
 */
function gradientIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h % 4;
}

const GRADIENT_CLASSES = [
  "from-amber-500 to-orange-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
] as const;

/** Circular initials avatar with a stable gradient per display name. */
export function Avatar({ displayName, className }: AvatarProps) {
  const initials = initialsFromName(displayName);
  const idx = gradientIndex(displayName);

  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-sm ring-2 ring-white/10",
        GRADIENT_CLASSES[idx],
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}
