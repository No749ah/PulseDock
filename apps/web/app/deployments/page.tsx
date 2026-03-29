'use client';

import { useEffect, useState } from 'react';
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
  Activity,
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

const STATUS_CONFIG: Record<
  DeploymentStatus,
  { icon: React.ReactNode; color: string; label: string }
> = {
  STARTED: { icon: <Rocket className="h-4 w-4" />, color: 'text-blue-400', label: 'Started' },
  SUCCESS: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-green-400',
    label: 'Success',
  },
  FAILED: { icon: <XCircle className="h-4 w-4" />, color: 'text-red-400', label: 'Failed' },
  ROLLBACK: {
    icon: <RotateCcw className="h-4 w-4" />,
    color: 'text-yellow-400',
    label: 'Rollback',
  },
};

export default function DeploymentsPage() {
  const router = useRouter();
  const { error: showError, success: showSuccess } = useToast();
  const [events, setEvents] = useState<DeploymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [envFilter, setEnvFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [token, setToken] = useState<string>('');
  const [deployToken, setDeployToken] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<{
    total: number;
    successRate: number | null;
    byStatus: Record<string, number>;
    topServices: Array<{ service: string; count: number }>;
    environments: string[];
  } | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setToken(user.id);
    loadEvents(user.id);
    api<typeof summary>('/v1/deployments/summary?days=30')
      .then(setSummary)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadEvents(_tok?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: '30' });
      if (envFilter !== 'all') params.set('environment', envFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const data = await api<DeploymentEvent[]>(`/v1/deployments?${params}`);
      setEvents(data ?? []);
    } catch {
      showError('Failed to load deployment events');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateToken() {
    try {
      const data = await api<{ token: string }>(
        '/v1/deployments/token/generate',
        undefined,
        { method: 'POST' },
      );
      if (data?.token) {
        setDeployToken(data.token);
        showSuccess('Deploy token generated');
      }
    } catch {
      showError('Failed to generate token');
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const grouped = events.reduce<Record<string, DeploymentEvent[]>>((acc, ev) => {
    const date = new Date(ev.createdAt).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    (acc[date] = acc[date] ?? []).push(ev);
    return acc;
  }, {});

  const envs = ['all', 'production', 'staging', 'dev'];
  const statuses: string[] = ['all', 'STARTED', 'SUCCESS', 'FAILED', 'ROLLBACK'];

  return (
    <AppFrame title="Deployment Events">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Rocket className="h-6 w-6 text-blue-400" />
              Deployment Events
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              Track CI/CD deployments and correlate with monitor behavior
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleGenerateToken}>
              <Copy className="h-4 w-4 mr-1" />
              CI Token
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
            <p className="text-sm font-medium text-blue-300 mb-2">
              Your Deploy Token (copy now, won&apos;t be shown again):
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-white bg-gray-900 px-3 py-2 rounded border border-gray-700 truncate">
                {deployToken}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(deployToken);
                  showSuccess('Copied!');
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Use as{' '}
              <code className="text-blue-300">X-Deploy-Token</code> header when POSTing to{' '}
              <code className="text-blue-300">/v1/public/deployments/receive</code>
            </p>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-xs text-gray-400 mr-1">Env:</span>
          {envs.map((e) => (
            <button
              key={e}
              onClick={() => {
                setEnvFilter(e);
                loadEvents(token);
              }}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                envFilter === e
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {e === 'all' ? 'All' : e}
            </button>
          ))}
          <span className="text-xs text-gray-400 ml-3 mr-1">Status:</span>
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                loadEvents(token);
              }}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
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
            <Button className="mt-4" size="sm" onClick={handleGenerateToken}>
              <Plus className="h-4 w-4 mr-1" />
              Generate CI Token
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {date}
                </h3>
                <div className="space-y-2">
                  {items.map((ev) => {
                    const cfg = STATUS_CONFIG[ev.status];
                    const isExpanded = expanded.has(ev.id);
                    return (
                      <Card key={ev.id} className="p-0 overflow-hidden">
                        <button
                          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
                          onClick={() => toggleExpand(ev.id)}
                        >
                          <span className={cfg.color}>{cfg.icon}</span>
                          <span className="font-medium text-white text-sm">{ev.service}</span>
                          {ev.version && (
                            <Badge variant="default" className="text-xs">
                              {ev.version}
                            </Badge>
                          )}
                          <Badge
                            variant="default"
                            className={`text-xs ${
                              ev.environment === 'production'
                                ? 'bg-purple-900/40 text-purple-300'
                                : 'bg-gray-700 text-gray-300'
                            }`}
                          >
                            {ev.environment}
                          </Badge>
                          <Badge
                            variant="default"
                            className={`text-xs ${cfg.color} bg-transparent border border-current`}
                          >
                            {cfg.label}
                          </Badge>
                          {ev.deployedBy && (
                            <span className="text-gray-400 text-xs">by {ev.deployedBy}</span>
                          )}
                          {ev.commitSha && (
                            <code className="text-xs text-gray-500 font-mono">
                              {ev.commitSha.slice(0, 7)}
                            </code>
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
                          <div className="px-4 pb-3 border-t border-gray-800 pt-3 space-y-2">
                            {ev.commitMessage && (
                              <p className="text-sm text-gray-300">&quot;{ev.commitMessage}&quot;</p>
                            )}
                            {ev.branch && (
                              <p className="text-xs text-gray-500">
                                Branch:{' '}
                                <code className="text-blue-300">{ev.branch}</code>
                              </p>
                            )}
                            {ev.notes && (
                              <p className="text-sm text-gray-400">{ev.notes}</p>
                            )}
                            {ev.sourceUrl && (
                              <a
                                href={ev.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline"
                              >
                                View CI pipeline →
                              </a>
                            )}
                            {ev.monitorIds.length > 0 && (
                              <p className="text-xs text-gray-500">
                                {ev.monitorIds.length} monitor(s) annotated
                              </p>
                            )}
                            {ev.suppressAlerts && (
                              <p className="text-xs text-yellow-400">
                                ⚡ Alert suppression active during this deployment
                              </p>
                            )}
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
      </div>
    </AppFrame>
  );
}
