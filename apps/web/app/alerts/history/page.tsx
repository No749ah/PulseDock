'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, CheckCircle2, XCircle, Clock, ChevronRight, Search, Download } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/Table';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

interface GlobalDeliveryEntry {
  id: string;
  channelId: string;
  channelName: string;
  channelType: string;
  status: 'success' | 'failed';
  trigger: string | null;
  monitorId: string | null;
  monitorName: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface GlobalDeliveryHistory {
  total: number;
  successCount: number;
  failedCount: number;
  deliveries: GlobalDeliveryEntry[];
}

type StatusFilter = 'all' | 'success' | 'failed';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function channelTypeBadgeClass(type: string): string {
  switch (type) {
    case 'discord': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    case 'slack': return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'telegram': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    case 'webhook': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    case 'email': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'pagerduty': return 'bg-green-600/10 text-green-500 border-green-600/20';
    case 'opsgenie': return 'bg-orange-600/10 text-orange-500 border-orange-600/20';
    case 'sms': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'teams': return 'bg-blue-600/10 text-blue-400 border-blue-600/20';
    case 'ntfy': return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
    case 'gotify': return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
    case 'matrix': return 'bg-pink-500/10 text-pink-400 border-pink-500/20';
    default: return 'bg-surface-elevated text-text-secondary border-border';
  }
}

export default function AlertHistoryPage() {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [history, setHistory] = useState<GlobalDeliveryHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const user = getUser();
    if (!user) router.push('/login');
  }, [router]);

  useEffect(() => {
    setLoading(true);
    api<GlobalDeliveryHistory>('/v1/alert-channels/deliveries')
      .then(setHistory)
      .catch((e: unknown) => {
        toastError(e instanceof Error ? e.message : 'Failed to load delivery history');
        router.push('/login');
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!history) return [];
    return history.deliveries.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          (d.monitorName?.toLowerCase().includes(q) ?? false) ||
          d.channelName.toLowerCase().includes(q) ||
          d.channelType.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [history, statusFilter, search]);

  const successRate = history && history.total > 0
    ? Math.round((history.successCount / history.total) * 100)
    : null;

  return (
    <AppFrame
      title="Alert History"
      subtitle="Global delivery log across all alert channels."
      breadcrumbs={[
        { label: 'Alerts', href: '/alerts' },
        { label: 'History' },
      ]}
    >
      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 text-sm text-text-secondary mb-1">
                <Link href="/alerts" className="hover:text-text-primary transition-colors">Alerts</Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-text-primary">History</span>
              </div>
              <h2 className="text-2xl font-bold text-text-primary">Delivery History</h2>
            </div>
            <div className="flex items-center gap-2">
              {history && history.total > 0 && (
                <button
                  onClick={() => {
                    const token = localStorage.getItem('auth_token') ?? '';
                    fetch('/api/v1/alert-channels/deliveries/export?days=90', { headers: { Authorization: `Bearer ${token}` } })
                      .then(r => r.blob())
                      .then(blob => {
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = `alert-deliveries-${new Date().toISOString().slice(0, 10)}.csv`;
                        a.click();
                      })
                      .catch(() => {});
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface-1 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              )}
              <Link href="/alerts">
                <Button variant="secondary">← Back to Alerts</Button>
              </Link>
            </div>
          </div>

          {/* Stats */}
          {history && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <Card className="p-4 text-center">
                <p className="text-3xl font-bold text-text-primary">{history.total}</p>
                <p className="text-xs text-text-secondary mt-1">Total</p>
              </Card>
              <Card className="p-4 text-center bg-success/5 border-success/20">
                <p className="text-3xl font-bold text-success">{history.successCount}</p>
                <p className="text-xs text-text-secondary mt-1">Success</p>
              </Card>
              <Card className="p-4 text-center bg-danger/5 border-danger/20">
                <p className="text-3xl font-bold text-danger">{history.failedCount}</p>
                <p className="text-xs text-text-secondary mt-1">Failed</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-3xl font-bold text-text-primary">
                  {successRate !== null ? `${successRate}%` : '—'}
                </p>
                <p className="text-xs text-text-secondary mt-1">Success Rate</p>
              </Card>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex gap-1 bg-surface-elevated rounded-lg p-1 border border-border">
              {(['all', 'success', 'failed'] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                    statusFilter === f
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
              <input
                className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="Search by monitor or channel…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <Activity className="w-10 h-10 text-text-secondary opacity-40" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No deliveries found</p>
              <p className="text-text-secondary text-sm">
                {history?.total === 0
                  ? 'Delivery logs appear here once alerts are sent.'
                  : 'Try adjusting your filters.'}
              </p>
            </Card>
          ) : (
            <Card className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <tr className="bg-surface-elevated border-b border-border">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Channel</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Monitor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Trigger</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Time</th>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {filtered.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <span className="font-medium text-text-primary">{d.channelName}</span>
                          {d.errorMessage && (
                            <p className="text-xs text-danger mt-0.5 font-mono truncate max-w-[200px]" title={d.errorMessage}>
                              {d.errorMessage}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize border ${channelTypeBadgeClass(d.channelType)}`}>
                            {d.channelType}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-text-secondary">
                            {d.monitorName ?? <span className="opacity-40">—</span>}
                          </span>
                        </TableCell>
                        <TableCell>
                          {d.trigger ? (
                            <span className="text-xs text-text-secondary bg-surface-elevated px-2 py-0.5 rounded">
                              {d.trigger.replace(/_/g, ' ')}
                            </span>
                          ) : (
                            <span className="text-text-secondary opacity-40">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {d.status === 'success' ? (
                            <span className="flex items-center gap-1.5 text-success text-xs font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> success
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-danger text-xs font-semibold">
                              <XCircle className="w-3.5 h-3.5" /> failed
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {d.durationMs != null ? (
                            <span className="flex items-center gap-1 text-xs text-text-secondary">
                              <Clock className="w-3 h-3" />{d.durationMs}ms
                            </span>
                          ) : (
                            <span className="text-text-secondary opacity-40">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-text-secondary" title={new Date(d.createdAt).toLocaleString()}>
                            {relativeTime(d.createdAt)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="px-4 py-3 border-t border-border text-xs text-text-secondary">
                Showing {filtered.length} of {history?.total ?? 0} entries (last 200)
              </div>
            </Card>
          )}
        </>
      )}
    </AppFrame>
  );
}
