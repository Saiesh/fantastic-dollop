"use client";

import { useState, useTransition } from "react";
import { cn, formatINR } from "@/lib/utils";
import { calculatePrizeDistribution, settleGroup } from "@/lib/actions/organiser";

type Preset = "top3" | "top2" | "winner_takes_all" | "custom";

interface PrizeSplit {
  position: number;
  percentage: number;
  amount: number;
}

interface PrizeDistributionProps {
  groupId: string;
  groupStatus: string;
  className?: string;
}

const PRESET_OPTIONS: Array<{ value: Preset; label: string; description: string }> = [
  { value: "top3", label: "Top 3", description: "50% / 30% / 20%" },
  { value: "top2", label: "Top 2", description: "60% / 40%" },
  { value: "winner_takes_all", label: "Winner Takes All", description: "100% to 1st" },
  { value: "custom", label: "Custom", description: "Set your own splits" },
];

export function PrizeDistribution({ groupId, groupStatus, className }: PrizeDistributionProps) {
  const [preset, setPreset] = useState<Preset>("top3");
  const [splits, setSplits] = useState<PrizeSplit[] | null>(null);
  const [totalPool, setTotalPool] = useState<number>(0);
  const [customInputs, setCustomInputs] = useState<Array<{ position: number; percentage: string }>>([
    { position: 1, percentage: "50" },
    { position: 2, percentage: "30" },
    { position: 3, percentage: "20" },
  ]);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isSettled = groupStatus === "settled";

  function handleCalculate() {
    startTransition(async () => {
      setMessage(null);
      const customSplits = preset === "custom"
        ? customInputs.map((c) => ({ position: c.position, percentage: Number(c.percentage) }))
        : undefined;

      const res = await calculatePrizeDistribution({ groupId, preset, customSplits });
      if (res.error) {
        setMessage({ type: "error", text: res.error });
        setSplits(null);
      } else if (res.data) {
        setSplits(res.data.splits);
        setTotalPool(res.data.totalPool);
      }
    });
  }

  function handleSettle() {
    // Why: Extra confirmation since settlement is a one-way status transition.
    if (!window.confirm("Mark this group as settled? This cannot be undone.")) return;

    startTransition(async () => {
      setMessage(null);
      const res = await settleGroup({ groupId });
      if (res.error) setMessage({ type: "error", text: res.error });
      else setMessage({ type: "success", text: "Group settled successfully." });
    });
  }

  function addCustomRow() {
    setCustomInputs((prev) => [
      ...prev,
      { position: prev.length + 1, percentage: "0" },
    ]);
  }

  function removeCustomRow(index: number) {
    setCustomInputs((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCustomRow(index: number, percentage: string) {
    setCustomInputs((prev) =>
      prev.map((row, i) => (i === index ? { ...row, percentage } : row))
    );
  }

  if (isSettled) {
    return (
      <div className={cn("rounded-xl border border-green-200 bg-green-50 p-6 text-center dark:border-green-800 dark:bg-green-950/20", className)}>
        <p className="text-sm font-semibold text-green-700 dark:text-green-400">
          This group has been settled.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Preset Selector */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h4 className="text-sm font-semibold mb-3">Distribution Model</h4>
        <div className="grid grid-cols-2 gap-2">
          {PRESET_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPreset(option.value)}
              className={cn(
                "rounded-lg border-2 px-3 py-2.5 text-left transition-all",
                preset === option.value
                  ? "border-blue-500 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20"
                  : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
              )}
            >
              <p className="text-sm font-medium">{option.label}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{option.description}</p>
            </button>
          ))}
        </div>

        {/* Custom Split Inputs */}
        {preset === "custom" && (
          <div className="mt-4 space-y-2">
            {customInputs.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 text-xs text-zinc-500">#{row.position}</span>
                <input
                  type="number"
                  value={row.percentage}
                  onChange={(e) => updateCustomRow(i, e.target.value)}
                  min="0"
                  max="100"
                  className={cn(
                    "w-20 rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-sm",
                    "focus:border-blue-500 focus:outline-none dark:border-zinc-700"
                  )}
                  aria-label={`Percentage for position ${row.position}`}
                />
                <span className="text-xs text-zinc-400">%</span>
                {customInputs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCustomRow(i)}
                    className="text-xs text-red-500 hover:text-red-700"
                    aria-label={`Remove position ${row.position}`}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addCustomRow}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              + Add position
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleCalculate}
          disabled={isPending}
          className={cn(
            "mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            "bg-blue-600 text-white hover:bg-blue-700",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isPending ? "Calculating…" : "Calculate Distribution"}
        </button>
      </div>

      {/* Results */}
      {splits && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">Distribution Breakdown</h4>
            <span className="text-sm font-medium text-zinc-500">
              Pool: {formatINR(totalPool)}
            </span>
          </div>
          <div className="space-y-2">
            {splits.map((split) => (
              <div
                key={split.position}
                className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-2.5 dark:bg-zinc-800"
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                    split.position === 1 && "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
                    split.position === 2 && "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
                    split.position === 3 && "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
                    split.position > 3 && "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  )}>
                    {split.position}
                  </span>
                  <span className="text-sm text-zinc-500">{split.percentage}%</span>
                </div>
                <span className="text-sm font-semibold">
                  {formatINR(split.amount)}
                </span>
              </div>
            ))}
          </div>

          {/* Settle Button */}
          {groupStatus === "completed" && (
            <button
              type="button"
              onClick={handleSettle}
              disabled={isPending}
              className={cn(
                "mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                "bg-green-600 text-white hover:bg-green-700",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isPending ? "Settling…" : "Mark as Settled"}
            </button>
          )}
        </div>
      )}

      {/* Feedback */}
      {message && (
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-sm font-medium",
            message.type === "success"
              ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
          )}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
