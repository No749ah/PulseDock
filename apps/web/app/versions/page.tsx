'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown, Check, X, Play, GitBranch, Download, Bell, CheckCircle2, ArrowUpCircle, ExternalLink, Eye } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Select } from '../components/Select';
import { VersionDiff, extractVersionsFromMessage } from '../components/VersionDiff';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';

import type { ToolEntry, VersionItem, MonitorDetails, MonitorRun, Summary, AlertChannelFull } from './components/types';
import { stripLeadingV, secondsToHuman, levelBadgeVariant, CHANNEL_TYPE_COLORS, VERSION_NOTIFY_OPTIONS } from './components/utils';
import { CreateVersionModal } from './components/CreateVersionModal';
import { EditVersionModal } from './components/EditVersionModal';

export default function VersionsPage() {
  const router = useRouter();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [monitorDetails, setMonitorDetails] = useState<Record<string, MonitorDetails>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runsByMonitor, setRunsByMonitor] = useState<Record<string, MonitorRun[]>>({});
  const [runsLoadingId, setRunsLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'lastChecked'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  // Column visibility (persisted to localStorage)
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('versions-col-visibility');
      return stored ? JSON.parse(stored) : { name: true, type: true, target: true, current: true, latest: true, status: true, lastChecked: true, interval: true, action: true };
    } catch {
      return { name: true, type: true, target: true, current: true, latest: true, status: true, lastChecked: true, interval: true, action: true };
    }
  });
  const [showColPicker, setShowColPicker] = useState(false);
  const toggleCol = (col: string) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [col]: !prev[col] };
      try { localStorage.setItem('versions-col-visibility', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [createOpen, setCreateOpen] = useState(false);

  // Tool registry (shared with CreateVersionModal)
  const [toolRegistry, setToolRegistry] = useState<{ tools: ToolEntry[]; categories: string[] } | null>(null);

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<VersionItem | null>(null);

  // Alert panel state
  const [alertPanelMonitor, setAlertPanelMonitor] = useState<VersionItem | null>(null);
  const [assignedChannels, setAssignedChannels] = useState<AlertChannelFull[]>([]);
  const [allChannels, setAllChannels] = useState<AlertChannelFull[]>([]);
  const [alertPanelLoading, setAlertPanelLoading] = useState(false);
  const [alertPanelError, setAlertPanelError] = useState('');

  useEffect(() => {
    const user = getUser();
    if (!user) router.push('/login');
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      const [data, monitors] = await Promise.all([
        api<Summary>('/v1/monitors/version-summary'),
        api<MonitorDetails[]>('/v1/monitors'),
      ]);
      setSummary(data);
      const map: Record<string, MonitorDetails> = {};
      for (const m of monitors) map[m.id] = m;
      setMonitorDetails(map);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch(() => router.push('/login')); }, []);

  // ── Alert panel handlers ───────────────────────────────────────────────────
  const openAlertPanel = async (monitor: VersionItem) => {
    setAlertPanelMonitor(monitor);
    setAlertPanelLoading(true);
    setAlertPanelError('');
    const userId = getUser()?.id;
    try {
      const [assigned, all] = await Promise.all([
        api<AlertChannelFull[]>(`/v1/monitors/${monitor.id}/alerts`, userId),
        api<AlertChannelFull[]>('/v1/alert-channels', userId),
      ]);
      setAssignedChannels(assigned);
      setAllChannels(all);
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : 'Failed to load alerts');
    } finally {
      setAlertPanelLoading(false);
    }
  };

  const assignChannel = async (channelId: string) => {
    if (!alertPanelMonitor) return;
    const userId = getUser()?.id;
    try {
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, userId, { method: 'POST' });
      const updated = await api<AlertChannelFull[]>(`/v1/monitors/${alertPanelMonitor.id}/alerts`, userId);
      setAssignedChannels(updated);
      await load();
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : 'Failed to assign channel');
    }
  };

  const unassignChannel = async (channelId: string) => {
    if (!alertPanelMonitor) return;
    const userId = getUser()?.id;
    try {
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, userId, { method: 'DELETE' });
      setAssignedChannels((prev) => prev.filter((c) => c.id !== channelId));
      await load();
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : 'Failed to unassign channel');
    }
  };

  const updateNotifyOn = async (channelId: string, notifyOn: string) => {
    if (!alertPanelMonitor) return;
    const userId = getUser()?.id;
    try {
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, userId, {
        method: 'PATCH',
        body: JSON.stringify({ notifyOn }),
      });
      setAssignedChannels((prev) => prev.map((c) => c.id === channelId ? { ...c, notifyOn } : c));
      await load();
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : 'Failed to update notification setting');
    }
  };

  // Load tool registry once (public endpoint, no auth needed)
  useEffect(() => {
    if (toolRegistry) return;
    fetch('/api/v1/tool-registry')
      .then((r) => r.json())
      .then((d: { tools: ToolEntry[]; categories: string[]; total: number }) => setToolRegistry(d))
      .catch(() => null);
  }, [toolRegistry]);

  async function runNow(monitorId: string) {
    setRunningId(monitorId);
    try {
      await api('/v1/monitors/run', undefined, { method: 'POST', body: JSON.stringify({ monitorId }) });
      await load();
      if (expandedId === monitorId) {
        const runs = await api<MonitorRun[]>(`/v1/monitors/${monitorId}/runs`);
        setRunsByMonitor((prev) => ({ ...prev, [monitorId]: runs }));
      }
    } finally {
      setRunningId(null);
    }
  }

  const [runningAll, setRunningAll] = useState(false);

  async function runAllNow() {
    const ids = summary?.items?.map((i) => i.id) ?? [];
    if (ids.length === 0) return;
    setRunningAll(true);
    try {
      await api('/v1/monitors/bulk', undefined, { method: 'POST', body: JSON.stringify({ ids, action: 'run' }) });
      await new Promise((r) => setTimeout(r, 1500));
      await load();
    } finally {
      setRunningAll(false);
    }
  }

  async function toggleDetails(monitorId: string) {
    if (expandedId === monitorId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(monitorId);
    if (runsByMonitor[monitorId]) return;
    setRunsLoadingId(monitorId);
    try {
      const runs = await api<MonitorRun[]>(`/v1/monitors/${monitorId}/runs`);
      setRunsByMonitor((prev) => ({ ...prev, [monitorId]: runs }));
    } finally {
      setRunsLoadingId(null);
    }
  }

  function openEdit(item: VersionItem) {
    setEditItem(item);
    setEditOpen(true);
  }

  async function removeCheck(id: string) {
    if (!confirm('Version check wirklich löschen?')) return;
    await api(`/v1/monitors/${id}`, undefined, { method: 'DELETE' });
    await load();
  }

  const total = summary?.items.length ?? 0;
  const size = Number(pageSize);
  const pages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pages);

  function handleVersionSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  }

  function statusSortKey(level: 'green' | 'yellow' | 'red') {
    if (level === 'green') return 1;
    if (level === 'yellow') return 2;
    return 0;
  }

  const sortedItems = [...(summary?.items ?? [])].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'name') return dir * a.name.localeCompare(b.name);
    if (sortBy === 'status') return dir * (statusSortKey(a.level) - statusSortKey(b.level));
    if (sortBy === 'lastChecked') {
      const ta = a.checkedAt ? new Date(a.checkedAt).getTime() : 0;
      const tb = b.checkedAt ? new Date(b.checkedAt).getTime() : 0;
      return dir * (ta - tb);
    }
    return 0;
  });

  const visible = sortedItems.slice((safePage - 1) * size, safePage * size);

  function exportCSV() {
    const cols = ['Name', 'Type', 'Target', 'Current Version', 'Latest Message', 'Status', 'Last Checked'];
    const rows = sortedItems.map((item) => [
      item.name,
      item.type,
      item.target,
      item.currentVersion ?? '',
      item.latestMessage ?? '',
      item.level ?? '',
      item.checkedAt ? new Date(item.checkedAt).toISOString() : '',
    ]);
    const csv = [cols, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `version-checks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppFrame title="Version Center" subtitle="Track outdated releases/images and trigger checks on demand." breadcrumbs={[{ label: "Version Center" }]}>
      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Create Modal */}
          <CreateVersionModal
            isOpen={createOpen}
            onClose={() => setCreateOpen(false)}
            onCreated={load}
            toolRegistry={toolRegistry}
          />

          {/* Edit Modal */}
          <EditVersionModal
            isOpen={editOpen}
            onClose={() => { setEditOpen(false); setEditItem(null); }}
            onSaved={load}
            item={editItem}
            monitorDetails={monitorDetails}
          />

          {/* Header */}
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-text-secondary mb-1">
                <span>Dashboard</span>
                <span>/</span>
                <span className="text-text-primary font-medium">Versions</span>
              </div>
              <h2 className="text-2xl font-bold text-text-primary">Version Checks</h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(summary?.items?.length ?? 0) > 0 && (
                <Button variant="secondary" size="sm" loading={runningAll} onClick={runAllNow} title="Run all version checks now">
                  <span className="flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Check All</span>
                  </span>
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => load()} title="Refresh">
                <span className="hidden sm:inline">Refresh</span>
                <span className="sm:hidden">↺</span>
              </Button>
              {sortedItems.length > 0 && (
                <Button variant="secondary" size="sm" onClick={exportCSV} title="Export to CSV">
                  <span className="flex items-center gap-1.5">
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Export CSV</span>
                  </span>
                </Button>
              )}
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <span className="flex items-center gap-1.5">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Create version check</span>
                  <span className="sm:hidden">New</span>
                </span>
              </Button>
            </div>
          </div>

          {/* Summary row */}
          {(summary?.stats.total ?? 0) > 0 && (
            <div className="flex items-center gap-4 mb-6 text-sm flex-wrap">
              <span className="text-text-secondary">
                <span className="font-semibold text-text-primary">{summary?.stats.total ?? 0}</span> monitored
              </span>
              <span className="text-text-secondary opacity-40">·</span>
              <span className="text-text-secondary">
                <span className="font-semibold text-success">{summary?.stats.green ?? 0}</span> up to date
              </span>
              <span className="text-text-secondary opacity-40">·</span>
              <span className="text-text-secondary">
                <span className={`font-semibold ${((summary?.stats.yellow ?? 0) + (summary?.stats.red ?? 0)) > 0 ? 'text-warning' : 'text-text-primary'}`}>
                  {(summary?.stats.yellow ?? 0) + (summary?.stats.red ?? 0)}
                </span> updates available
              </span>
              {(summary?.stats.red ?? 0) > 0 && (
                <>
                  <span className="text-text-secondary opacity-40">·</span>
                  <span className="text-text-secondary">
                    <span className="font-semibold text-danger">{summary?.stats.red ?? 0}</span> critical
                  </span>
                </>
              )}
              {/* Sort by + column picker */}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-text-secondary">Sort by</span>
                <select
                  value={`${sortBy}-${sortDir}`}
                  onChange={(e) => {
                    const [col, dir] = e.target.value.split('-') as [typeof sortBy, typeof sortDir];
                    setSortBy(col);
                    setSortDir(dir);
                    setPage(1);
                  }}
                  className="text-xs px-2 py-1 bg-surface-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="name-asc">Name A→Z</option>
                  <option value="name-desc">Name Z→A</option>
                  <option value="status-asc">Status (updates first)</option>
                  <option value="status-desc">Status (ok first)</option>
                  <option value="lastChecked-desc">Last checked (newest)</option>
                  <option value="lastChecked-asc">Last checked (oldest)</option>
                </select>
                {/* Column visibility toggle */}
                <div className="relative">
                  <button
                    onClick={() => setShowColPicker((v) => !v)}
                    title="Toggle column visibility"
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${showColPicker ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated'}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Columns</span>
                  </button>
                  {showColPicker && (
                    <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-xl border border-border bg-surface shadow-xl shadow-black/30 p-2 space-y-1">
                      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-2 py-1">Visible Columns</p>
                      {([['name', 'Name'], ['type', 'Type'], ['target', 'Target'], ['current', 'Current'], ['latest', 'Latest'], ['status', 'Status'], ['lastChecked', 'Last Checked'], ['interval', 'Interval'], ['action', 'Action']] as [string, string][]).map(([col, label]) => (
                        <button
                          key={col}
                          onClick={() => toggleCol(col)}
                          className="flex items-center justify-between w-full rounded-lg px-2 py-1.5 text-xs hover:bg-surface-elevated transition-colors"
                        >
                          <span className={visibleCols[col] ? 'text-text-primary' : 'text-text-muted'}>{label}</span>
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] ${visibleCols[col] ? 'bg-accent border-accent text-white' : 'border-border'}`}>
                            {visibleCols[col] ? '✓' : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          {(summary?.stats.total ?? 0) > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <p className="text-text-secondary text-sm mb-1">Tracked</p>
                <p className="text-2xl font-bold text-text-primary">{summary?.stats.total ?? 0}</p>
              </Card>
              <Card>
                <p className="text-text-secondary text-sm mb-1">Up-to-date</p>
                <p className="text-2xl font-bold text-success">{summary?.stats.green ?? 0}</p>
              </Card>
              <Card>
                <p className="text-text-secondary text-sm mb-1">Updates</p>
                <p className="text-2xl font-bold text-warning">{summary?.stats.yellow ?? 0}</p>
              </Card>
              <Card>
                <p className="text-text-secondary text-sm mb-1">Critical</p>
                <p className="text-2xl font-bold text-danger">{summary?.stats.red ?? 0}</p>
              </Card>
            </div>
          )}

          {(summary?.items.length ?? 0) === 0 ? (
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <GitBranch className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No version checks yet</p>
              <p className="text-text-secondary text-sm mb-6">
                Track GitHub releases, Docker image tags, and more to stay on top of updates
              </p>
              <Button size="lg" onClick={() => setCreateOpen(true)}>Create your first version check</Button>
            </Card>
          ) : (
          <>
          {/* Main Table */}
          <Card className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHead className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur-sm">
                <TableRow hover={false}>
                  <TableHeader className={visibleCols.name ? '' : 'hidden'}>
                    <button onClick={() => handleVersionSort('name')} className="flex items-center gap-1 hover:text-text-primary transition-colors">
                      Name {sortBy === 'name' ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHeader>
                  <TableHeader className={visibleCols.type ? 'hidden sm:table-cell' : 'hidden'}>Type</TableHeader>
                  <TableHeader className={visibleCols.target ? 'hidden md:table-cell' : 'hidden'}>Target</TableHeader>
                  <TableHeader className={visibleCols.current ? 'hidden sm:table-cell' : 'hidden'}>Current</TableHeader>
                  <TableHeader className={visibleCols.latest ? '' : 'hidden'}>Latest</TableHeader>
                  <TableHeader className={visibleCols.status ? '' : 'hidden'}>
                    <button onClick={() => handleVersionSort('status')} className="flex items-center gap-1 hover:text-text-primary transition-colors">
                      Status {sortBy === 'status' ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHeader>
                  <TableHeader className={visibleCols.lastChecked ? 'hidden lg:table-cell' : 'hidden'}>
                    <button onClick={() => handleVersionSort('lastChecked')} className="flex items-center gap-1 hover:text-text-primary transition-colors">
                      Last check {sortBy === 'lastChecked' ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHeader>
                  <TableHeader className={visibleCols.interval ? 'hidden lg:table-cell' : 'hidden'}>Interval</TableHeader>
                  <TableHeader className={visibleCols.action ? '' : 'hidden'}>Action</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((item) => {
                  const runs = runsByMonitor[item.id] ?? [];
                  const stats = runs.reduce((acc, r) => {
                    acc.total += 1;
                    if (r.level === 'green') acc.green += 1;
                    else if (r.level === 'yellow') acc.yellow += 1;
                    else acc.red += 1;
                    return acc;
                  }, { total: 0, green: 0, yellow: 0, red: 0 });

                  return (
                    <Fragment key={item.id}>
                      <TableRow>
                        <TableCell className={visibleCols.name ? '' : 'hidden'}>
                          <button className="text-accent hover:underline flex items-center gap-1 text-left" onClick={() => toggleDetails(item.id)}>
                            {expandedId === item.id ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                            <span className="truncate max-w-[120px] sm:max-w-none">{item.name}</span>
                          </button>
                        </TableCell>
                        <TableCell className={visibleCols.type ? 'hidden sm:table-cell' : 'hidden'}>
                          {(() => {
                            const cfg = (monitorDetails[item.id]?.config ?? {}) as Record<string, unknown>;
                            const prov = String(cfg.provider ?? (item.type === 'DOCKER_IMAGE' ? 'docker' : 'github')).toLowerCase();
                            const providerLabels: Record<string, string> = {
                              github: 'GitHub', gitlab: 'GitLab', docker: 'Docker',
                              apt: 'APT', npm: 'npm', pypi: 'PyPI',
                              cargo: 'Cargo', maven: 'Maven', helm: 'Helm',
                            };
                            return <span className="text-xs text-text-secondary">{providerLabels[prov] ?? item.type}</span>;
                          })()}
                        </TableCell>
                        <TableCell className={visibleCols.target ? 'hidden md:table-cell' : 'hidden'}>
                          <span
                            className="block max-w-[160px] truncate text-xs font-mono text-text-secondary"
                            title={item.target}
                          >
                            {item.target}
                          </span>
                        </TableCell>
                        <TableCell className={visibleCols.current ? 'hidden sm:table-cell' : 'hidden'}>
                          {item.currentVersion ? (
                            <span className="font-mono text-sm">{item.currentVersion}</span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className={`max-w-[200px] sm:max-w-[320px]${visibleCols.latest ? '' : ' hidden'}`}>
                          {(() => {
                            const { from, to } = extractVersionsFromMessage(item.latestMessage);
                            if (from && to && from !== to) {
                              return <VersionDiff from={from} to={to} />;
                            }
                            return <span className="text-xs text-text-secondary break-all">{item.latestMessage}</span>;
                          })()}
                        </TableCell>
                        <TableCell className={visibleCols.status ? '' : 'hidden'}>
                          {(() => {
                            const { from, to } = extractVersionsFromMessage(item.latestMessage);
                            const hasUpdate = item.level !== 'green';
                            let changelogUrl: string | null = null;
                            if (hasUpdate && to && item.target) {
                              const ghMatch = item.target.match(/^([^/]+\/[^/]+)$/);
                              if (ghMatch) {
                                changelogUrl = `https://github.com/${ghMatch[1]}/releases`;
                              }
                            }
                            if (item.level === 'green') {
                              return (
                                <div className="flex items-center gap-1.5 text-success">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span className="text-xs font-medium">Up to date</span>
                                </div>
                              );
                            }
                            return (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-warning">
                                  <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span className="text-xs font-medium">
                                    {to ? `${/^v\d/i.test(to) ? to : `v${to}`} available` : item.level === 'red' ? 'Critical update' : 'Update available'}
                                  </span>
                                </div>
                                {changelogUrl && (
                                  <a
                                    href={changelogUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[10px] text-accent hover:underline"
                                  >
                                    <ExternalLink className="w-2.5 h-2.5" />
                                    View changelog
                                  </a>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className={visibleCols.lastChecked ? 'hidden lg:table-cell' : 'hidden'}>{item.checkedAt ? new Date(item.checkedAt).toLocaleString() : 'Never'}</TableCell>
                        <TableCell className={visibleCols.interval ? 'hidden lg:table-cell' : 'hidden'}>{secondsToHuman(item.intervalSec)}</TableCell>
                        <TableCell className={visibleCols.action ? '' : 'hidden'}>
                          <div className="flex items-center gap-1">
                            <Button variant="secondary" size="sm" loading={runningId === item.id} onClick={() => runNow(item.id)}>
                              <span className="flex items-center gap-1"><Play className="w-3 h-3" /> Run</span>
                            </Button>
                            <button
                              className="relative p-1.5 rounded-lg text-text-secondary hover:text-accent hover:bg-surface-elevated transition-colors"
                              onClick={() => openAlertPanel(item)}
                              aria-label="Alert channels"
                              title="Manage alert channels"
                            >
                              <Bell className="w-4 h-4" />
                              {item.alertChannels && item.alertChannels.length > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent rounded-full" />
                              )}
                            </button>
                            <button className="p-1.5 rounded-lg text-accent hover:bg-surface-elevated transition-colors" onClick={() => openEdit(item)} aria-label="Edit">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button className="p-1.5 rounded-lg text-danger hover:bg-surface-elevated transition-colors" onClick={() => removeCheck(item.id)} aria-label="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {expandedId === item.id && (
                        <tr className="border-b border-border">
                          <td colSpan={9} className="px-4 py-3 bg-surface-elevated overflow-hidden max-w-0 w-full">
                            {runsLoadingId === item.id ? (
                              <p className="text-sm text-text-secondary">Loading runs…</p>
                            ) : (
                              <>
                                <div className="flex items-center gap-4 mb-3">
                                  <span className="text-sm font-semibold text-text-primary">Last runs: {stats.total}</span>
                                  <Badge variant="success">{`Green ${stats.green}`}</Badge>
                                  <Badge variant="warning">{`Yellow ${stats.yellow}`}</Badge>
                                  <Badge variant="danger">{`Red ${stats.red}`}</Badge>
                                </div>
                                {runs.length === 0 ? (
                                  <p className="text-sm text-text-secondary">No runs yet.</p>
                                ) : (
                                  <Table noScroll>
                                    <TableHead>
                                      <TableRow hover={false}>
                                        <TableHeader>Time</TableHeader>
                                        <TableHeader>Level</TableHeader>
                                        <TableHeader>Status</TableHeader>
                                        <TableHeader>Latency</TableHeader>
                                        <TableHeader>Version diff</TableHeader>
                                        <TableHeader>Message</TableHeader>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {runs.slice(0, 12).map((r) => {
                                        const { from, to } = extractVersionsFromMessage(r.message);
                                        const hasDiff = from && to && from !== to;
                                        return (
                                          <TableRow key={r.id}>
                                            <TableCell>{new Date(r.checkedAt).toLocaleString()}</TableCell>
                                            <TableCell><Badge variant={levelBadgeVariant(r.level)}>{r.level.toUpperCase()}</Badge></TableCell>
                                            <TableCell>{r.statusCode}</TableCell>
                                            <TableCell>{r.latencyMs ?? '—'} ms</TableCell>
                                            <TableCell>
                                              {hasDiff ? (
                                                <VersionDiff from={from} to={to} />
                                              ) : (
                                                <span className="text-xs text-text-secondary">—</span>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-xs text-text-secondary max-w-[200px] truncate" title={r.message}>{r.message}</TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex flex-col gap-3 p-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-text-secondary">Page {safePage} of {pages}</span>
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={safePage >= pages} aria-label="Next page">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <span className="text-sm text-text-secondary">Rows per page</span>
                <Select
                  value={pageSize}
                  onChange={(v) => { setPageSize(v || '10'); setPage(1); }}
                  options={[{ value: '10', label: '10' }, { value: '25', label: '25' }, { value: '50', label: '50' }]}
                  className="w-20"
                />
              </div>
            </div>
            </div>
          </Card>
          </>
          )}
        </>
      )}
      {/* Alert channel panel */}
      {alertPanelMonitor && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setAlertPanelMonitor(null)}>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative z-50 w-full max-w-sm bg-bg border-l border-border h-full flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <h3 className="font-semibold text-text-primary">Alert Channels</h3>
                <p className="text-xs text-text-secondary mt-0.5 truncate max-w-[200px]">{alertPanelMonitor.name}</p>
              </div>
              <button onClick={() => setAlertPanelMonitor(null)} className="p-1.5 rounded-lg hover:bg-surface-elevated text-text-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {alertPanelError && (
                <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">{alertPanelError}</div>
              )}
              {alertPanelLoading ? (
                <p className="text-sm text-text-secondary">Loading…</p>
              ) : (
                <>
                  {/* Assigned channels */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">Assigned Channels</h4>
                    {assignedChannels.length === 0 ? (
                      <p className="text-sm text-text-secondary italic">No channels assigned yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {assignedChannels.map((channel) => (
                          <div key={channel.id} className="rounded-lg bg-surface-elevated border border-border/50 overflow-hidden">
                            <div className="flex items-center justify-between px-3 pt-3 pb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-[11px] font-bold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[channel.type] ?? 'text-text-secondary'}`}>
                                  {channel.type}
                                </span>
                                <span className="text-sm text-text-primary truncate">{channel.name}</span>
                              </div>
                              <button
                                onClick={() => unassignChannel(channel.id)}
                                className="ml-2 p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors shrink-0"
                                aria-label={`Remove ${channel.name}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="px-3 pb-3">
                              <label className="block text-[10px] text-text-secondary uppercase tracking-wide mb-1">Notify when</label>
                              <select
                                value={channel.notifyOn ?? 'VERSION_ANY'}
                                onChange={(e) => updateNotifyOn(channel.id, e.target.value)}
                                className="w-full text-xs bg-bg border border-border rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                              >
                                {VERSION_NOTIFY_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Available channels */}
                  {allChannels.filter((c) => !assignedChannels.some((a) => a.id === c.id)).length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">Add Channel</h4>
                      <div className="space-y-2">
                        {allChannels.filter((c) => !assignedChannels.some((a) => a.id === c.id)).map((channel) => (
                          <div
                            key={channel.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated border border-border/50 hover:border-accent/40 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[11px] font-bold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[channel.type] ?? 'text-text-secondary'}`}>
                                {channel.type}
                              </span>
                              <span className="text-sm text-text-primary truncate">{channel.name}</span>
                            </div>
                            <button
                              onClick={() => assignChannel(channel.id)}
                              className="ml-2 p-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent transition-colors shrink-0"
                              aria-label={`Assign ${channel.name}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppFrame>
  );
}
