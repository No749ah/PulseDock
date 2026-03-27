/**
 * Public mini-status page for a single monitor via share token.
 * Route: GET /public/monitor/:token
 *
 * No authentication required — the share token grants read-only access.
 * Designed to be shared with customers, embedded in README files, or
 * linked from open-source project pages.
 */

export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { brand } from '../../../../lib/brand';

const API_BASE =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:4321';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MonitorStatus {
  name: string;
  type: string;
  target: string;
  status: 'up' | 'down' | 'unknown' | 'paused';
  level: 'green' | 'yellow' | 'red' | 'unknown';
  lastChecked: string | null;
  latencyMs: number | null;
  message: string | null;
  uptimePct30d: number | null;
  enabled: boolean;
  generatedAt: string;
}

interface HistoryRun {
  checkedAt: string;
  ok: boolean;
  level: 'green' | 'yellow' | 'red';
  latencyMs: number | null;
  message: string | null;
}

interface MonitorHistory {
  monitorId: string;
  name: string;
  type: string;
  target: string;
  enabled: boolean;
  history: HistoryRun[];
  generatedAt: string;
}

interface Props {
  params: Promise<{ token: string }>;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchStatus(token: string): Promise<MonitorStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/public/monitor/${token}/status.json`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return (await res.json()) as MonitorStatus;
  } catch {
    return null;
  }
}

async function fetchHistory(token: string): Promise<MonitorHistory | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/public/monitor/${token}/history?limit=90`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return (await res.json()) as MonitorHistory;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const data = await fetchStatus(token);
  if (!data) return { title: 'Monitor Status' };

