export default function MatchLoading() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Skeleton card */}
      <div className="animate-pulse rounded-xl border border-border bg-card p-6">
        <div className="flex justify-between mb-4">
          <div className="h-4 w-16 rounded bg-muted" />
          <div className="h-5 w-20 rounded-full bg-muted" />
        </div>
        <div className="flex items-center justify-center gap-8 py-6">
          <div className="h-8 w-12 rounded bg-muted" />
          <div className="h-4 w-6 rounded bg-muted" />
          <div className="h-8 w-12 rounded bg-muted" />
        </div>
        <div className="mx-auto h-4 w-48 rounded bg-muted" />
      </div>
      {/* Skeleton bet form */}
      <div className="animate-pulse space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 rounded-xl border border-border bg-muted" />
          <div className="h-24 rounded-xl border border-border bg-muted" />
        </div>
        <div className="h-12 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
