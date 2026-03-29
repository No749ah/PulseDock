'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Rocket,
  Plus,
  Copy,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  Filter,
  TrendingUp,
  TrendingDown,
  Activity,
  Minus,
  BarChart2,
  ExternalLink,
  Trash2,
  Edit2,
  GitBranch,
  GitCommit,
  User,
  Shield,
  X,
} from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui/toast';

type DeploymentStatus = 'STARTED' | 'SUCCESS' | 'FAILED' | 'ROLLBACK';

interface DeploymentEvent {
  id: string;
  service: string;
  environment: string;
  version: string | null;
  status: DeploymentStatus;
  deployedBy: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  branch: string | null;
  sourceUrl: string | null;
  notes: string | null;
  durationMs: number | null;
  monitorIds: string[];
  suppressAlerts: boolean;
  createdAt: string;
}

interface MonitorImpact {
  deploymentId: string;
  deployedAt: string;
  service: string;
  version: string | null;
  before: number | null;
  after: number | null;
  deltaMs: number | null;
  deltaPct: number | null;
  checksBefore: number;
  checksAfter: number;
}

interface Monitor {
  id: string;
  name: string;
  type: string;
}

const STATUS_CONFIG: Record<
  DeploymentStatus,
  { icon: React.ReactNode; color: string; bg: string; label: string }
