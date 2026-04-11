import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

/** Empty list placeholder — why: dashed border reads as “slot” on dark UI. */
export function EmptyState({ title, description, children, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center",
        className,
      )}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