  const statusLabel = data.status === 'up' ? '✅ Operational' : data.status === 'down' ? '🔴 Down' : data.status === 'paused' ? '⏸ Paused' : '⚠️ Unknown';
  return {
    title: `${data.name} — ${statusLabel} | ${brand.name}`,
    description: `Live status for ${data.name} (${data.target}). Uptime: ${data.uptimePct30d ?? '—'}% (30d).`,
    robots: 'noindex, nofollow',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatType(type: string): string {
  const map: Record<string, string> = {
    HTTP: 'HTTP', GIT_RELEASE: 'Git Release', DOCKER_IMAGE: 'Docker Image',
    TCP: 'TCP', SSL_CERT: 'SSL Cert', HEARTBEAT: 'Heartbeat',
    DNS: 'DNS', PING: 'Ping', SMTP: 'SMTP', BROWSER: 'Browser', WHOIS: 'WHOIS',
  };
  return map[type] ?? type;
}

function statusMeta(status: MonitorStatus['status']): { label: string; colorClass: string; dotClass: string; bgClass: string; borderClass: string } {
  switch (status) {
    case 'up': return { label: 'Operational', colorClass: 'text-success', dotClass: 'bg-success shadow-[0_0_6px_#3fb95055]', bgClass: 'bg-success/10', borderClass: 'border-success/30' };
    case 'down': return { label: 'Down', colorClass: 'text-danger', dotClass: 'bg-danger shadow-[0_0_6px_#f8514955]', bgClass: 'bg-danger/10', borderClass: 'border-danger/30' };
    case 'paused': return { label: 'Paused', colorClass: 'text-text-secondary', dotClass: 'bg-text-secondary', bgClass: 'bg-surface-elevated', borderClass: 'border-border' };
    default: return { label: 'Unknown', colorClass: 'text-warning', dotClass: 'bg-warning', bgClass: 'bg-warning/10', borderClass: 'border-warning/30' };
  }
}

function levelColor(level: 'green' | 'yellow' | 'red'): string {
  return level === 'green' ? 'bg-success' : level === 'yellow' ? 'bg-warning' : 'bg-danger';
}

/**
 * Build 90-day uptime history bars — one bar per day.
 */
function buildDayBars(runs: HistoryRun[]): { date: string; pct: number | null; color: string; height: string }[] {
  const days = new Map<string, { ok: number; total: number }>();
  for (const r of runs) {
    const day = r.checkedAt.slice(0, 10);
    const prev = days.get(day) ?? { ok: 0, total: 0 };
    days.set(day, { ok: prev.ok + (r.ok ? 1 : 0), total: prev.total + 1 });
  }

  const result: { date: string; pct: number | null; color: string; height: string }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const data = days.get(key);
    if (!data) {
      result.push({ date: key, pct: null, color: 'bg-surface-elevated', height: 'h-1' });
    } else {
      const pct = data.total > 0 ? data.ok / data.total : 0;
      const color = pct >= 0.99 ? 'bg-success' : pct >= 0.80 ? 'bg-warning' : 'bg-danger';
      const heightPct = Math.max(Math.round(pct * 28) + 4, 4);
      result.push({ date: key, pct: Math.round(pct * 1000) / 10, color, height: `${heightPct}px` });
    }
  }
  return result;
}

/**
 * Build SVG sparkline path from latency values.
 */
function buildSparkPath(runs: HistoryRun[]): string | null {
  const withLatency = [...runs].reverse().filter(r => r.latencyMs != null);
  if (withLatency.length < 3) return null;
  const W = 400;
  const H = 48;
  const max = Math.max(...withLatency.map(r => r.latencyMs!), 1);
  const step = W / Math.max(withLatency.length - 1, 1);
  return withLatency.map((r, i) => {
    const x = (i * step).toFixed(1);
    const y = (H - ((r.latencyMs! / max) * (H - 4))).toFixed(1);
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');
}

// ---------------------------------------------------------------------------
// Page component (RSC)
// ---------------------------------------------------------------------------

export default async function PublicMonitorPage({ params }: Props) {
  const { token } = await params;
  const [status, historyData] = await Promise.all([fetchStatus(token), fetchHistory(token)]);

  if (!status) notFound();

  const runs = historyData?.history ?? [];
  const sm = statusMeta(status.status);
  const dayBars = buildDayBars(runs);
  const sparkPath = buildSparkPath(runs);
  const avgLatency = (() => {
    const valid = runs.filter(r => r.latencyMs != null);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((s, r) => s + r.latencyMs!, 0) / valid.length);
  })();

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center px-4 py-10 pb-20">
      {/* Back link */}
      <div className="w-full max-w-2xl mb-6">
        <a href="/" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
          ← {brand.name}
        </a>
      </div>

      {/* Status card */}
      <div className="w-full max-w-2xl bg-surface border border-border rounded-xl p-6 space-y-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-text-primary leading-tight flex items-center gap-2 flex-wrap">
              {status.name}
              <span className="inline-block px-2 py-0.5 rounded-md bg-surface-elevated border border-border text-[11px] font-medium text-text-muted">
                {formatType(status.type)}
              </span>
            </h1>
            <p className="text-xs text-text-muted font-mono mt-1 truncate">{status.target}</p>
          </div>
          {/* Status pill */}
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold flex-shrink-0 ${sm.bgClass} ${sm.borderClass} ${sm.colorClass}`}>
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sm.dotClass}`} />
            {sm.label}
          </span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
          <div>
            <div className="text-2xl font-bold text-text-primary tabular-nums">
              {status.uptimePct30d != null ? `${status.uptimePct30d}%` : '—'}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">Uptime (30d)</div>
          </div>
          {status.latencyMs != null && (
            <div>
              <div className="text-2xl font-bold text-text-primary tabular-nums">
                {status.latencyMs}<span className="text-sm font-medium text-text-muted ml-0.5">ms</span>
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">Last latency</div>
            </div>
          )}
          {avgLatency != null && (
            <div>
              <div className="text-2xl font-bold text-text-primary tabular-nums">
                {avgLatency}<span className="text-sm font-medium text-text-muted ml-0.5">ms</span>
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">Avg (90 checks)</div>
            </div>
          )}
          <div>
            <div className="text-2xl font-bold text-text-primary tabular-nums">{formatRelative(status.lastChecked)}</div>
            <div className="text-[11px] text-text-muted mt-0.5">Last checked</div>
          </div>
        </div>

        {/* Last message */}
        {status.message && (
          <div className="text-xs text-text-secondary bg-surface-elevated rounded-lg px-3 py-2 font-mono border border-border">
            {status.message}
          </div>
        )}
      </div>

      {/* 90-day uptime history */}
      {runs.length > 0 && (
        <div className="w-full max-w-2xl bg-surface border border-border rounded-xl p-6 mt-4 space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">90-Day Uptime History</div>
          <div className="flex items-end gap-0.5 h-8 w-full" title="Each bar = 1 day. Green = operational, yellow = degraded, red = outage, dark = no data.">
            {dayBars.map((bar) => (
              <div
                key={bar.date}
                className={`flex-1 rounded-sm transition-opacity hover:opacity-70 ${bar.color}`}
                style={{ height: bar.height }}
                title={bar.pct != null ? `${bar.date}: ${bar.pct}% uptime` : `${bar.date}: no data`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>90 days ago</span>
            <span>Today</span>
          </div>
        </div>
      )}

      {/* Latency sparkline */}
      {sparkPath && (
        <div className="w-full max-w-2xl bg-surface border border-border rounded-xl p-6 mt-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Response Time — Last {runs.filter(r => r.latencyMs != null).length} Checks
          </div>
          <svg
            viewBox="0 0 400 48"
            className="w-full h-12"
            preserveAspectRatio="none"
            aria-label="Response time sparkline"
          >
            <path d={sparkPath} fill="none" stroke="#388bfd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* Recent check history */}
      {runs.length > 0 && (
        <div className="w-full max-w-2xl bg-surface border border-border rounded-xl p-6 mt-4 space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Recent Checks</div>
          <ul className="space-y-1.5">
            {runs.slice(0, 20).map((r, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2 bg-surface-elevated rounded-lg border border-border text-sm">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${levelColor(r.level)}`} />
                <span className="text-text-muted text-xs w-16 flex-shrink-0">{formatRelative(r.checkedAt)}</span>
                <span className="text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap flex-1 text-xs">
                  {r.message ?? (r.ok ? 'OK' : 'Failed')}
                </span>
                <span className="text-text-muted text-xs flex-shrink-0 w-14 text-right tabular-nums">
                  {r.latencyMs != null ? `${r.latencyMs}ms` : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <p className="mt-8 text-[11px] text-text-muted">
        Powered by{' '}
        <a href="/" className="text-text-muted hover:text-text-secondary transition-colors" target="_blank" rel="noopener noreferrer">
          {brand.name}
        </a>
      </p>
    </div>
  );
}