> = {
  STARTED: { icon: <Rocket className="h-4 w-4" />, color: 'text-blue-400', bg: 'bg-blue-900/30 border-blue-600/30', label: 'Started' },
  SUCCESS: { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-green-400', bg: 'bg-green-900/30 border-green-600/30', label: 'Success' },
  FAILED: { icon: <XCircle className="h-4 w-4" />, color: 'text-red-400', bg: 'bg-red-900/30 border-red-600/30', label: 'Failed' },
  ROLLBACK: { icon: <RotateCcw className="h-4 w-4" />, color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-600/30', label: 'Rollback' },
};

const ENV_COLORS: Record<string, string> = {
  production: 'bg-purple-900/40 text-purple-300 border-purple-700/50',
  staging: 'bg-orange-900/40 text-orange-300 border-orange-700/50',
  dev: 'bg-gray-700/60 text-gray-300 border-gray-600/50',
  development: 'bg-gray-700/60 text-gray-300 border-gray-600/50',
};

function envClass(env: string): string {
  return ENV_COLORS[env.toLowerCase()] ?? 'bg-gray-700/60 text-gray-300 border-gray-600/50';
}

export default function DeploymentsPage() {
  const router = useRouter();
  const { error: showError, success: showSuccess } = useToast();
  const [events, setEvents] = useState<DeploymentEvent[]>([]);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [envFilter, setEnvFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [token, setToken] = useState<string>('');
  const [deployToken, setDeployToken] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [impact, setImpact] = useState<Record<string, MonitorImpact[]>>({});
  const [impactLoading, setImpactLoading] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<{
    total: number;
    successRate: number | null;
    byStatus: Record<string, number>;
    topServices: Array<{ service: string; count: number }>;
    environments: string[];
  } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    service: '',
    environment: 'production',
    version: '',
    status: 'SUCCESS' as DeploymentStatus,
    deployedBy: '',
    commitSha: '',
    commitMessage: '',
    branch: '',
    sourceUrl: '',
    notes: '',
    durationMs: '',
    suppressAlerts: false,
    selectedMonitors: [] as string[],
  });
  const [creating, setCreating] = useState(false);

  const loadEvents = useCallback(async (tok?: string, env?: string, stat?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: '30' });
      const envVal = env ?? envFilter;
      const statVal = stat ?? statusFilter;
      if (envVal !== 'all') params.set('environment', envVal);
      if (statVal !== 'all') params.set('status', statVal);
      const data = await api<DeploymentEvent[]>(`/v1/deployments?${params}`, tok ?? token);
      setEvents(data ?? []);
    } catch {
      showError('Failed to load deployment events');
    } finally {
      setLoading(false);
    }
  }, [envFilter, statusFilter, token, showError]);

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setToken(user.id);
    loadEvents(user.id, 'all', 'all');
    api<typeof summary>('/v1/deployments/summary?days=30', user.id).then(setSummary).catch(() => {});
    api<Monitor[]>('/v1/monitors', user.id).then((d) => setMonitors(d ?? [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleGenerateToken() {
    try {
      const data = await api<{ token: string }>('/v1/deployments/token/generate', token, { method: 'POST' });
      if (data?.token) {
        setDeployToken(data.token);
        showSuccess('Deploy token generated');
      }
    } catch {
      showError('Failed to generate token');
    }
  }

  async function handleCreate() {
    if (!createForm.service.trim()) { showError('Service name required'); return; }
    setCreating(true);
    try {
      await api('/v1/deployments', token, {
        method: 'POST',
        body: JSON.stringify({
          service: createForm.service,
          environment: createForm.environment,
          version: createForm.version || undefined,
          status: createForm.status,
          deployedBy: createForm.deployedBy || undefined,
          commitSha: createForm.commitSha || undefined,
          commitMessage: createForm.commitMessage || undefined,
          branch: createForm.branch || undefined,
          sourceUrl: createForm.sourceUrl || undefined,
          notes: createForm.notes || undefined,
          durationMs: createForm.durationMs ? parseInt(createForm.durationMs) * 1000 : undefined,
          suppressAlerts: createForm.suppressAlerts,
          monitorIds: createForm.selectedMonitors,
        }),
      });
      showSuccess('Deployment event recorded');
      setShowCreateModal(false);
      setCreateForm({
        service: '', environment: 'production', version: '', status: 'SUCCESS',
        deployedBy: '', commitSha: '', commitMessage: '', branch: '',
        sourceUrl: '', notes: '', durationMs: '', suppressAlerts: false, selectedMonitors: [],
      });
      await loadEvents(token, envFilter, statusFilter);
      api<typeof summary>('/v1/deployments/summary?days=30', token).then(setSummary).catch(() => {});
    } catch {
      showError('Failed to create deployment event');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api(`/v1/deployments/${id}`, token, { method: 'DELETE' });
      showSuccess('Deleted');
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch {
      showError('Failed to delete');
    }
  }

  async function toggleExpand(ev: DeploymentEvent) {
    const id = ev.id;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      next.add(id);
      return next;
    });

    // Load monitor impact if not already loaded and has linked monitors
    if (!impact[id] && ev.monitorIds.length > 0 && !impactLoading.has(id)) {
      setImpactLoading((prev) => new Set(prev).add(id));
      try {
        const impacts = await Promise.allSettled(
          ev.monitorIds.slice(0, 5).map((mid) =>
            api<MonitorImpact>(`/v1/deployments/${id}/monitor-impact/${mid}`, token)
          )
        );
        const results = impacts
          .filter((r): r is PromiseFulfilledResult<MonitorImpact> => r.status === 'fulfilled' && r.value != null)
          .map((r) => r.value);
        setImpact((prev) => ({ ...prev, [id]: results }));
      } finally {
        setImpactLoading((prev) => { const s = new Set(prev); s.delete(id); return s; });
      }
    }
  }

  const grouped = events.reduce<Record<string, DeploymentEvent[]>>((acc, ev) => {
    const date = new Date(ev.createdAt).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
    (acc[date] = acc[date] ?? []).push(ev);
    return acc;
  }, {});

  const envs = ['all', 'production', 'staging', 'dev'];
  const statuses: string[] = ['all', 'STARTED', 'SUCCESS', 'FAILED', 'ROLLBACK'];

  function getMonitorName(id: string) {
    return monitors.find((m) => m.id === id)?.name ?? id.slice(0, 8);
  }

  return (
    <AppFrame title="Deployment Events">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Rocket className="h-6 w-6 text-blue-400" />
              Deployment Events
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              Track CI/CD deployments and correlate with monitor behavior
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={handleGenerateToken}>
              <Copy className="h-4 w-4 mr-1" />
              CI Token
            </Button>
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Record Deployment
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        {summary && summary.total > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                <Activity className="h-3 w-3" /> Total (30d)
              </div>
              <p className="text-2xl font-bold text-white">{summary.total}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                <TrendingUp className="h-3 w-3" /> Success Rate
              </div>
              <p className={`text-2xl font-bold ${
                summary.successRate !== null && summary.successRate >= 80 ? 'text-green-400' :
                summary.successRate !== null && summary.successRate >= 50 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {summary.successRate !== null ? `${summary.successRate}%` : '—'}
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                <XCircle className="h-3 w-3" /> Failed
              </div>
              <p className="text-2xl font-bold text-red-400">{summary.byStatus.FAILED ?? 0}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                <RotateCcw className="h-3 w-3" /> Rollbacks
              </div>
              <p className="text-2xl font-bold text-yellow-400">{summary.byStatus.ROLLBACK ?? 0}</p>
            </Card>
          </div>
        )}

        {/* Token display */}
        {deployToken && (
          <Card className="border border-blue-500/30 bg-blue-900/20 p-4">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-blue-300 mb-2">
                Your Deploy Token (copy now — won&apos;t be shown again):
              </p>
              <button onClick={() => setDeployToken(null)} className="text-gray-500 hover:text-gray-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-white bg-gray-900 px-3 py-2 rounded border border-gray-700 truncate">
                {deployToken}
              </code>
              <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(deployToken); showSuccess('Copied!'); }}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Use as <code className="text-blue-300">X-Deploy-Token</code> header when POSTing to{' '}
              <code className="text-blue-300">/v1/public/deployments/receive</code>
            </p>
            <div className="mt-3 bg-gray-900/50 rounded p-3">
              <p className="text-xs text-gray-500 mb-1 font-mono">Example curl:</p>
              <code className="text-xs text-green-300 font-mono break-all">
                {`curl -X POST https://your-api/v1/public/deployments/receive \\`}<br/>
                {`  -H "X-Deploy-Token: ${deployToken}" \\`}<br/>
                {`  -H "Content-Type: application/json" \\`}<br/>
                {`  -d '{"service":"api","environment":"production","status":"SUCCESS","version":"v1.2.3"}'`}
              </code>
            </div>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-xs text-gray-400 mr-1">Env:</span>
          {envs.map((e) => (
            <button
              key={e}
              onClick={() => { setEnvFilter(e); loadEvents(token, e, statusFilter); }}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                envFilter === e ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {e === 'all' ? 'All' : e}
            </button>
          ))}
          <span className="text-xs text-gray-400 ml-3 mr-1">Status:</span>
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); loadEvents(token, envFilter, s); }}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="text-gray-400 text-sm py-8 text-center">Loading deployment events…</div>
        ) : Object.keys(grouped).length === 0 ? (
          <Card className="p-12 text-center">
            <Rocket className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No deployment events yet</p>
            <p className="text-gray-500 text-sm mt-1">
              Record deployments manually or integrate with your CI/CD pipeline
            </p>
            <div className="flex gap-3 justify-center mt-4">
              <Button size="sm" variant="secondary" onClick={handleGenerateToken}>
                <Copy className="h-4 w-4 mr-1" />
                Generate CI Token
              </Button>
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Record Manually
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{date}</h3>
                <div className="space-y-2">
                  {items.map((ev) => {
                    const cfg = STATUS_CONFIG[ev.status];
                    const isExpanded = expanded.has(ev.id);
                    const evImpact = impact[ev.id] ?? [];
                    const isImpactLoading = impactLoading.has(ev.id);
                    return (
                      <Card key={ev.id} className={`p-0 overflow-hidden border ${cfg.bg}`}>
                        <button
                          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors flex-wrap"
                          onClick={() => toggleExpand(ev)}
                        >
                          <span className={cfg.color}>{cfg.icon}</span>
                          <span className="font-semibold text-white text-sm">{ev.service}</span>
                          {ev.version && (
                            <Badge variant="default" className="text-xs font-mono">{ev.version}</Badge>
                          )}
                          <Badge variant="default" className={`text-xs border ${envClass(ev.environment)}`}>
                            {ev.environment}
                          </Badge>
                          <Badge variant="default" className={`text-xs ${cfg.color} bg-transparent border border-current`}>
                            {cfg.label}
                          </Badge>
                          {ev.deployedBy && (
                            <span className="text-gray-400 text-xs flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {ev.deployedBy}
                            </span>
                          )}
                          {ev.commitSha && (
                            <code className="text-xs text-gray-500 font-mono">{ev.commitSha.slice(0, 7)}</code>
                          )}
                          {ev.monitorIds.length > 0 && (
                            <span className="text-xs text-blue-400 flex items-center gap-1">
                              <BarChart2 className="h-3 w-3" />
                              {ev.monitorIds.length} monitor{ev.monitorIds.length > 1 ? 's' : ''}
                            </span>
                          )}
                          <span className="ml-auto text-gray-500 text-xs">
                            {new Date(ev.createdAt).toLocaleTimeString()}
                          </span>
                          {ev.durationMs && (
                            <span className="text-gray-500 text-xs flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {Math.round(ev.durationMs / 1000)}s
                            </span>
                          )}
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-gray-800/60 pt-3 space-y-3">
                            {/* Metadata row */}
                            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                              {ev.commitMessage && (
                                <div className="flex items-start gap-2 text-gray-300">
                                  <GitCommit className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
                                  <span>&quot;{ev.commitMessage}&quot;</span>
                                </div>
                              )}
                              {ev.branch && (
                                <div className="flex items-center gap-2 text-gray-400 text-xs">
                                  <GitBranch className="h-3 w-3" />
                                  <code className="text-blue-300">{ev.branch}</code>
                                </div>
                              )}
                              {ev.sourceUrl && (
                                <a href={ev.sourceUrl} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                                  <ExternalLink className="h-3 w-3" />
                                  View CI pipeline
                                </a>
                              )}
                              {ev.suppressAlerts && (
                                <div className="flex items-center gap-1 text-xs text-yellow-400">
                                  <Shield className="h-3 w-3" />
                                  Alert suppression active
                                </div>
                              )}
                              {ev.notes && (
                                <p className="text-sm text-gray-400 w-full">{ev.notes}</p>
                              )}
                            </div>

                            {/* Monitor impact analysis */}
                            {ev.monitorIds.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                  <BarChart2 className="h-3 w-3" />
                                  Monitor Impact (±30 min)
                                </p>
                                {isImpactLoading ? (
                                  <p className="text-xs text-gray-500">Analyzing impact…</p>
                                ) : evImpact.length === 0 ? (
                                  <p className="text-xs text-gray-500">No monitor run data around this deployment.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {evImpact.map((imp) => {
                                      const improved = imp.deltaMs !== null && imp.deltaMs < 0;
                                      const degraded = imp.deltaMs !== null && imp.deltaMs > 20;
                                      return (
                                        <div key={imp.deploymentId + (imp.before ?? 'x')} className="flex items-center gap-3 bg-gray-900/40 rounded px-3 py-2 text-xs">
                                          <span className="text-gray-300 font-medium truncate max-w-[140px]">
                                            {getMonitorName(ev.monitorIds[evImpact.indexOf(imp)] ?? '')}
                                          </span>
                                          <div className="flex items-center gap-2 text-gray-400">
                                            <span>{imp.before != null ? `${imp.before}ms` : '—'}</span>
                                            <span className="text-gray-600">→</span>
                                            <span>{imp.after != null ? `${imp.after}ms` : '—'}</span>
                                          </div>
                                          {imp.deltaMs !== null && (
                                            <span className={`ml-auto flex items-center gap-1 font-medium ${
                                              improved ? 'text-green-400' : degraded ? 'text-red-400' : 'text-gray-400'
                                            }`}>
                                              {improved ? <TrendingDown className="h-3 w-3" /> :
                                               degraded ? <TrendingUp className="h-3 w-3" /> :
                                               <Minus className="h-3 w-3" />}
                                              {imp.deltaPct !== null ? `${imp.deltaPct > 0 ? '+' : ''}${imp.deltaPct}%` : `${imp.deltaMs > 0 ? '+' : ''}${imp.deltaMs}ms`}
                                            </span>
                                          )}
                                          <span className="text-gray-600 text-xs">
                                            ({imp.checksBefore}→{imp.checksAfter} checks)
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 pt-1">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleDelete(ev.id)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Deployment Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-blue-400" />
                  Record Deployment Event
                </h2>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Service + Environment */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Service <span className="text-red-400">*</span></label>
                    <input
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                      placeholder="api-gateway"
                      value={createForm.service}
                      onChange={(e) => setCreateForm((f) => ({ ...f, service: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Environment</label>
                    <select
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                      value={createForm.environment}
                      onChange={(e) => setCreateForm((f) => ({ ...f, environment: e.target.value }))}
                    >
                      <option value="production">production</option>
                      <option value="staging">staging</option>
                      <option value="dev">dev</option>
                    </select>
                  </div>
                </div>

                {/* Status + Version */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Status</label>
                    <select
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                      value={createForm.status}
                      onChange={(e) => setCreateForm((f) => ({ ...f, status: e.target.value as DeploymentStatus }))}
                    >
                      <option value="SUCCESS">Success</option>
                      <option value="STARTED">Started</option>
                      <option value="FAILED">Failed</option>
                      <option value="ROLLBACK">Rollback</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Version</label>
                    <input
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                      placeholder="v1.2.3"
                      value={createForm.version}
                      onChange={(e) => setCreateForm((f) => ({ ...f, version: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Deployed By + Duration */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Deployed By</label>
                    <input
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                      placeholder="john@company.com"
                      value={createForm.deployedBy}
                      onChange={(e) => setCreateForm((f) => ({ ...f, deployedBy: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Duration (seconds)</label>
                    <input
                      type="number"
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                      placeholder="120"
                      value={createForm.durationMs}
                      onChange={(e) => setCreateForm((f) => ({ ...f, durationMs: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Commit SHA + Branch */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                      <GitCommit className="h-3 w-3" /> Commit SHA
                    </label>
                    <input
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-white focus:border-blue-500 outline-none"
                      placeholder="abc1234"
                      value={createForm.commitSha}
                      onChange={(e) => setCreateForm((f) => ({ ...f, commitSha: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                      <GitBranch className="h-3 w-3" /> Branch
                    </label>
                    <input
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                      placeholder="main"
                      value={createForm.branch}
                      onChange={(e) => setCreateForm((f) => ({ ...f, branch: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Commit message */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Commit Message</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                    placeholder="feat: add new payment provider"
                    value={createForm.commitMessage}
                    onChange={(e) => setCreateForm((f) => ({ ...f, commitMessage: e.target.value }))}
                  />
                </div>

                {/* Source URL */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> CI Pipeline URL
                  </label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                    placeholder="https://github.com/org/repo/actions/runs/123"
                    value={createForm.sourceUrl}
                    onChange={(e) => setCreateForm((f) => ({ ...f, sourceUrl: e.target.value }))}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Notes</label>
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none resize-none"
                    rows={2}
                    placeholder="Any relevant notes about this deployment"
                    value={createForm.notes}
                    onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                {/* Monitor linking */}
                {monitors.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                      <BarChart2 className="h-3 w-3" /> Link Monitors (optional — enables impact analysis)
                    </label>
                    <div className="max-h-32 overflow-y-auto space-y-1 bg-gray-900/50 rounded p-2">
                      {monitors.slice(0, 20).map((m) => (
                        <label key={m.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-800 px-2 py-1 rounded">
                          <input
                            type="checkbox"
                            checked={createForm.selectedMonitors.includes(m.id)}
                            onChange={(e) => setCreateForm((f) => ({
                              ...f,
                              selectedMonitors: e.target.checked
                                ? [...f.selectedMonitors, m.id]
                                : f.selectedMonitors.filter((id) => id !== m.id),
                            }))}
                            className="rounded"
                          />
                          <span className="text-xs text-gray-300">{m.name}</span>
                          <Badge variant="default" className="text-xs ml-auto">{m.type}</Badge>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suppress Alerts */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForm.suppressAlerts}
                    onChange={(e) => setCreateForm((f) => ({ ...f, suppressAlerts: e.target.checked }))}
                    className="rounded"
                  />
                  <div>
                    <span className="text-sm text-gray-200 flex items-center gap-1">
                      <Shield className="h-4 w-4 text-yellow-400" />
                      Suppress Alerts During Deployment
                    </span>
                    <p className="text-xs text-gray-500">Mutes alerts for linked monitors during this event</p>
                  </div>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setShowCreateModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating || !createForm.service.trim()}
                  className="flex-1"
                >
                  {creating ? 'Recording…' : 'Record Deployment'}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppFrame>
  );
}
