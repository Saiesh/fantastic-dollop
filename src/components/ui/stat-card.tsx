import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  className?: string;
}

/** Metric tile with subtle gradient frame — why: dashboard stats read as “live” scores. */
export function StatCard({ label, value, sub, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-gradient-to-b from-muted/80 to-card/90 p-4 text-center ring-1 ring-white/5",
        className,
      )}
    >
      <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground/90">{sub}</p> : null}
    </div>
  );
}
