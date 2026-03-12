export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen grid place-items-center p-4 bg-bg">
      <section className="w-full max-w-xl rounded-2xl border border-border bg-surface p-10 shadow-2xl shadow-black/50 text-center">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text-primary">Unauthorized</h1>
        <p className="mt-4 text-sm sm:text-base text-text-secondary">
          You do not have permission to access this page.
        </p>
        <a
          href="/dashboard"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition hover:bg-accent/20"
        >
          Back to dashboard
        </a>
      </section>
    </main>
  );
}
