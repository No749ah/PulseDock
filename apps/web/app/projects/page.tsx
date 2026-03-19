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
} from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Select } from '../components/Select';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import Link from 'next/link';
import { useToast } from '../../components/ui/toast';

type FolderStats = {
  totalMonitors: number;
  enabledMonitors: number;
  healthy: number;
  degraded: number;
  down: number;
  uptimePct: number | null;
  overallStatus: 'operational' | 'degraded' | 'outage' | 'empty';
};

type Folder = { id: string; name: string; createdAt: string; stats?: FolderStats };

const inputClass =
  'w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

function StatusBadge({ status }: { status: FolderStats['overallStatus'] }) {
  const map: Record<FolderStats['overallStatus'], { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    operational: { label: 'Operational', cls: 'bg-success/15 text-success border border-success/30', Icon: CheckCircle2 },
    degraded: { label: 'Degraded', cls: 'bg-warning/15 text-warning border border-warning/30', Icon: AlertTriangle },
    outage: { label: 'Outage', cls: 'bg-danger/15 text-danger border border-danger/30', Icon: XCircle },
    empty: { label: 'No monitors', cls: 'bg-surface-elevated text-text-secondary border border-border', Icon: Activity },
  };
  const { label, cls, Icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function UptimeBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-text-secondary">—</span>;
  const color = pct >= 99 ? 'bg-success' : pct >= 95 ? 'bg-warning' : 'bg-danger';
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
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('12');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('projects-view') as 'grid' | 'table') || 'grid' : 'grid'
  );

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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
      const foldersData = await api<Folder[]>('/v1/folders');
      setFolders(foldersData);
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
    setCreateStep(0);
  }

  async function createFolder() {
    setSaving(true);
    try {
      await api('/v1/folders', undefined, { method: 'POST', body: JSON.stringify({ name }) });
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

  const size = Number(pageSize);
  const pages = Math.max(1, Math.ceil(folders.length / size));
  const safePage = Math.min(page, pages);
  const pageRows = useMemo(
    () => folders.slice((safePage - 1) * size, safePage * size),
    [folders, safePage, size]
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
                          <h3 className="font-semibold text-text-primary text-sm truncate">{f.name}</h3>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    <TableRow hover={false}>
                      <TableHeader>Name</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader>Monitors</TableHeader>
                      <TableHeader>24h Uptime</TableHeader>
                      <TableHeader>Created</TableHeader>
                      <TableHeader>Actions</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pageRows.map((f) => {
                      const stats = f.stats;
                      return (
                        <TableRow key={f.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Folder className="w-4 h-4 text-accent shrink-0" />
                              <span className="font-medium text-text-primary">{f.name}</span>
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

                {/* Table pagination */}
                <div className="flex flex-col gap-3 p-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-text-secondary" aria-live="polite">Page {safePage} of {pages}</span>
                    <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={safePage >= pages} aria-label="Next page">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <Select
                    value={pageSize}
                    onChange={(v) => { setPageSize(v || '10'); setPage(1); }}
                    options={[
                      { value: '10', label: '10' },
                      { value: '25', label: '25' },
                      { value: '50', label: '50' },
                    ]}
                    className="w-20"
                  />
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </AppFrame>
  );
}
