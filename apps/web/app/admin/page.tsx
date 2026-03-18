'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, BarChart2, Check, ChevronLeft, ChevronRight,
  CheckCircle, ClipboardList, Copy, Database, KeyRound, Link2,
  Mail, Monitor, RefreshCw, Server, Shield, Trash2, UserCog,
  Users, X, XCircle, Zap,
} from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { LoadingState } from '../../components/ui/loading-state';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import { Badge } from '../../app/components/Badge';
import { Card } from '../../app/components/Card';

// ── types ─────────────────────────────────────────────────────────────────────

type AdminUser = { id: string; email: string; role: 'admin' | 'user'; createdAt: string; isActive?: boolean };
type Invite = { id: string; email: string; role: 'admin' | 'user'; inviteUrl?: string; expiresAt: string; acceptedAt?: string | null };
type AuditLog = { id: string; action: string; actorUserId: string | null; targetUserId: string | null; createdAt: string };
type PasswordReset = { id: string; email: string; expiresAt: string; createdAt: string; resetUrl: string };

type HealthData = {
  ok: boolean; service: string; version: string; runtime: string; uptimeMs: number;
  checks: { database: { status: 'ok' | 'error'; latencyMs: number | null } };
};
type MetricsData = { requestsTotal: number; errorsTotal: number; authLoginFailed: number; alertsSent: number; alertsFailed: number };
type SystemStatsData = {
  users: { total: number; active: number }; monitors: { total: number; enabled: number };
  checksToday: number; failedToday: number; errorRatePct: number;
};

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
  let label = s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : d.toLocaleDateString();
  return <span title={d.toLocaleString()} className="text-text-secondary text-xs">{label}</span>;
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <button onClick={copy} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-surface-elevated border border-border text-text-secondary hover:text-accent hover:border-accent transition-colors">
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

// ── System Health ─────────────────────────────────────────────────────────────

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

  useEffect(() => { void fetch_(); const t = setInterval(() => void fetch_(), 30_000); return () => clearInterval(t); }, [fetch_]);

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
          <button onClick={() => void fetch_()} disabled={refreshing} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated disabled:opacity-40 transition-colors">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-4 ${ok ? 'bg-success/10 border border-success/20' : 'bg-danger/10 border border-danger/20'}`}>
        {ok ? <CheckCircle className="w-5 h-5 text-success shrink-0" /> : <XCircle className="w-5 h-5 text-danger shrink-0" />}
        <div>
          <p className={`font-semibold text-sm ${ok ? 'text-success' : 'text-danger'}`}>{ok ? 'All Systems Operational' : 'Service Degraded'}</p>
          {health && <p className="text-xs text-text-secondary mt-0.5">{health.service} v{health.version} · {health.runtime}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { icon: Server, label: 'Uptime', value: health ? formatUptime(health.uptimeMs) : '—', color: 'text-accent' },
          { icon: Database, label: 'Database', value: dbStatus === 'ok' ? 'OK' : dbStatus === 'error' ? 'ERROR' : '—', color: dbStatus === 'ok' ? 'text-success' : 'text-danger', sub: health?.checks?.database?.latencyMs != null ? `${health.checks.database.latencyMs}ms` : undefined },
          { icon: Zap, label: 'Requests', value: metrics?.requestsTotal?.toLocaleString() ?? '—', color: 'text-text-primary' },
          { icon: AlertTriangle, label: 'Errors', value: metrics?.errorsTotal?.toLocaleString() ?? '—', color: (metrics?.errorsTotal ?? 0) > 0 ? 'text-warning' : 'text-text-primary' },
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
              <span className={`text-sm font-semibold tabular-nums ${danger ? 'text-danger' : success ? 'text-success' : 'text-text-primary'}`}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── System Stats ──────────────────────────────────────────────────────────────

function SystemStatsWidget() {
  const [stats, setStats] = useState<SystemStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<SystemStatsData>('/v1/admin/stats').then(setStats).catch(() => null).finally(() => setLoading(false));
  }, []);

  if (loading) return <Card className="mb-5"><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-surface-elevated rounded-xl animate-pulse" />)}</div></Card>;
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="rounded-xl bg-surface-elevated border border-border p-4">
            <div className="flex items-center gap-1.5 mb-2"><Icon className={`w-3.5 h-3.5 ${color}`} /><span className="text-[11px] text-text-secondary uppercase tracking-wide">{label}</span></div>
            <span className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</span>
            <p className="text-xs text-text-secondary mt-0.5">{sub}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Edit User Modal ───────────────────────────────────────────────────────────

