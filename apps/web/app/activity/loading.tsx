export default function ActivityLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-[60px] rounded-xl bg-surface-secondary animate-pulse border border-border/50" />
      ))}
    </div>
  );
}
