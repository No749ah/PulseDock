'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Edit, Trash2 } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui/toast';

type MaintenanceWindow = {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  monitorIds: string[];
  monitorCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const inputClass =
  'w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

function getStatus(w: MaintenanceWindow): 'active' | 'upcoming' | 'past' {
  if (w.isActive) return 'active';
  const now = Date.now();
  if (new Date(w.startsAt).getTime() > now) return 'upcoming';
  return 'past';
}

function StatusBadge({ window: w }: { window: MaintenanceWindow }) {
  const status = getStatus(w);
  if (status === 'active') {
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>;
  }
  if (status === 'upcoming') {
    return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Upcoming</Badge>;
  }
  return <Badge className="bg-text-secondary/20 text-text-secondary border-text-secondary/30">Past</Badge>;
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MaintenancePage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [windows, setWindows] = useState<MaintenanceWindow[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', startsAt: '', endsAt: '' });

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<MaintenanceWindow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', startsAt: '', endsAt: '' });

  useEffect(() => {
    const user = getUser();
    if (!user) router.push('/login');
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      setWindows(await api<MaintenanceWindow[]>('/v1/maintenance'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => router.push('/login'));
  }, []);

  function resetCreateForm() {
    setForm({ name: '', description: '', startsAt: '', endsAt: '' });
  }

  async function createWindow() {
    try {
      await api('/v1/maintenance', undefined, {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
        }),
      });
      setCreateOpen(false);
      resetCreateForm();
      await load();
      success('Maintenance window created');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create maintenance window');
    }
  }

  function openEdit(w: MaintenanceWindow) {
    setSelected(w);
    setEditForm({
      name: w.name,
      description: w.description ?? '',
      startsAt: toDatetimeLocal(w.startsAt),
      endsAt: toDatetimeLocal(w.endsAt),
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selected) return;
    try {
      await api(`/v1/maintenance/${selected.id}`, '', {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description || undefined,
          startsAt: new Date(editForm.startsAt).toISOString(),
          endsAt: new Date(editForm.endsAt).toISOString(),
        }),
      });
      setEditOpen(false);
      await load();
      success('Maintenance window updated');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to update maintenance window');
    }
  }

  function openDelete(w: MaintenanceWindow) {
    setSelected(w);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!selected) return;
    try {
      await api(`/v1/maintenance/${selected.id}`, '', { method: 'DELETE' });
      setDeleteOpen(false);
      await load();
      success('Maintenance window deleted');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to delete maintenance window');
    }
  }

  return (
    <AppFrame title="Maintenance" subtitle="Schedule maintenance windows to suppress alerts during planned downtime.">
      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Create Modal */}
          <Modal
            isOpen={createOpen}
            onClose={() => { setCreateOpen(false); resetCreateForm(); }}
            title="Schedule maintenance window"
            actions={
              <>
                <Button variant="secondary" onClick={() => { setCreateOpen(false); resetCreateForm(); }}>Cancel</Button>
                <Button onClick={createWindow}>Create window</Button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
                <input
                  className={inputClass}
                  placeholder="e.g. Database migration"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Description <span className="text-text-secondary/50">(optional)</span></label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={3}
                  placeholder="Brief description of the maintenance"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Starts at</label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Ends at</label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
              </div>
            </div>
          </Modal>

          {/* Edit Modal */}
          <Modal
            isOpen={editOpen}
            onClose={() => setEditOpen(false)}
            title="Edit maintenance window"
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={saveEdit}>Save</Button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
                <input
                  className={inputClass}
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Description <span className="text-text-secondary/50">(optional)</span></label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Starts at</label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={editForm.startsAt}
                  onChange={(e) => setEditForm({ ...editForm, startsAt: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Ends at</label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={editForm.endsAt}
                  onChange={(e) => setEditForm({ ...editForm, endsAt: e.target.value })}
                />
              </div>
            </div>
          </Modal>

          {/* Delete Confirm Modal */}
          <Modal
            isOpen={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title="Delete maintenance window"
            actions={
              <>
                <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                <Button variant="primary" className="!bg-danger hover:!bg-danger/80" onClick={confirmDelete}>Delete</Button>
              </>
            }
          >
            <p className="text-text-primary">Delete <strong>{selected?.name}</strong>? This cannot be undone.</p>
          </Modal>

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Maintenance Windows</h2>
              <p className="text-text-secondary text-sm mt-1">
                {windows.length} {windows.length === 1 ? 'window' : 'windows'} scheduled
              </p>
            </div>
            <Button size="lg" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
              <span className="flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Schedule window</span>
            </Button>
          </div>

          {windows.length === 0 ? (
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <CalendarClock className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No maintenance windows yet</p>
              <p className="text-text-secondary text-sm mb-6">
                Schedule maintenance windows to suppress alerts during planned downtime
              </p>
              <Button size="lg" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>Schedule your first window</Button>
            </Card>
          ) : (
            <Card className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow hover={false}>
                      <TableHeader>Name</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader>Start</TableHeader>
                      <TableHeader>End</TableHeader>
                      <TableHeader>Monitors</TableHeader>
                      <TableHeader>Actions</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {windows.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-text-primary">{w.name}</p>
                            {w.description && (
                              <p className="text-xs text-text-secondary mt-0.5 max-w-xs truncate">{w.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge window={w} />
                        </TableCell>
                        <TableCell>{new Date(w.startsAt).toLocaleString()}</TableCell>
                        <TableCell>{new Date(w.endsAt).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge>{String(w.monitorCount)}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(w)} aria-label={`Edit ${w.name}`} title="Edit window">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openDelete(w)} className="text-danger hover:text-danger" aria-label={`Delete ${w.name}`} title="Delete window">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}
    </AppFrame>
  );
}
