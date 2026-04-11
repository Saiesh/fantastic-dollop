import Link from "next/link";
import { cn } from "@/lib/utils";

interface BackLinkProps {
  href: string;
  label?: string;
  className?: string;
}

/** Consistent back navigation — why: secondary link color matches accent-secondary usage. */
export function BackLink({ href, label = "Back", className }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm text-accent-secondary transition-colors hover:text-accent",
        className,
      )}
    >
      <span aria-hidden>&larr;</span>
      {label}
    </Link>
  );
}
