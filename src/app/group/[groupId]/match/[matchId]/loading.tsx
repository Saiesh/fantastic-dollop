export default function MatchLoading() {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-2" aria-busy="true" aria-live="polite">
      <div className="h-72 w-full skeleton-shimmer rounded-2xl" />
      <div className="h-64 w-full skeleton-shimmer rounded-2xl" />
      <div className="h-40 w-full skeleton-shimmer rounded-xl" />
    </div>
  );
}
