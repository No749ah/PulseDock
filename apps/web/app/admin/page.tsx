'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart2, Check, ChevronLeft, ChevronRight,
  ClipboardList, Copy, Database, KeyRound, Link2,
  Mail, Monitor, RefreshCw, Server, Trash2, UserCog,
  Users, X, XCircle, CheckCircle, Zap, AlertCircle, Puzzle,
} from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { LoadingState } from '../../components/ui/loading-state';
import { api } from '../../lib/api';
import { Badge } from '../../app/components/Badge';
import { Card } from '../../app/components/Card';
import { CountUp } from '../../app/components/CountUp';
import { exportCSV, exportJSON } from '../../lib/useTableSort';
import { EditUserModal } from './components/EditUserModal';
import { useAdmin, PAGE_SIZE } from './hooks/useAdmin';
import type { HealthData, MetricsData, SystemStatsData } from './types';

// ── helpers ───────────────────────────────────────────────────────────────────

function formatUptime(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function RelativeTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  const label = s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : d.toLocaleDateString();
  return <span title={d.toLocaleString()} className="text-text-secondary text-xs">{label}</span>;
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-surface-elevated border border-border text-text-secondary hover:text-accent hover:border-accent transition-colors"
    >
      <Copy className="w-3.5 h-3.5" />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
      <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-surface-elevated disabled:opacity-30 transition-colors">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-xs text-text-secondary tabular-nums">{page} / {pages}</span>
      <button onClick={() => onPage(Math.min(pages, page + 1))} disabled={page === pages} className="p-1.5 rounded-lg hover:bg-surface-elevated disabled:opacity-30 transition-colors">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: React.ComponentType<{ className?: string }>; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="p-1.5 rounded-lg bg-accent/10"><Icon className="w-4 h-4 text-accent" /></div>
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      {count !== undefined && (
        <span className="ml-auto text-xs text-text-secondary tabular-nums bg-surface-elevated px-2 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

// ── System Health Widget ──────────────────────────────────────────────────────

function SystemHealthWidget() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetch_ = useCallback(async () => {
    setRefreshing(true);
    try {
      const [h, m] = await Promise.all([
        api<HealthData>('/health').catch(() => null),
        api<MetricsData>('/metrics').catch(() => null),
      ]);
      setHealth(h); setMetrics(m);
      setError(h === null || !h.ok);
      setLastUpdated(new Date());
    } finally { setRefreshing(false); }
  }, []);

  useEffect(() => {
    void fetch_();
    const t = setInterval(() => void fetch_(), 30_000);
    return () => clearInterval(t);
  }, [fetch_]);

  const dbStatus = health?.checks?.database?.status;
  const ok = !error;

  return (
    <Card className="mb-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-accent/10"><Activity className="w-4 h-4 text-accent" /></div>
          <h3 className="text-base font-semibold text-text-primary">System Health</h3>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="text-xs text-text-secondary">{lastUpdated.toLocaleTimeString()}</span>}
          <button
            onClick={() => void fetch_()}
            disabled={refreshing}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-4 ${ok ? 'bg-success/10 border border-success/20' : 'bg-danger/10 border border-danger/20'}`}>
        {ok ? <CheckCircle className="w-5 h-5 text-success shrink-0" /> : <XCircle className="w-5 h-5 text-danger shrink-0" />}
        <div>
          <p className={`font-semibold text-sm ${ok ? 'text-success' : 'text-danger'}`}>
            {ok ? 'All Systems Operational' : 'Service Degraded'}
          </p>
          {health && (
            <p className="text-xs text-text-secondary mt-0.5">{health.service} v{health.version} · {health.runtime}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { icon: Server, label: 'Uptime', value: health ? formatUptime(health.uptimeMs) : '—', color: 'text-accent' },
          {
            icon: Database, label: 'Database',
            value: dbStatus === 'ok' ? 'OK' : dbStatus === 'error' ? 'ERROR' : '—',
            color: dbStatus === 'ok' ? 'text-success' : 'text-danger',
            sub: health?.checks?.database?.latencyMs != null ? `${health.checks.database.latencyMs}ms` : undefined,
          },
          { icon: Zap, label: 'Requests', value: metrics?.requestsTotal?.toLocaleString() ?? '—', color: 'text-text-primary' },
          {
            icon: AlertTriangle, label: 'Errors',
            value: metrics?.errorsTotal?.toLocaleString() ?? '—',
            color: (metrics?.errorsTotal ?? 0) > 0 ? 'text-warning' : 'text-text-primary',
          },
        ].map(({ icon: Icon, label, value, color, sub }) => (
          <div key={label} className="bg-surface-elevated rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Icon className="w-3.5 h-3.5 text-text-secondary" />
              <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wide">{label}</span>
            </div>
            <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
            {sub && <p className="text-xs text-text-secondary mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {metrics && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Login failures', value: metrics.authLoginFailed, danger: metrics.authLoginFailed > 10 },
            { label: 'Alerts sent', value: metrics.alertsSent, success: true },
            { label: 'Alert failures', value: metrics.alertsFailed, danger: metrics.alertsFailed > 0 },
          ].map(({ label, value, danger, success }) => (
            <div key={label} className="bg-surface-elevated rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-text-secondary">{label}</span>
              <span className={`text-sm font-semibold tabular-nums ${danger ? 'text-danger' : success ? 'text-success' : 'text-text-primary'}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── System Stats Widget ───────────────────────────────────────────────────────

function SystemStatsWidget() {
  const [stats, setStats] = useState<SystemStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<SystemStatsData>('/v1/admin/stats').then(setStats).catch(() => null).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-surface-elevated rounded-xl animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }
  if (!stats) return null;

  const tiles = [
    { label: 'Total users', value: stats.users.total, sub: `${stats.users.active} active`, icon: Users, color: 'text-accent' },
    { label: 'Total monitors', value: stats.monitors.total, sub: `${stats.monitors.enabled} enabled`, icon: Monitor, color: 'text-accent' },
    { label: 'Checks today', value: stats.checksToday, sub: 'since midnight UTC', icon: BarChart2, color: 'text-success' },
    { label: 'Failed today', value: stats.failedToday, sub: `${stats.errorRatePct}% error rate`, icon: AlertTriangle, color: stats.failedToday > 0 ? 'text-danger' : 'text-text-secondary' },
  ];

  return (
    <Card className="mb-5">
      <SectionHeader icon={BarChart2} title="System Statistics" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="rounded-xl bg-surface-elevated border border-border p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className="text-[11px] text-text-secondary uppercase tracking-wide">{label}</span>
            </div>
            <span className={`text-2xl font-bold ${color}`}>
              <CountUp value={`${value}`} duration={900} />
            </span>
            <p className="text-xs text-text-secondary mt-0.5">{sub}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const a = useAdmin();

  return (
    <AppFrame title="Admin" subtitle="System management, user access, and audit logs." breadcrumbs={[{ label: 'Admin' }]}>
      {a.loading ? <LoadingState label="Loading admin data…" /> : (
        <div className="space-y-5">
          <SystemHealthWidget />
          <SystemStatsWidget />

          {/* Recent Activity Feed */}
          {a.auditLogs.length > 0 && (
            <Card>
              <SectionHeader icon={ClipboardList} title="Recent Activity" count={Math.min(10, a.auditLogs.length)} />
              <div className="space-y-1">
                {a.auditLogs.slice(0, 10).map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-elevated/60 transition-colors border-b border-border/40 last:border-b-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 ${
                      l.action.toLowerCase().includes('delete') || l.action.toLowerCase().includes('fail') ? 'bg-danger/60' :
                      l.action.toLowerCase().includes('create') || l.action.toLowerCase().includes('invite') ? 'bg-success/60' :
                      'bg-accent/60'
                    }`} />
                    <p className="flex-1 text-sm font-mono text-text-primary">{l.action}</p>
                    <p className="text-xs text-text-secondary hidden sm:block truncate max-w-[100px]" title={l.actorUserId ?? ''}>{l.actorUserId?.slice(0, 8) ?? 'system'}</p>
                    <RelativeTime iso={l.createdAt} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Users */}
          <Card>
            <SectionHeader icon={Users} title="Users" count={a.users.length} />
            <div className="space-y-2">
              {a.userRows.length === 0 && (
                <p className="text-sm text-text-secondary text-center py-6">No users found.</p>
              )}
              {a.userRows.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-elevated border border-border hover:border-accent/30 transition-colors cursor-pointer group"
                  onClick={() => a.setEditUser(u)}
                >
                  <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center shrink-0 text-sm font-bold text-accent uppercase">
                    {u.email[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {u.displayName ? (
                        <><span>{u.displayName}</span><span className="text-text-secondary font-normal ml-1.5 hidden sm:inline">{u.email}</span></>
                      ) : u.email}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <p className="text-xs text-text-secondary">Joined <RelativeTime iso={u.createdAt} /></p>
                      {u.totpEnabled && <span className="text-[10px] font-semibold text-warning bg-warning/10 border border-warning/20 px-1.5 py-0.5 rounded-full">🔐 MFA</span>}
                      {!u.emailVerified && <span className="text-[10px] font-semibold text-text-muted bg-surface border border-border px-1.5 py-0.5 rounded-full">unverified</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`hidden sm:inline px-2 py-0.5 rounded-full text-[11px] font-semibold border ${u.role === 'admin' ? 'text-accent bg-accent/10 border-accent/30' : 'text-text-secondary bg-surface border-border'}`}>
                      {u.role === 'admin' ? '🛡 Admin' : '👤 User'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${u.isActive !== false ? 'text-success bg-success/10 border-success/30' : 'text-danger bg-danger/10 border-danger/30'}`}>
                      {u.isActive !== false ? 'Active' : 'Disabled'}
                    </span>
                    <div className="p-1.5 rounded-lg text-text-secondary group-hover:text-accent transition-colors">
                      <UserCog className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={a.usersPage} pages={a.usersPages} onPage={a.setUsersPage} />
          </Card>

          {/* Invite User */}
          <Card>
            <SectionHeader icon={Mail} title="Invite User" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Email address</label>
                <input
                  type="email"
                  value={a.inviteEmail}
                  onChange={(e) => a.setInviteEmail(e.target.value)}
                  placeholder="new.user@company.com"
                  className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Role</label>
                <div className="flex gap-2 pt-0.5">
                  {(['user', 'admin'] as const).map((r) => {
                    const isSelected = a.inviteRole === r;
                    const isAdmin = r === 'admin';
                    return (
                      <button
                        key={r}
                        onClick={() => a.setInviteRole(r)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
                          isSelected
                            ? isAdmin
                              ? 'text-accent bg-accent/10 border-accent/40 ring-1 ring-accent/30'
                              : 'text-text-primary bg-surface-elevated border-border ring-1 ring-border'
                            : 'text-text-secondary bg-transparent border-border/50 hover:border-border hover:text-text-primary'
                        }`}
                      >
                        {isAdmin ? '🛡' : '👤'} {isAdmin ? 'Admin' : 'User'}
                        {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <button
              onClick={a.createInvite}
              disabled={a.inviting || !a.inviteEmail.trim()}
              className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {a.inviting ? 'Creating…' : 'Create invite link'}
            </button>

            {a.latestInvite && (
              <div className="mt-4 p-4 rounded-xl bg-success/5 border border-success/20">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="w-4 h-4 text-success" />
                  <p className="text-sm font-medium text-success">Invite link created</p>
                </div>
                <p className="text-xs text-text-secondary break-all mb-3">{a.latestInvite.inviteUrl ?? '—'}</p>
                <div className="flex gap-2">
                  <CopyBtn value={a.latestInvite.inviteUrl ?? ''} />
                  <button onClick={() => a.setLatestInvite(null)} className="text-xs text-text-secondary hover:text-text-primary transition-colors">Dismiss</button>
                </div>
              </div>
            )}

            {a.inviteRows.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Active invites</p>
                <div className="space-y-2">
                  {a.inviteRows.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-elevated border border-border">
                      <Mail className="w-4 h-4 text-text-secondary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary">{inv.email}</p>
                        <p className="text-xs text-text-secondary">
                          {inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${inv.acceptedAt ? 'text-success bg-success/10 border-success/30' : 'text-warning bg-warning/10 border-warning/30'}`}>
                        {inv.acceptedAt ? 'Accepted' : 'Pending'}
                      </span>
                      {!inv.acceptedAt && (
                        <button
                          onClick={() => a.revokeInvite(inv.id)}
                          className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Revoke"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <Pagination page={a.invitesPage} pages={a.invitesPages} onPage={a.setInvitesPage} />
              </div>
            )}
          </Card>

          {/* Password Resets */}
          {a.resets.length > 0 && (
            <Card>
              <SectionHeader icon={KeyRound} title="Pending Password Resets" count={a.resets.length} />
              <p className="text-xs text-text-secondary mb-3">Fallback reset links when email delivery isn&apos;t configured.</p>
              <div className="space-y-2">
                {a.resetRows.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-elevated border border-border">
                    <KeyRound className="w-4 h-4 text-warning shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary">{r.email}</p>
                      <p className="text-xs text-text-secondary">Expires {new Date(r.expiresAt).toLocaleDateString()}</p>
                    </div>
                    <CopyBtn value={r.resetUrl} />
                    <button onClick={() => a.revokeReset(r.id)} className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors" title="Revoke">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Pagination page={a.resetsPage} pages={a.resetsPages} onPage={a.setResetsPage} />
            </Card>
          )}

          {/* Audit Log */}
          <Card>
            <div className="flex items-center justify-between mb-1">
              <SectionHeader icon={ClipboardList} title="Audit Log" count={a.auditLogs.length} />
              {a.auditLogs.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => exportCSV('audit-log.csv', a.auditLogs.map((l) => ({ id: l.id, action: l.action, actorUserId: l.actorUserId ?? 'system', targetUserId: l.targetUserId ?? '', createdAt: l.createdAt })))}
                    className="px-2.5 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border transition-colors"
                    title="Export audit log as CSV"
                  >
                    CSV
                  </button>
                  <button
                    onClick={() => exportJSON('audit-log.json', a.auditLogs)}
                    className="px-2.5 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border transition-colors"
                    title="Export audit log as JSON"
                  >
                    JSON
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1">
              {a.auditRows.length === 0 && (
                <p className="text-sm text-text-secondary text-center py-6">No audit events yet.</p>
              )}
              {a.auditRows.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-elevated/60 transition-colors border-b border-border/40 last:border-b-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent/60 shrink-0 mt-0.5" />
                  <p className="flex-1 text-sm font-mono text-text-primary">{l.action}</p>
                  <p className="text-xs text-text-secondary hidden sm:block truncate max-w-[100px]" title={l.actorUserId ?? ''}>
                    {l.actorUserId?.slice(0, 8) ?? 'system'}
                  </p>
                  <RelativeTime iso={l.createdAt} />
                </div>
              ))}
            </div>
            <Pagination page={a.auditPage} pages={a.auditPages} onPage={a.setAuditPage} />
          </Card>

          {/* Template Feedback Reports */}
          <Card>
            <SectionHeader icon={AlertCircle} title="Template Feedback Reports" count={a.templateReports.length} />
            {a.templateReports.length === 0 && (
              <p className="text-sm text-text-secondary text-center py-6">No template reports yet.</p>
            )}
            {a.templateReports
              .slice((a.templateReportsPage - 1) * PAGE_SIZE, a.templateReportsPage * PAGE_SIZE)
              .map((r) => (
                <div key={r.id} className="flex flex-col gap-1 px-3 py-3 rounded-lg border-b border-border/40 last:border-b-0 hover:bg-surface-elevated/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-text-primary font-mono">{r.toolId}</span>
                    {r.statusCode != null && <Badge variant="danger">{String(r.statusCode)}</Badge>}
                    <RelativeTime iso={r.createdAt} />
                  </div>
                  {r.endpoint && <p className="text-xs text-text-secondary font-mono truncate">Endpoint: {r.endpoint}</p>}
                  {r.error && <p className="text-xs text-danger truncate">Error: {r.error}</p>}
                  {r.note && <p className="text-xs text-text-secondary italic">&quot;{r.note}&quot;</p>}
                </div>
              ))}
            <Pagination
              page={a.templateReportsPage}
              pages={Math.max(1, Math.ceil(a.templateReports.length / PAGE_SIZE))}
              onPage={a.setTemplateReportsPage}
            />
          </Card>

          {/* Check Plugins */}
          <Card>
            <SectionHeader icon={Puzzle} title="Check Plugins" count={a.plugins.length} />
            {a.plugins.length === 0 && (
              <p className="text-sm text-text-secondary text-center py-6">No plugins loaded.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {a.plugins.map((p) => (
                <div key={p.id} className="flex flex-col gap-1 px-4 py-3 rounded-xl border border-border bg-surface-elevated hover:border-accent/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <Puzzle className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{p.displayName}</p>
                      <p className="text-xs text-text-secondary font-mono truncate">{p.id}</p>
                    </div>
                    <Badge variant="success">active</Badge>
                  </div>
                  {p.description && (
                    <p className="text-xs text-text-secondary mt-1">{p.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.supportedMonitorTypes.map((t) => (
                      <span key={t} className="text-xs bg-surface border border-border text-text-secondary px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                  {p.configFields.length > 0 && (
                    <p className="text-xs text-text-secondary mt-1">
                      {p.configFields.length} config field{p.configFields.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-text-secondary mt-3 px-1">
              External plugins load from <code className="text-accent text-xs">PLUGIN_DIR</code> (default: <code className="text-text-secondary text-xs">./plugins</code>). Drop <code className="text-text-secondary text-xs">*.plugin.js</code> files there and restart.
            </p>
          </Card>
        </div>
      )}

      {a.editUser && (
        <EditUserModal
          user={a.editUser}
          currentUserId={a.currentUser?.id ?? ''}
          onClose={() => a.setEditUser(null)}
          onSave={a.handleSaveUser}
          onDelete={a.handleDeleteUser}
        />
      )}
    </AppFrame>
  );
}
