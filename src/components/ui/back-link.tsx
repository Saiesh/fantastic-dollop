import Link from "next/link";
import { cn } from "@/lib/utils";

interface BackLinkProps {
  href: string;
  label?: string;
  className?: string;
}

/** Consistent "← Back" navigation used at the top of detail pages. */
export function BackLink({ href, label = "Back", className }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors",
        className,
      )}
    >
      <span aria-hidden>&larr;</span>
      {label}
    </Link>
  );
}
