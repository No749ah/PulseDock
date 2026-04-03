'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Folder,
  ExternalLink,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  LayoutGrid,
  List,
  VolumeX,
  Volume2,
} from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../components/Table';
import { SortableHeader, TablePagination } from '../components/SortableTable';
import { Select } from '../components/Select';
import { useTableSort, exportCSV, exportJSON } from '../../lib/useTableSort';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import Link from 'next/link';
import { useToast } from '../../components/ui/toast';
import { flattenTree, uptimeBarColor, STATUS_LABELS, type OverallStatus, type FolderNode } from './helpers';

type FolderStats = {
  totalMonitors: number;
  enabledMonitors: number;
  healthy: number;
  degraded: number;
  down: number;
  uptimePct: number | null;
  overallStatus: 'operational' | 'degraded' | 'outage' | 'empty';
};

type LocalFolderNode = FolderNode & {
  parentId: string | null;
  position: number;
  createdAt: string;
  depth: number;
  path: string[];
  stats?: FolderStats;
};

type Folder = LocalFolderNode;

const inputClass =
  'w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

function StatusBadge({ status }: { status: FolderStats['overallStatus'] }) {
  const map: Record<OverallStatus, { cls: string; Icon: typeof CheckCircle2 }> = {
    operational: { cls: 'bg-success/15 text-success border border-success/30', Icon: CheckCircle2 },
    degraded: { cls: 'bg-warning/15 text-warning border border-warning/30', Icon: AlertTriangle },
    outage: { cls: 'bg-danger/15 text-danger border border-danger/30', Icon: XCircle },
    empty: { cls: 'bg-surface-elevated text-text-secondary border border-border', Icon: Activity },
  };
  const { cls, Icon } = map[status];
  const label = STATUS_LABELS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function UptimeBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-text-secondary">—</span>;
  const color = uptimeBarColor(pct);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden max-w-[80px]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs font-medium text-text-primary tabular-nums">{pct}%</span>
    </div>
  );
}

