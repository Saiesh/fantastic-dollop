export default function LeaderboardLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-6"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="h-10 w-56 skeleton-shimmer rounded-lg" />
      <div className="grid grid-cols-3 gap-3">
        {["a", "b", "c"].map((k) => (
          <div key={k} className="h-32 rounded-xl skeleton-shimmer" />
        ))}
      </div>
      <div className="h-80 w-full rounded-xl skeleton-shimmer" />
    </div>
  );
}
