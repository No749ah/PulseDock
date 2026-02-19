import { API_BASE } from '../../../lib/api';

type PublicOverview = {
  totalMonitors: number;
  green: number;
  yellow: number;
  red: number;
  uptimePct: number;
  latestRuns: Array<{ id: string; checkedAt: string; level: 'green'|'yellow'|'red'; message: string }>;
};

export default async function PublicStatusPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const response = await fetch(`${API_BASE}/v1/public/overview/${userId}`, { cache: 'no-store' });
  const data: PublicOverview = await response.json();

  return (
    <main style={{ maxWidth: 980, margin: '30px auto', padding: 16 }}>
      <section className="card">
        <div className="kicker">Public Status</div>
        <h1 style={{ marginTop: 8 }}>PulseDock Service Health</h1>
        <p className="muted">Public uptime board for workspace: {userId}</p>

        <div className="grid" style={{ marginTop: 14 }}>
          <div className="card stat"><div className="muted">Uptime</div><h2>{data.uptimePct}%</h2></div>
          <div className="card stat"><div className="muted">Monitors</div><h2>{data.totalMonitors}</h2></div>
          <div className="card stat"><div className="muted">Warning</div><h2>{data.yellow}</h2></div>
          <div className="card stat"><div className="muted">Critical</div><h2>{data.red}</h2></div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <h3>Latest Events</h3>
        <table className="table">
          <thead><tr><th>Time</th><th>Level</th><th>Message</th></tr></thead>
          <tbody>
            {data.latestRuns.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.checkedAt).toLocaleString()}</td>
                <td><span className={`badge ${r.level}`}>{r.level.toUpperCase()}</span></td>
                <td>{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
