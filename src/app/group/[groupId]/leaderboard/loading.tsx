export default function LeaderboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10" aria-busy="true" aria-live="polite">
      <div className="h-10 w-48 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-72 w-full animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
