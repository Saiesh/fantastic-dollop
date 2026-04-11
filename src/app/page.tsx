import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session";
import { getUserGroups, getUserHomeSummary } from "@/lib/groups";
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
    <div className="relative min-h-full overflow-hidden">
      {/* Why: gradient + grid pattern sells “stadium night” without image assets. */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background-elevated via-background to-background"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-cricket-grid opacity-40" aria-hidden />
      <div className="relative mx-auto flex min-h-full max-w-2xl flex-col px-4 py-12 sm:py-16">
        <header className="mb-10 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
            IPL Fanbet
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Bet on IPL with your crew
          </h1>
          <p className="mt-3 text-muted-foreground">
            Private circles, invite codes, and season-long bragging rights.
          </p>
        </header>

        {user ? (
          <UserDashboard userId={user.id} displayName={user.displayName} />
        ) : (
          <div className="flex flex-col items-center gap-6">
            <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="rounded-full bg-gradient-to-r from-accent to-amber-500 px-8 py-3.5 text-center text-sm font-bold text-accent-foreground shadow-lg shadow-amber-900/30 transition hover:brightness-110"
              >
                Log in
              </Link>
              <Link
                href="/join"
                className="rounded-full border border-border bg-card/80 px-8 py-3.5 text-center text-sm font-semibold text-foreground ring-1 ring-white/5 transition hover:bg-muted/50"
              >
                Join a group
              </Link>
            </div>
            <Link
              href="/rules"
              className="text-sm font-medium text-accent-secondary underline-offset-4 hover:underline"
            >
              View rules
            </Link>
          </div>
        )}
      </div>
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
  const [groups, summary] = await Promise.all([
    getUserGroups(userId),
    getUserHomeSummary(userId),
  ]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/80 bg-card/90 p-4 text-center ring-1 ring-white/5">
          <p className="text-2xl font-bold tabular-nums text-accent">{summary.totalPoints}</p>
          <p className="text-xs font-medium text-muted-foreground">Total pts</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card/90 p-4 text-center ring-1 ring-white/5">
          <p className="text-2xl font-bold tabular-nums text-foreground">{summary.groupCount}</p>
          <p className="text-xs font-medium text-muted-foreground">Groups</p>
        </div>
        <div className="col-span-2 rounded-xl border border-border/80 bg-card/90 p-4 sm:col-span-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Signed in</p>
              <p className="font-semibold text-foreground">{displayName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/join"
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground"
              >
                Join
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                >
                  Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-bold tracking-tight">My groups</h2>
        {groups.length === 0 ? (
          <EmptyState
            title="No groups yet"
            description="Join your first group with an invite code from a friend."
          >
            <Link
              href="/join"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Join a group &rarr;
            </Link>
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((membership) => {
              const g = membership.group;
              const strip = membership.homeTeam?.primaryColor;
              return (
                <Link key={g.id} href={`/group/${g.id}`}>
                  <Card className="relative overflow-hidden transition hover:border-accent/40 hover:ring-1 hover:ring-accent/20">
                    {strip ? (
                      <div
                        className="absolute inset-y-0 left-0 w-1.5"
                        style={{ backgroundColor: strip }}
                        aria-hidden
                      />
                    ) : null}
                    <div className={strip ? "pl-2" : undefined}>
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-foreground">{g.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {g.league.name} {g.league.seasonYear}
                          </p>
                        </div>
                        <Badge variant={STATUS_VARIANTS[g.status] ?? "default"}>
                          {g.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{g._count.memberships} players</span>
                        <span>{formatINR(Number(g.buyInAmount))} buy-in</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant={membership.role === "organiser" ? "accent" : "default"}>
                          {membership.role}
                        </Badge>
                        {membership.homeTeam?.shortName ? (
                          <Badge variant="default">{membership.homeTeam.shortName}</Badge>
                        ) : null}
                        {!membership.hasPaid ? (
                          <Badge variant="destructive">Unpaid</Badge>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="flex items-center justify-center gap-6 text-sm">
        <Link
          href="/rules"
          className="font-medium text-muted-foreground underline-offset-4 hover:text-accent"
        >
          Rules
        </Link>
        <Link
          href="/join"
          className="font-medium text-muted-foreground underline-offset-4 hover:text-accent"
        >
          Join another group
        </Link>
      </div>
    </div>
  );
}
