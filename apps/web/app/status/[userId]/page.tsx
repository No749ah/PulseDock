import { API_BASE } from '../../../lib/api';

type PublicOverview = {
  totalMonitors: number;
  green: number;
  yellow: number;
  red: number;
  uptimePct: number;
  latestRuns: Array<{ id: string; checkedAt: string; level: 'green' | 'yellow' | 'red'; message: string }>;
};

export default async function PublicStatusPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const response = await fetch(`${API_BASE}/v1/public/overview/${userId}`, { cache: 'no-store' });
  const data: PublicOverview = await response.json();

  return (
    <main className="mx-auto mt-8 w-full max-w-5xl px-4 pb-8">
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-xl shadow-black/30">
        <div className="text-xs uppercase tracking-[0.2em] text-accent">Public Status</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">PulseDock Service Health</h1>
        <p className="mt-2 text-sm text-text-secondary">Public uptime board for workspace: {userId}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-bg p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">Uptime</div>
            <h2 className="mt-1 text-2xl font-semibold text-text-primary">{data.uptimePct}%</h2>
          </div>
          <div className="rounded-xl border border-border bg-bg p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">Monitors</div>
            <h2 className="mt-1 text-2xl font-semibold text-text-primary">{data.totalMonitors}</h2>
          </div>
          <div className="rounded-xl border border-border bg-bg p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">Warning</div>
            <h2 className="mt-1 text-2xl font-semibold text-yellow-400">{data.yellow}</h2>
          </div>
          <div className="rounded-xl border border-border bg-bg p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">Critical</div>
            <h2 className="mt-1 text-2xl font-semibold text-red-400">{data.red}</h2>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-surface p-6 shadow-xl shadow-black/30">
        <h3 className="text-lg font-semibold text-text-primary">Latest Events</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 pr-4 font-medium">Level</th>
                <th className="py-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {data.latestRuns.map((r) => (
                <tr key={r.id} className="border-b border-border/60 text-text-primary">
                  <td className="py-2 pr-4">{new Date(r.checkedAt).toLocaleString()}</td>
                  <td className="py-2 pr-4">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${r.level === 'green' ? 'bg-green-500/15 text-green-300' : r.level === 'yellow' ? 'bg-yellow-500/15 text-yellow-300' : 'bg-red-500/15 text-red-300'}`}>
                      {r.level.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
