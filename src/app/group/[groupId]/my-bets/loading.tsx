export default function MyBetsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-32 rounded bg-muted animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-border bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}
