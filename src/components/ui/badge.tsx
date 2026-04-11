import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "accent";

/** Why: token-first dark theme — avoids `dark:` split now that default shell is dark. */
const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: "bg-muted text-muted-foreground ring-1 ring-border/60",
  success: "bg-emerald-500/15 text-success ring-1 ring-emerald-500/30",
  warning: "bg-amber-500/15 text-warning ring-1 ring-amber-500/35",
  destructive: "bg-rose-500/15 text-destructive ring-1 ring-rose-500/30",
  accent: "bg-accent/15 text-accent ring-1 ring-accent/40",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

/** Small inline badge for status indicators and labels. */
export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
