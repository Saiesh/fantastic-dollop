/** Why: skeleton loading avoids layout shift while organiser data loads. */
export default function GroupManageLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-4 w-48 skeleton-shimmer rounded-md" />
        <div className="h-8 w-64 skeleton-shimmer rounded-lg" />
      </div>
      <div className="space-y-4">
        <div className="h-6 w-40 skeleton-shimmer rounded-md" />
        <div className="h-48 rounded-xl skeleton-shimmer" />
      </div>
      <div className="space-y-4">
        <div className="h-6 w-40 skeleton-shimmer rounded-md" />
        <div className="h-48 rounded-xl skeleton-shimmer" />
      </div>
    </div>
  );
}
