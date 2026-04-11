import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/** Card with glass edge — why: depth on dark navy shells without heavy shadows. */
export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card/90 p-5 text-card-foreground shadow-sm shadow-black/20 backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

/** Card header with title, optional description, and action slot. */
export function CardHeader({ title, description, children, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-4", className)}>
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
