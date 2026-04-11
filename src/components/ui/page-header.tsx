import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  children?: React.ReactNode;
  className?: string;
}

/** Page header — why: consistent hierarchy under sticky group chrome. */
export function PageHeader({ title, subtitle, badge, children, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-1 border-b border-border/80 pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div>
        {subtitle ? (
          <p className="text-sm font-medium text-muted-foreground">{subtitle}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {badge ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground ring-1 ring-border/60">
              {badge}
            </span>
          ) : null}
        </div>
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </header>
  );
}
