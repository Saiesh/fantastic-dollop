"use client";

export default function LeaderboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Could not load leaderboard</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Try again in a moment.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mx-auto rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
      >
        Retry
      </button>
    </div>
  );
}
