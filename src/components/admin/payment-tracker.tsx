"use client";

import { useTransition } from "react";
import { cn, formatINR } from "@/lib/utils";
import { togglePaymentStatus } from "@/lib/actions/organiser";

interface MemberRow {
  id: string;
  userId: string;
  hasPaid: boolean;
  role: "organiser" | "player";
  joinedAt: Date;
  user: { id: string; displayName: string; avatarUrl: string | null };
  homeTeam: { id: string; name: string; shortName: string } | null;
}

interface PaymentTrackerProps {
  members: MemberRow[];
  buyInAmount: number;
  className?: string;
}

export function PaymentTracker({ members, buyInAmount, className }: PaymentTrackerProps) {
  const paidCount = members.filter((m) => m.hasPaid).length;
  const totalPool = buyInAmount * paidCount;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary Bar */}
      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Buy-in</p>
          <p className="text-lg font-semibold">
            {formatINR(buyInAmount)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Paid</p>
          <p className="text-lg font-semibold">
            {paidCount}/{members.length}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Pool</p>
          <p className="text-lg font-semibold text-green-600 dark:text-green-400">
            {formatINR(totalPool)}
          </p>
        </div>
      </div>

      {/* Member List */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h4 className="text-sm font-semibold">Members</h4>
        </div>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {members.map((member) => (
            <PaymentRow key={member.id} member={member} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function PaymentRow({ member }: { member: MemberRow }) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await togglePaymentStatus({
        membershipId: member.id,
        hasPaid: !member.hasPaid,
      });
    });
  }

  return (
    <li className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* Why: Simple avatar placeholder since avatar upload is optional. */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {member.user.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {member.user.displayName}
            {member.role === "organiser" && (
              <span className="ml-1.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                ORGANISER
              </span>
            )}
          </p>
          {member.homeTeam && (
            <p className="text-xs text-zinc-400">{member.homeTeam.shortName}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          member.hasPaid
            ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            : "bg-red-100 text-red-700 hover:bg-green-100 hover:text-green-700 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-green-900/30 dark:hover:text-green-400"
        )}
        aria-label={member.hasPaid ? `Mark ${member.user.displayName} as unpaid` : `Mark ${member.user.displayName} as paid`}
      >
        {isPending ? "…" : member.hasPaid ? "Paid" : "Unpaid"}
      </button>
    </li>
  );
}
