import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getLeague } from "@/lib/leagues";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/utils";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ leagueId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { leagueId } = await params;
  const league = await getLeague(leagueId);
  if (!league) return { title: "League Groups" };
  return { title: `${league.name} · Groups | Admin` };
}

const STATUS_VARIANTS = {
  pre_season: "default",
  active: "success",
  completed: "accent",
  settled: "default",
} as const;

export default async function LeagueGroupsPage({ params }: PageProps) {
  const { leagueId } = await params;

  const league = await getLeague(leagueId);
  if (!league) notFound();

  // Why: admin needs a bird's-eye view of all groups in the league.
  const groups = await prisma.group.findMany({
    where: { leagueId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      inviteCode: true,
      buyInAmount: true,
      status: true,
      organiser: { select: { displayName: true } },
      _count: { select: { memberships: true } },
      memberships: {
        where: { hasPaid: true },
        select: { id: true },
      },
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-2">
        <Link
          href={`/admin/league/${leagueId}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to league admin
        </Link>
      </div>

      <PageHeader
        title="Groups"
        subtitle={`${league.name} ${league.seasonYear}`}
      >
        <span className="text-sm text-muted-foreground">
          {groups.length} group{groups.length !== 1 ? "s" : ""}
        </span>
      </PageHeader>

      <div className="mt-6">
        {groups.length === 0 ? (
          <EmptyState
            title="No groups yet"
            description="Groups are created by organisers using invite codes."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((g) => {
              const paidCount = g.memberships.length;
              const totalPool = Number(g.buyInAmount) * paidCount;
              return (
                <Card key={g.id}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        by {g.organiser.displayName}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANTS[g.status] ?? "default"}>
                      {g.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Invite Code</span>
                      <span className="font-mono font-medium text-foreground">{g.inviteCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Members</span>
                      <span className="font-medium text-foreground">{g._count.memberships}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Paid</span>
                      <span className="font-medium text-foreground">{paidCount}/{g._count.memberships}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pool</span>
                      <span className="font-medium text-success">
                        {formatINR(totalPool)}
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
