export default function LedgerLoading() {
  return (
    <div className="space-y-4 py-2" aria-busy="true" aria-live="polite">
      <div className="h-12 w-48 skeleton-shimmer rounded-lg" />
      {[1, 2, 3, 4, 5].map((k) => (
        <div key={k} className="h-28 w-full skeleton-shimmer rounded-xl" />
      ))}
    </div>
  );
}
