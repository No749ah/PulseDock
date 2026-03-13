export default function StatusLoading() {
  return (
    <main className="min-h-screen bg-bg px-4 pb-16 pt-8">
      <div className="mx-auto max-w-4xl space-y-6 animate-pulse">
        <div className="text-center space-y-2">
          <div className="h-3 w-24 rounded bg-surface mx-auto" />
          <div className="h-8 w-48 rounded-lg bg-surface mx-auto" />
          <div className="h-4 w-36 rounded bg-surface mx-auto" />
        </div>
        <div className="h-16 rounded-2xl bg-surface" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-surface" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-surface" />
      </div>
    </main>
  );
}
