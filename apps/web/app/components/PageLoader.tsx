/**
 * PageLoader — full-screen spinner for Next.js Suspense loading.tsx segments.
 * Matches the existing app shell design.
 */
export default function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        <p className="text-sm text-text-secondary animate-pulse">Loading…</p>
      </div>
    </div>
  );
}
