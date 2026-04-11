import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Avatar } from "@/components/ui/avatar";

interface GroupLayoutProps {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}

/**
 * Shared layout for all group-scoped pages. Verifies auth and membership once,
 * then renders slim top chrome + bottom tabs so mobile navigation matches sports-app patterns.
 */
export default async function GroupLayout({ children, params }: GroupLayoutProps) {
  const { groupId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/join");

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      organiserId: true,
      league: { select: { name: true } },
    },
  });

  if (!group) notFound();

  const membership = await prisma.groupMembership.findFirst({
    where: { userId: user.id, groupId: group.id },
  });

  if (!membership) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">You are not a member of this group yet.</p>
        <Link
          href="/join"
          className="mt-4 inline-block text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          Join a group
        </Link>
      </div>
    );
  }

  const isOrganiser = group.organiserId === user.id;

  const navItems = [
    { href: `/group/${groupId}`, label: "Dashboard", shortLabel: "Home", exact: true },
    { href: `/group/${groupId}/leaderboard`, label: "Leaderboard", shortLabel: "Board" },
    { href: `/group/${groupId}/my-bets`, label: "My Bets", shortLabel: "Bets" },
    { href: `/group/${groupId}/ledger`, label: "Ledger", shortLabel: "Ledger" },
    ...(isOrganiser
      ? [{ href: `/group/${groupId}/manage`, label: "Manage", shortLabel: "Run" }]
      : []),
  ];

  return (
    <div className="min-h-full pb-24">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link
            href="/"
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Back to home"
          >
            <span aria-hidden className="text-lg leading-none">
              &larr;
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.league.name}
            </p>
            <p className="truncate text-sm font-bold text-foreground">{group.name}</p>
          </div>
          <span className="hidden shrink-0 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline">
            Group
          </span>
          <Avatar displayName={user.displayName} className="h-10 w-10 shrink-0 text-xs" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">{children}</main>

      {/* Why: fixed tab bar mirrors Dream11-style navigation; items omit `exact` except Dashboard (handled in component). */}
      <BottomNav
        items={navItems.map(({ href, label, shortLabel, exact }) => ({
          href,
          label,
          shortLabel,
          exact,
        }))}
      />
    </div>
  );
}
