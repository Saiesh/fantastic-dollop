import { notFound } from "next/navigation";
import { getGroupWithMembers } from "@/lib/groups";
import { PaymentTracker } from "@/components/admin/payment-tracker";
import { PrizeDistribution } from "@/components/admin/prize-distribution";

interface PageProps {
  params: Promise<{ groupId: string }>;
}

// Why: Server component fetches group + members, then delegates to
// client components for interactive payment toggling and prize config.
export default async function GroupManagePage({ params }: PageProps) {
  const { groupId } = await params;

  const group = await getGroupWithMembers(groupId);
  if (!group) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 mb-1">
          <span>{group.league.name} {group.league.seasonYear}</span>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span>{group.name}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Group Management</h1>
        <div className="mt-2 flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            Code: {group.inviteCode}
          </span>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 capitalize">
            {group.status.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* Two-column on large screens, stacked on small */}
      <div className="space-y-8">
        {/* Payment Tracking */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Payment Tracking</h2>
          <PaymentTracker
            members={group.memberships}
            buyInAmount={Number(group.buyInAmount)}
          />
        </section>

        {/* Prize Distribution */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Prize Distribution</h2>
          <PrizeDistribution
            groupId={group.id}
            groupStatus={group.status}
          />
        </section>
      </div>
    </div>
  );
}
