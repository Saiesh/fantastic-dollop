"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface BottomNavItem {
  href: string;
  label: string;
  /** Short label for tiny screens — why: avoid overflow on narrow devices. */
  shortLabel?: string;
  /**
   * When true, only `pathname === href` counts as active — why: group dashboard
   * must not stay highlighted on `/group/[id]/leaderboard` etc.
   */
  exact?: boolean;
}

interface BottomNavProps {
  items: BottomNavItem[];
  className?: string;
}

/**
 * Why: `usePathname` is client-only; this isolates the hook so group layout stays a server component wrapper.
 */
function NavIcon({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  const stroke = active ? "currentColor" : "currentColor";
  const className = cn("h-6 w-6", active ? "text-accent" : "text-muted-foreground");

  switch (label) {
    case "Dashboard":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
            stroke={stroke}
            strokeWidth="1.75"
            strokeLinejoin="round"
            fill={active ? "currentColor" : "none"}
            className={active ? "opacity-90" : undefined}
          />
        </svg>
      );
    case "Leaderboard":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M8 21V11M12 21V7M16 21v-6M4 21h16"
            stroke={stroke}
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case "My Bets":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M7 4h10v16l-5-3-5 3V4z"
            stroke={stroke}
            strokeWidth="1.75"
            strokeLinejoin="round"
            fill={active ? "currentColor" : "none"}
            className={active ? "opacity-90" : undefined}
          />
        </svg>
      );
    case "Ledger":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 4h12v4H6V4zm0 6h12v4H6v-4zm0 6h12v4H6v-4z"
            stroke={stroke}
            strokeWidth="1.75"
          />
        </svg>
      );
    case "Manage":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"
            stroke={stroke}
            strokeWidth="1.75"
          />
          <path
            d="M19.4 15a7.86 7.86 0 00.1-1 7.86 7.86 0 00-.1-1l2-1.55-2-3.45-2.35.95a7.65 7.65 0 00-1.65-.95L15 3h-6l-.4 2.55c-.58.24-1.12.55-1.65.95L4.6 6.05 2.6 9.5l2 1.55a7.86 7.86 0 000 2l-2 1.55 2 3.45 2.35-.95c.53.4 1.07.71 1.65.95L9 21h6l.4-2.55c.58-.24 1.12-.55 1.65-.95l2.35.95 2-3.45-2-1.55z"
            stroke={stroke}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return <span className="h-6 w-6 rounded bg-muted" aria-hidden />;
  }
}

/** Mobile-first tab bar — why: thumb reach + clear active state vs horizontal text overflow. */
export function BottomNav({ items, className }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-md supports-[backdrop-filter]:bg-card/80",
        className,
      )}
      aria-label="Group sections"
    >
      <ul className="mx-auto flex max-w-6xl items-stretch justify-around gap-0 px-1">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors sm:text-xs",
                  active
                    ? "text-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <NavIcon label={item.label} active={active} />
                <span className="truncate max-w-full">
                  <span className="sm:hidden">{item.shortLabel ?? item.label}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
