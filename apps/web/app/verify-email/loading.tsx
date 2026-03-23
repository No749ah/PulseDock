export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4 max-w-sm">
        <div className="h-12 w-12 mx-auto animate-pulse rounded-full bg-surface-elevated" />
        <div className="h-5 w-40 mx-auto animate-pulse rounded bg-surface-elevated" />
        <div className="h-3 w-56 mx-auto animate-pulse rounded bg-surface-elevated" />
      </div>
    </div>
  );
}
