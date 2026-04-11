// Why: Provides instant visual feedback while server component data loads.
export default function LeagueAdminLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-40 rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
            ))}
          </div>
          <div className="lg:col-span-3 h-64 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
