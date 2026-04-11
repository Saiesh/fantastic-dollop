import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma";

interface GroupLayoutProps {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}

/**
 * Shared layout for all group-scoped pages. Verifies auth and membership once,
 * then renders a persistent nav bar so users can move between group views
 * without re-fetching the same checks on each sub-page.
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
        <p className="text-sm text-muted-foreground">
          You are not a member of this group yet.
        </p>
        <Link href="/join" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
          Join a group
        </Link>
      </div>
    );
  }

  const isOrganiser = group.organiserId === user.id;

  const NAV_ITEMS = [
    { href: `/group/${groupId}`, label: "Dashboard" },
    { href: `/group/${groupId}/leaderboard`, label: "Leaderboard" },
    { href: `/group/${groupId}/my-bets`, label: "My Bets" },
    { href: `/group/${groupId}/ledger`, label: "Ledger" },
    ...(isOrganiser
      ? [{ href: `/group/${groupId}/manage`, label: "Manage" }]
      : []),
  ];

  return (
    <div className="min-h-full">
      {/* Top navigation bar for group context */}
      <nav className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center gap-6 overflow-x-auto px-4 py-3">
          <Link href="/" className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            &larr; Home
          </Link>
          <div className="shrink-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{group.league.name}</p>
            <p className="text-sm font-semibold leading-tight">{group.name}</p>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
