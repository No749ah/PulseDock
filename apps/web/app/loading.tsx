export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <div className="absolute inset-2 animate-spin rounded-full border-2 border-accent/40 border-t-transparent [animation-direction:reverse] [animation-duration:0.7s]" />
        </div>
        <p className="text-sm font-medium text-text-secondary tracking-wide">Loading...</p>
      </div>
    </div>
  );
}
