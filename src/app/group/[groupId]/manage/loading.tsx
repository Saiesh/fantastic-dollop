// Why: Skeleton loading state prevents layout shift while data fetches.
export default function GroupManageLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse">
      <div className="mb-8 space-y-2">
        <div className="h-4 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-8 w-64 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="h-6 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-48 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        </div>
        <div className="space-y-4">
          <div className="h-6 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-48 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