export default function FoldersPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('12');
  const { sort: projSort, toggle: projToggle, sorted: projSorted } = useTableSort<'name' | 'monitorCount' | 'uptimePct' | 'createdAt'>('name');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('projects-view') as 'grid' | 'table') || 'table' : 'table'
  );

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [muteMinutes, setMuteMinutes] = useState('60');
  const [selected, setSelected] = useState<Folder | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user) router.push('/login');
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      const tree = await api<FolderNode[]>('/v1/folders');
      setFolders(flattenTree(tree));
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function toggleView(mode: 'grid' | 'table') {
    setViewMode(mode);
    localStorage.setItem('projects-view', mode);
  }

  function resetCreateForm() {
    setName('');
    setCreateParentId(null);
    setCreateStep(0);
  }

  async function createFolder() {
    setSaving(true);
    try {
      await api('/v1/folders', undefined, { method: 'POST', body: JSON.stringify({ name, parentId: createParentId }) });
      success(`Project "${name}" created`);
      resetCreateForm();
      setCreateOpen(false);
      await load();
    } catch {
      toastError('Failed to create project');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(folder: Folder) {
    setSelected(folder);
    setEditName(folder.name);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    try {
      await api(`/v1/folders/${selected.id}`, undefined, { method: 'PATCH', body: JSON.stringify({ name: editName }) });
      success('Project updated');
      setEditOpen(false);
      await load();
    } catch {
      toastError('Failed to update project');
    } finally {
      setSaving(false);
    }
  }

  function openDelete(folder: Folder) {
    setSelected(folder);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!selected) return;
    setSaving(true);
    try {
      await api(`/v1/folders/${selected.id}`, undefined, { method: 'DELETE' });
      success(`Project "${selected.name}" deleted`);
      setDeleteOpen(false);
      await load();
    } catch {
      toastError('Failed to delete project');
    } finally {
      setSaving(false);
    }
  }

  function openMute(folder: Folder) {
    setSelected(folder);
    setMuteMinutes('60');
    setMuteOpen(true);
  }

  async function confirmMute() {
    if (!selected) return;
    const mins = Math.max(1, Math.min(1440, Number(muteMinutes) || 60));
    setSaving(true);
    try {
      const u = await getUser();
      const res = await api(`/v1/folders/${selected.id}/mute`, u?.id, { method: 'POST', body: JSON.stringify({ minutes: mins }) }) as { monitorCount: number; mutedUntil: string };
      success(`Muted ${res.monitorCount} monitor${res.monitorCount !== 1 ? 's' : ''} in "${selected.name}" for ${mins} min`);
      setMuteOpen(false);
    } catch {
      toastError('Failed to mute project');
    } finally {
      setSaving(false);
    }
  }

  async function unmuteFolder(folder: Folder) {
    try {
      const res = await api(`/v1/folders/${folder.id}/mute`, undefined, { method: 'DELETE' }) as { monitorCount: number };
      success(`Unmuted ${res.monitorCount} monitor${res.monitorCount !== 1 ? 's' : ''} in "${folder.name}"`);
    } catch {
      toastError('Failed to unmute project');
    }
  }

  const size = Number(pageSize);
  const sortedFolders = projSorted(folders, (f) => {
    if (projSort.key === 'name') return f.name;
    if (projSort.key === 'monitorCount') return f.stats?.totalMonitors ?? 0;
    if (projSort.key === 'uptimePct') return f.stats?.uptimePct ?? 0;
    if (projSort.key === 'createdAt') return f.createdAt;
    return f.name;
  });
  const pages = Math.max(1, Math.ceil(sortedFolders.length / size));
  const safePage = Math.min(page, pages);
  const pageRows = useMemo(
    () => sortedFolders.slice((safePage - 1) * size, safePage * size),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedFolders.length, safePage, size, projSort.key, projSort.dir]
  );

  const totalMonitors = folders.reduce((sum, f) => sum + (f.stats?.totalMonitors ?? 0), 0);
  const totalDown = folders.reduce((sum, f) => sum + (f.stats?.down ?? 0), 0);
  const totalDegraded = folders.reduce((sum, f) => sum + (f.stats?.degraded ?? 0), 0);

  return (
    <AppFrame
      title="Projects"
      subtitle="Group monitors by environment, product, or customer space."
      breadcrumbs={[{ label: 'Projects' }]}
    >
      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Modals */}
          <Modal
            isOpen={createOpen}
            onClose={() => { setCreateOpen(false); resetCreateForm(); }}
            title="Create project"
            actions={
              <div className="flex items-center justify-between w-full">
                <Button variant="secondary" onClick={() => setCreateStep((s) => Math.max(0, s - 1))} disabled={createStep === 0}>
                  Back
                </Button>
                {createStep < 1
                  ? <Button onClick={() => setCreateStep(1)} disabled={!name.trim()}>Next</Button>
                  : <Button onClick={createFolder} disabled={saving || !name.trim()}>
                      {saving ? 'Creating…' : 'Create project'}
                    </Button>
                }
              </div>
            }
          >
            {createStep === 0 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Project name</label>
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Production, Staging, Customer A"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) setCreateStep(1); }}
                  />
                </div>
                {folders.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Parent project (optional)</label>
                    <select
                      className={inputClass}
                      value={createParentId ?? ''}
                      onChange={(e) => setCreateParentId(e.target.value || null)}
                    >
                      <option value="">None (root level)</option>
                      {folders.filter((f) => (f.depth ?? 0) < 4).map((f) => (
                        <option key={f.id} value={f.id}>
                          {'  '.repeat(f.depth ?? 0)}{'└ '.repeat(Math.min(1, f.depth ?? 0))}{f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            {createStep === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-text-primary">
                  Create project: <strong className="text-accent">{name}</strong>
                </p>
                <p className="text-xs text-text-secondary">
                  You can add monitors to this project after creation via the Monitors page.
                </p>
              </div>
            )}
          </Modal>

          <Modal
            isOpen={editOpen}
            onClose={() => setEditOpen(false)}
            title="Edit project"
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={saveEdit} disabled={saving || !editName.trim()}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </>
            }
          >
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Project name</label>
              <input
                className={inputClass}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && editName.trim()) saveEdit(); }}
              />
            </div>
          </Modal>

          <Modal
            isOpen={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title="Delete project"
            actions={
              <>
                <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                <Button
                  variant="primary"
                  className="!bg-danger hover:!bg-danger/80"
                  onClick={confirmDelete}
                  disabled={saving}
                >
                  {saving ? 'Deleting…' : 'Delete'}
                </Button>
              </>
            }
          >
            <div className="space-y-2">
              <p className="text-text-primary">
                Delete project <strong className="text-danger">{selected?.name}</strong>?
              </p>
              {(selected?.stats?.totalMonitors ?? 0) > 0 && (
                <p className="text-xs text-text-secondary">
                  {selected?.stats?.totalMonitors} monitors will be unassigned (not deleted).
                </p>
              )}
            </div>
          </Modal>

          {/* Mute Modal */}
          <Modal
            isOpen={muteOpen}
            onClose={() => setMuteOpen(false)}
            title={`Mute alerts — ${selected?.name}`}
            actions={
              <>
                <Button variant="secondary" onClick={() => setMuteOpen(false)}>Cancel</Button>
                <Button
                  variant="primary"
                  className="gap-1.5"
                  onClick={confirmMute}
                  disabled={saving || !muteMinutes || Number(muteMinutes) < 1}
                >
                  <VolumeX className="w-4 h-4" />
                  {saving ? 'Muting…' : 'Mute all monitors'}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <p className="text-text-secondary text-sm">
                All {selected?.stats?.totalMonitors ?? 0} monitors in <strong className="text-text-primary">{selected?.name}</strong> will stop sending alerts for the specified duration.
              </p>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Mute duration</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={muteMinutes}
                    onChange={(e) => setMuteMinutes(e.target.value)}
                    className={inputClass + ' max-w-[120px]'}
                    placeholder="60"
                  />
                  <span className="text-text-secondary text-sm">minutes</span>
                  <div className="flex gap-2 ml-2">
                    {[30, 60, 120, 240].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMuteMinutes(String(m))}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${Number(muteMinutes) === m ? 'bg-accent text-white' : 'bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-elevated/80'}`}
                      >
                        {m >= 60 ? `${m / 60}h` : `${m}m`}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-text-secondary mt-1.5">Max 1440 min (24h). Recoveries will still fire during mute.</p>
              </div>
            </div>
          </Modal>

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Projects</h2>
              <p className="text-text-secondary text-sm mt-1">
                {folders.length} {folders.length === 1 ? 'project' : 'projects'}
                {totalMonitors > 0 && ` · ${totalMonitors} monitors`}
                {totalDown > 0 && (
                  <span className="text-danger ml-1">· {totalDown} down</span>
                )}
                {totalDown === 0 && totalDegraded > 0 && (
                  <span className="text-warning ml-1">· {totalDegraded} degraded</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex items-center border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleView('grid')}
                  className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                  title="Grid view"
                  aria-label="Grid view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleView('table')}
                  className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                  title="Table view"
                  aria-label="Table view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
              <Button size="lg" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Create project
                </span>
              </Button>
            </div>
          </div>

          {folders.length === 0 ? (
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <Folder className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No projects yet</p>
              <p className="text-text-secondary text-sm mb-6">
                Organize your monitors by environment, product, or customer space
              </p>
              <Button size="lg" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
                Create your first project
              </Button>
            </Card>
          ) : viewMode === 'grid' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                {pageRows.map((f) => {
                  const stats = f.stats;
                  return (
                    <div
                      key={f.id}
                      className="rounded-2xl border border-border bg-surface p-5 hover:border-border-hover hover:bg-surface-elevated hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 transition-all duration-200 group"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-xl bg-accent/10 shrink-0">
                            <Folder className="w-4 h-4 text-accent" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-text-primary text-sm truncate">{f.name}</h3>
                            {f.path && f.path.length > 1 && (
                              <p className="text-[10px] text-text-muted truncate">{f.path.slice(0, -1).join(' / ')}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openMute(f)}
                            className="p-1 rounded text-text-secondary hover:text-warning transition-colors"
                            aria-label={`Mute alerts for ${f.name}`}
                            title="Mute all monitors in project"
                          >
                            <VolumeX className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEdit(f)}
                            className="p-1 rounded text-text-secondary hover:text-accent transition-colors"
                            aria-label={`Edit ${f.name}`}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openDelete(f)}
                            className="p-1 rounded text-text-secondary hover:text-danger transition-colors"
                            aria-label={`Delete ${f.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Status badge */}
                      {stats && <StatusBadge status={stats.overallStatus} />}

                      {/* Stats */}
                      {stats && stats.totalMonitors > 0 ? (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-text-secondary">Monitors</span>
                            <div className="flex items-center gap-2">
                              {stats.healthy > 0 && (
                                <span className="text-success font-medium">{stats.healthy} up</span>
                              )}
                              {stats.degraded > 0 && (
                                <span className="text-warning font-medium">{stats.degraded} warn</span>
                              )}
                              {stats.down > 0 && (
                                <span className="text-danger font-medium">{stats.down} down</span>
                              )}
                            </div>
                          </div>
                          <UptimeBar pct={stats.uptimePct} />
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-text-secondary">No monitors assigned</p>
                      )}

                      {/* Footer */}
                      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                        <span className="text-xs text-text-muted">
                          {new Date(f.createdAt).toLocaleDateString()}
                        </span>
                        {stats && stats.totalMonitors > 0 && (
                          <Link
                            href={`/monitors?folder=${f.id}`}
                            className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                          >
                            View monitors
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Grid pagination */}
              {pages > 1 && (
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-text-secondary">Page {safePage} of {pages}</span>
                    <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={safePage >= pages} aria-label="Next page">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <Select
                    value={pageSize}
                    onChange={(v) => { setPageSize(v || '12'); setPage(1); }}
                    options={[
                      { value: '12', label: '12 per page' },
                      { value: '24', label: '24 per page' },
                      { value: '48', label: '48 per page' },
                    ]}
                    className="w-36"
                  />
                </div>
              )}
            </>
          ) : (
            /* Table view */
            <Card className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <tr className="bg-surface-elevated border-b border-border">
                      <SortableHeader sortKey="name" sort={projSort} onSort={projToggle}>Name</SortableHeader>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Status</th>
                      <SortableHeader sortKey="monitorCount" sort={projSort} onSort={projToggle}>Monitors</SortableHeader>
                      <SortableHeader sortKey="uptimePct" sort={projSort} onSort={projToggle}>24h Uptime</SortableHeader>
                      <SortableHeader sortKey="createdAt" sort={projSort} onSort={projToggle}>Created</SortableHeader>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Actions</th>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {pageRows.map((f) => {
                      const stats = f.stats;
                      return (
                        <TableRow key={f.id}>
                          <TableCell>
                            <div className="flex items-center gap-2" style={{ paddingLeft: `${(f.depth ?? 0) * 20}px` }}>
                              {(f.depth ?? 0) > 0 && (
                                <span className="text-text-muted text-xs mr-0.5">└</span>
                              )}
                              <Folder className="w-4 h-4 text-accent shrink-0" />
                              <span className="font-medium text-text-primary">{f.name}</span>
                              {f.path && f.path.length > 1 && (
                                <span className="text-xs text-text-muted hidden sm:inline">
                                  {f.path.slice(0, -1).join(' / ')}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {stats ? <StatusBadge status={stats.overallStatus} /> : '—'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-text-primary">{stats?.totalMonitors ?? 0}</span>
                              {(stats?.totalMonitors ?? 0) > 0 && (
                                <Link
                                  href={`/monitors?folder=${f.id}`}
                                  className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                                  title="View monitors"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  View
                                </Link>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <UptimeBar pct={stats?.uptimePct ?? null} />
                          </TableCell>
                          <TableCell>{new Date(f.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => openMute(f)} className="text-warning hover:text-warning" aria-label={`Mute ${f.name}`} title="Mute all monitors in project">
                                <VolumeX className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => unmuteFolder(f)} className="text-text-secondary" aria-label={`Unmute ${f.name}`} title="Unmute all monitors in project">
                                <Volume2 className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(f)} aria-label={`Edit ${f.name}`} title="Edit project">
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openDelete(f)} className="text-danger hover:text-danger" aria-label={`Delete ${f.name}`} title="Delete project">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <TablePagination
                  page={safePage}
                  pageCount={pages}
                  pageSize={pageSize}
                  totalItems={sortedFolders.length}
                  onPage={setPage}
                  onPageSize={(s) => { setPageSize(s); setPage(1); }}
                  pageSizeOptions={[10, 25, 50, 100]}
                  onExportCSV={() => exportCSV('projects.csv', folders.map((f) => ({
                    id: f.id, name: f.name, monitorCount: f.stats?.totalMonitors ?? 0,
                    uptimePct: f.stats?.uptimePct ?? '', overallStatus: f.stats?.overallStatus ?? '',
                    createdAt: f.createdAt,
                  })))}
                  onExportJSON={() => exportJSON('projects.json', folders)}
                />
              </div>
            </Card>
          )}
        </>
      )}
    </AppFrame>
  );
}
