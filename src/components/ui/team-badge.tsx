import { cn } from "@/lib/utils";

interface TeamBadgeProps {
  shortName: string;
  /** Hex team color from DB — why: franchise identity on cards and leaderboard. */
  primaryColor: string | null;
  className?: string;
}

/** Compact pill with optional team color accent on the leading edge. */
export function TeamBadge({ shortName, primaryColor, className }: TeamBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border border-border bg-muted/80 px-2 py-0.5 text-xs font-semibold text-foreground",
        className,
      )}
      style={
        primaryColor
          ? {
              borderLeftWidth: 3,
              borderLeftColor: primaryColor,
            }
          : undefined
      }
    >
      <span className="truncate">{shortName}</span>
    </span>
  );
}
