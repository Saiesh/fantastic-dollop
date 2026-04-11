/** Why: skeleton matches dashboard cards instead of a generic spinner-only shell. */
export default function GroupLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-4 w-40 skeleton-shimmer rounded-md" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {["a", "b", "c", "d"].map((k) => (
          <div key={k} className="h-24 rounded-xl skeleton-shimmer" />
        ))}
      </div>
      <div className="h-56 w-full rounded-2xl skeleton-shimmer" />
      <div className="h-40 w-full rounded-xl skeleton-shimmer" />
    </div>
  );
}
