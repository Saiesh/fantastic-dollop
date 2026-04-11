export default function MyBetsLoading() {
  return (
    <div className="space-y-4 py-2" aria-busy="true" aria-live="polite">
      <div className="h-16 w-full skeleton-shimmer rounded-xl" />
      {[1, 2, 3, 4].map((k) => (
        <div key={k} className="h-24 w-full skeleton-shimmer rounded-xl" />
      ))}
    </div>
  );
}
