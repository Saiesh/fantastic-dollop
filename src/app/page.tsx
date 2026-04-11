import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session";
import { getUserGroups } from "@/lib/groups";
import { logout } from "@/lib/actions/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_VARIANTS = {
  pre_season: "default",
  active: "success",
  completed: "accent",
  settled: "default",
} as const;

export default async function Home() {
  const user = await getSessionUser();

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-12">
      {/* Hero */}
      <header className="text-center mb-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">
          IPL FanBet
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Bet on IPL with your crew
        </h1>
        <p className="mt-3 text-muted-foreground">
          Log in with your display name and password, or join a new group with an
          invite code and start predicting.
        </p>
      </header>

      {user ? (
        <UserDashboard userId={user.id} displayName={user.displayName} />
      ) : (
        <div className="flex flex-col items-center gap-4">
          {/* Primary: returning players sign in; secondary: new players need invite + account */}
          <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="rounded-lg bg-accent px-6 py-3 text-center text-sm font-semibold text-accent-foreground hover:bg-accent/90 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/join"
              className="rounded-lg border border-border bg-card px-6 py-3 text-center text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
            >
              Join a group
            </Link>
          </div>
          <Link
            href="/rules"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            View rules
          </Link>
        </div>
      )}
    </div>
  );
}

async function UserDashboard({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const groups = await getUserGroups(userId);

  return (
    <div className="space-y-8">
      {/* User bar */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4">
        <div>
          <p className="text-sm text-muted-foreground">Signed in as</p>
          <p className="font-semibold">{displayName}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/join"
            className="rounded-md bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent/90 transition-colors"
          >
            Join group
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Log out
            </button>
          </form>
        </div>
      </div>

      {/* Groups list */}
      <section>
        <h2 className="text-lg font-semibold mb-4">My Groups</h2>
        {groups.length === 0 ? (
          <EmptyState
            title="No groups yet"
            description="Join your first group with an invite code from a friend."
          >
            <Link
              href="/join"
              className="text-sm font-medium text-accent hover:underline"
            >
              Join a group &rarr;
            </Link>
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((membership) => {
              const g = membership.group;
              return (
                <Link key={g.id} href={`/group/${g.id}`}>
                  <Card className="transition-colors hover:border-accent/40">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold">{g.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {g.league.name} {g.league.seasonYear}
                        </p>
                      </div>
                      <Badge
                        variant={STATUS_VARIANTS[g.status] ?? "default"}
                      >
                        {g.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{g._count.memberships} players</span>
                      <span>
                        {formatINR(Number(g.buyInAmount))} buy-in
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant={membership.role === "organiser" ? "accent" : "default"}>
                        {membership.role}
                      </Badge>
                      {!membership.hasPaid ? (
                        <Badge variant="destructive">Unpaid</Badge>
                      ) : null}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick links */}
      <div className="flex items-center justify-center gap-6 text-sm">
        <Link
          href="/rules"
          className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Rules
        </Link>
        <Link
          href="/join"
          className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Join another group
        </Link>
      </div>
    </div>
  );
}