function EditUserModal({ user: u, currentUserId, onClose, onSave }: {
  user: AdminUser; currentUserId: string;
  onClose: () => void; onSave: (patch: Partial<AdminUser>) => Promise<void>;
}) {
  const [email, setEmail] = useState(u.email);
  const [role, setRole] = useState<'admin' | 'user'>(u.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isSelf = u.id === currentUserId;

  async function handleSave() {
    setSaving(true); setError('');
    try { await onSave({ email: email.trim(), role }); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function toggleActive() {
    setSaving(true); setError('');
    try { await onSave({ isActive: !u.isActive }); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to update'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Header — avatar + identity */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center shrink-0 text-sm font-bold text-accent uppercase">
            {u.email[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{u.email}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${u.role === 'admin' ? 'text-accent bg-accent/10 border-accent/30' : 'text-text-secondary bg-surface-elevated border-border'}`}>
                {u.role === 'admin' ? '🛡 Admin' : '👤 User'}
              </span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${u.isActive !== false ? 'text-success bg-success/10 border-success/30' : 'text-danger bg-danger/10 border-danger/30'}`}>
                {u.isActive !== false ? 'Active' : 'Disabled'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Role — pill selector matching display style */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">Role</label>
            <div className="flex gap-2">
              {(['user', 'admin'] as const).map((r) => {
                const isSelected = role === r;
                const isAdmin = r === 'admin';
                return (
                  <button
                    key={r}
                    disabled={isSelf}
                    onClick={() => setRole(r)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
                      isSelected
                        ? isAdmin
                          ? 'text-accent bg-accent/10 border-accent/40 ring-1 ring-accent/30'
                          : 'text-text-primary bg-surface-elevated border-border ring-1 ring-border'
                        : 'text-text-secondary bg-transparent border-border/50 hover:border-border hover:text-text-primary'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {isAdmin ? '🛡' : '👤'} {isAdmin ? 'Admin' : 'User'}
                    {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                  </button>
                );
              })}
            </div>
            {isSelf && <p className="text-xs text-text-secondary mt-1.5">You cannot change your own role.</p>}
          </div>

          {/* Account status */}
          <div className="flex items-center justify-between py-3 px-3.5 rounded-xl bg-surface-elevated border border-border">
            <div>
              <p className="text-sm font-medium text-text-primary">Account status</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {u.isActive !== false ? 'User can sign in' : 'All sessions revoked'}
              </p>
            </div>
            <button
              disabled={isSelf || saving}
              onClick={toggleActive}
              className={`ml-3 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${u.isActive !== false
                ? 'bg-danger/10 text-danger border-danger/30 hover:bg-danger/20'
                : 'bg-success/10 text-success border-success/30 hover:bg-success/20'
              }`}
            >
              {u.isActive !== false ? 'Disable' : 'Enable'}
            </button>
          </div>

          {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !email.trim()} className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export default function AdminPage() {
  const router = useRouter();
  const currentUser = useMemo(() => (typeof window !== 'undefined' ? getUser() : null), []);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [resets, setResets] = useState<PasswordReset[]>([]);
  const [loading, setLoading] = useState(true);

  // invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [latestInvite, setLatestInvite] = useState<Invite | null>(null);
  const [inviting, setInviting] = useState(false);

  // edit modal
  const [editUser, setEditUser] = useState<AdminUser | null>(null);

  // pagination
  const [usersPage, setUsersPage] = useState(1);
  const [invitesPage, setInvitesPage] = useState(1);
  const [resetsPage, setResetsPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);

  useEffect(() => {
    if (!currentUser) router.push('/login');
    else if (currentUser.role !== 'admin') router.push('/unauthorized');
  }, [currentUser, router]);

  async function load() {
    setLoading(true);
    try {
      const [u, inv, logs, rst] = await Promise.all([
        api<AdminUser[]>('/v1/admin/users'),
        api<Invite[]>('/v1/admin/invites'),
        api<AuditLog[]>('/v1/admin/audit-logs'),
        api<PasswordReset[]>('/v1/admin/password-resets'),
      ]);
      setUsers(u); setInvites(inv); setAuditLogs(logs); setResets(rst);
    } catch { router.push('/unauthorized'); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (currentUser?.role === 'admin') void load(); }, [currentUser]);

  async function handleSaveUser(patch: Partial<AdminUser>) {
    if (!editUser) return;
    await api('/v1/admin/users/update', undefined, {
      method: 'PATCH',
      body: JSON.stringify({ userId: editUser.id, ...patch }),
    });
    await load();
  }

  async function createInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const inv = await api<Invite>('/v1/admin/invites', undefined, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, expiresInHours: 48 }),
      });
      setLatestInvite(inv);
      setInviteEmail('');
      await load();
    } finally { setInviting(false); }
  }

  async function revokeInvite(id: string) {
    await api(`/v1/admin/invites/${id}`, undefined, { method: 'DELETE' });
    await load();
  }

  async function revokeReset(id: string) {
    await api(`/v1/admin/password-resets/${id}`, undefined, { method: 'DELETE' });
    await load();
  }

  const usersPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const invitesPages = Math.max(1, Math.ceil(invites.length / PAGE_SIZE));
  const resetsPages = Math.max(1, Math.ceil(resets.length / PAGE_SIZE));
  const auditPages = Math.max(1, Math.ceil(auditLogs.length / PAGE_SIZE));

  const userRows = users.slice((usersPage - 1) * PAGE_SIZE, usersPage * PAGE_SIZE);
  const inviteRows = invites.slice((invitesPage - 1) * PAGE_SIZE, invitesPage * PAGE_SIZE);
  const resetRows = resets.slice((resetsPage - 1) * PAGE_SIZE, resetsPage * PAGE_SIZE);
  const auditRows = auditLogs.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE);

  return (
    <AppFrame title="Admin" subtitle="System management, user access, and audit logs.">
      {loading ? <LoadingState label="Loading admin data…" /> : (
        <div className="space-y-5">
          <SystemHealthWidget />
          <SystemStatsWidget />

          {/* ── Users ─────────────────────────────────────────────────────── */}
          <Card>
            <SectionHeader icon={Users} title="Users" count={users.length} />
            <div className="space-y-2">
              {userRows.length === 0 && (
                <p className="text-sm text-text-secondary text-center py-6">No users found.</p>
              )}
              {userRows.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-elevated border border-border hover:border-accent/30 transition-colors">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center shrink-0 text-xs font-semibold text-accent uppercase">
                    {u.email[0]}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{u.email}</p>
                    <p className="text-xs text-text-secondary">Joined <RelativeTime iso={u.createdAt} /></p>
                  </div>
                  {/* Badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${u.role === 'admin' ? 'text-accent bg-accent/10 border-accent/30' : 'text-text-secondary bg-surface border-border'}`}>
                      {u.role === 'admin' ? '🛡 Admin' : '👤 User'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${u.isActive !== false ? 'text-success bg-success/10 border-success/30' : 'text-danger bg-danger/10 border-danger/30'}`}>
                      {u.isActive !== false ? 'Active' : 'Disabled'}
                    </span>
                    <button
                      onClick={() => setEditUser(u)}
                      className="p-1.5 rounded-lg text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
                      title="Edit user"
                    >
                      <UserCog className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={usersPage} pages={usersPages} onPage={setUsersPage} />
          </Card>

          {/* ── Invite user ───────────────────────────────────────────────── */}
          <Card>
            <SectionHeader icon={Mail} title="Invite User" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="new.user@company.com"
                  className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Role</label>
                <div className="flex gap-2 pt-0.5">
                  {(['user', 'admin'] as const).map((r) => {
                    const isSelected = inviteRole === r;
                    const isAdmin = r === 'admin';
                    return (
                      <button
                        key={r}
                        onClick={() => setInviteRole(r)}
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
              onClick={createInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {inviting ? 'Creating…' : 'Create invite link'}
            </button>

            {latestInvite && (
              <div className="mt-4 p-4 rounded-xl bg-success/5 border border-success/20">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="w-4 h-4 text-success" />
                  <p className="text-sm font-medium text-success">Invite link created</p>
                </div>
                <p className="text-xs text-text-secondary break-all mb-3">{latestInvite.inviteUrl ?? '—'}</p>
                <div className="flex gap-2">
                  <CopyBtn value={latestInvite.inviteUrl ?? ''} />
                  <button onClick={() => setLatestInvite(null)} className="text-xs text-text-secondary hover:text-text-primary transition-colors">Dismiss</button>
                </div>
              </div>
            )}

            {inviteRows.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Active invites</p>
                <div className="space-y-2">
                  {inviteRows.map((inv) => (
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
                        <button onClick={() => revokeInvite(inv.id)} className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors" title="Revoke">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <Pagination page={invitesPage} pages={invitesPages} onPage={setInvitesPage} />
              </div>
            )}
          </Card>

          {/* ── Password Resets ───────────────────────────────────────────── */}
          {resets.length > 0 && (
            <Card>
              <SectionHeader icon={KeyRound} title="Pending Password Resets" count={resets.length} />
              <p className="text-xs text-text-secondary mb-3">Fallback reset links when email delivery isn't configured.</p>
              <div className="space-y-2">
                {resetRows.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-elevated border border-border">
                    <KeyRound className="w-4 h-4 text-warning shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary">{r.email}</p>
                      <p className="text-xs text-text-secondary">Expires {new Date(r.expiresAt).toLocaleDateString()}</p>
                    </div>
                    <CopyBtn value={r.resetUrl} />
                    <button onClick={() => revokeReset(r.id)} className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors" title="Revoke">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Pagination page={resetsPage} pages={resetsPages} onPage={setResetsPage} />
            </Card>
          )}

          {/* ── Audit Log ─────────────────────────────────────────────────── */}
          <Card>
            <SectionHeader icon={ClipboardList} title="Audit Log" count={auditLogs.length} />
            <div className="space-y-1">
              {auditRows.length === 0 && <p className="text-sm text-text-secondary text-center py-6">No audit events yet.</p>}
              {auditRows.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-elevated/60 transition-colors border-b border-border/40 last:border-b-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent/60 shrink-0 mt-0.5" />
                  <p className="flex-1 text-sm font-mono text-text-primary">{l.action}</p>
                  <p className="text-xs text-text-secondary hidden sm:block truncate max-w-[100px]" title={l.actorUserId ?? ''}>{l.actorUserId?.slice(0, 8) ?? 'system'}</p>
                  <RelativeTime iso={l.createdAt} />
                </div>
              ))}
            </div>
            <Pagination page={auditPage} pages={auditPages} onPage={setAuditPage} />
          </Card>
        </div>
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          currentUserId={currentUser?.id ?? ''}
          onClose={() => setEditUser(null)}
          onSave={handleSaveUser}
        />
      )}
    </AppFrame>
  );
}
