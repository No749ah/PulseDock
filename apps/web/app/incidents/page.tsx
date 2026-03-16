'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertOctagon, Edit, Trash2, Plus, ChevronDown, ChevronUp, MessageSquarePlus } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui/toast';

// Types
type IncidentStatus = 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type MonitorOption = {
  id: string;
  name: string;
  type: string;
};

type IncidentUpdate = {
  id: string;
  body: string;
  status: IncidentStatus;
  createdAt: string;
};

type LinkedMonitor = {
  monitor: {
    id: string;
    name: string;
    type: string;
    target?: string;
  };
};

type Incident = {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  severity: IncidentSeverity;
  createdAt: string;
  updatedAt: string;
  updates: IncidentUpdate[];
  monitors: LinkedMonitor[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const statusLabels: Record<IncidentStatus, string> = {
  INVESTIGATING: 'Investigating',
  IDENTIFIED: 'Identified',
  MONITORING: 'Monitoring',
  RESOLVED: 'Resolved',
};

const statusColors: Record<IncidentStatus, string> = {
  INVESTIGATING: 'bg-red-500/20 text-red-400 border-red-500/30',
  IDENTIFIED: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MONITORING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  RESOLVED: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const severityColors: Record<IncidentSeverity, string> = {
  LOW: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const inputClass =
  'w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

const selectClass = `${inputClass} cursor-pointer`;

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

// ─── Monitor Picker ──────────────────────────────────────────────────────────

function MonitorPicker({
  monitors,
  selectedIds,
  onChange,
}: {
  monitors: MonitorOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1">
        Affected monitors <span className="text-text-secondary/60">(optional)</span>
      </label>
      {monitors.length === 0 ? (
        <p className="text-xs text-text-secondary italic">No monitors yet</p>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-0.5 border border-border rounded-lg p-2">
          {monitors.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-elevated cursor-pointer"
            >
              <input
                type="checkbox"
                className="accent-accent flex-shrink-0"
                checked={selectedIds.includes(m.id)}
                onChange={(e) => {
                  onChange(
                    e.target.checked
                      ? [...selectedIds, m.id]
                      : selectedIds.filter((id) => id !== m.id),
                  );
                }}
              />
              <span className="text-sm text-text-primary flex-1 truncate">{m.name}</span>
              <span className="text-xs text-text-secondary flex-shrink-0">{m.type.replace('_', ' ')}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function IncidentsPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    severity: 'MEDIUM' as IncidentSeverity,
  });
  const [createMonitorIds, setCreateMonitorIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    status: 'INVESTIGATING' as IncidentStatus,
    severity: 'MEDIUM' as IncidentSeverity,
  });
  const [editMonitorIds, setEditMonitorIds] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);

  // Update modal
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateForm, setUpdateForm] = useState({
    body: '',
    status: 'INVESTIGATING' as IncidentStatus,
  });
  const [posting, setPosting] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<Incident | null>(null);

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Incident | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user) router.push('/login');
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      const [incidentsData, monitorsData] = await Promise.all([
        api<Incident[]>('/v1/incidents'),
        api<MonitorOption[]>('/v1/monitors'),
      ]);
      setIncidents(incidentsData);
      setMonitors(monitorsData);
    } catch {
      toastError('Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Create ──
  async function confirmCreate() {
    if (!createForm.title.trim()) return;
    setCreating(true);
    try {
      await api('/v1/incidents', undefined, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title.trim(),
          description: createForm.description.trim() || undefined,
          severity: createForm.severity,
          monitorIds: createMonitorIds.length > 0 ? createMonitorIds : undefined,
        }),
      });
      success('Incident created');
      setCreateOpen(false);
      setCreateForm({ title: '', description: '', severity: 'MEDIUM' });
      setCreateMonitorIds([]);
      load();
    } catch {
      toastError('Failed to create incident');
    } finally {
      setCreating(false);
    }
  }

  // ── Edit ──
  function openEdit(incident: Incident) {
    setSelected(incident);
    setEditForm({
      title: incident.title,
      description: incident.description ?? '',
      status: incident.status,
      severity: incident.severity,
    });
    setEditMonitorIds(incident.monitors.map((m) => m.monitor.id));
    setEditOpen(true);
  }

  async function confirmEdit() {
    if (!selected) return;
    setEditing(true);
    try {
      await api(`/v1/incidents/${selected.id}`, undefined, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim() || undefined,
          status: editForm.status,
          severity: editForm.severity,
          monitorIds: editMonitorIds,
        }),
      });
      success('Incident updated');
      setEditOpen(false);
      load();
    } catch {
      toastError('Failed to update incident');
    } finally {
      setEditing(false);
    }
  }

  // ── Post Update ──
  function openUpdate(incident: Incident) {
    setUpdateTarget(incident);
    setUpdateForm({ body: '', status: incident.status });
    setUpdateOpen(true);
  }

  async function confirmUpdate() {
    if (!updateTarget || !updateForm.body.trim()) return;
    setPosting(true);
    try {
      await api(`/v1/incidents/${updateTarget.id}/updates`, undefined, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: updateForm.body.trim(),
          status: updateForm.status,
        }),
      });
      success('Update posted');
      setUpdateOpen(false);
      load();
      setExpandedId(updateTarget.id);
    } catch {
      toastError('Failed to post update');
    } finally {
      setPosting(false);
    }
  }

  // ── Delete ──
  function openDelete(incident: Incident) {
    setDeleteTarget(incident);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/v1/incidents/${deleteTarget.id}`, undefined, { method: 'DELETE' });
      success('Incident deleted');
      setDeleteOpen(false);
      if (expandedId === deleteTarget.id) setExpandedId(null);
      load();
    } catch {
      toastError('Failed to delete incident');
    } finally {
      setDeleting(false);
    }
  }

  const activeIncidents = incidents.filter((i) => i.status !== 'RESOLVED');
  const resolvedIncidents = incidents.filter((i) => i.status === 'RESOLVED');

  return (
    <AppFrame title="Incidents" subtitle="Track and manage operational incidents">
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Modals */}

          {/* Create */}
          <Modal
            isOpen={createOpen}
            onClose={() => setCreateOpen(false)}
            title="Create incident"
            actions={
              <>
                <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={confirmCreate} disabled={!createForm.title.trim() || creating}>
                  {creating ? 'Creating…' : 'Create'}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Title <span className="text-danger">*</span></label>
                <input
                  className={inputClass}
                  placeholder="Brief description of the incident"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={3}
                  placeholder="What's happening? What's the impact?"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Severity</label>
                <select
                  className={selectClass}
                  value={createForm.severity}
                  onChange={(e) => setCreateForm({ ...createForm, severity: e.target.value as IncidentSeverity })}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <MonitorPicker
                monitors={monitors}
                selectedIds={createMonitorIds}
                onChange={setCreateMonitorIds}
              />
            </div>
          </Modal>

          {/* Edit */}
          <Modal
            isOpen={editOpen}
            onClose={() => setEditOpen(false)}
            title="Edit incident"
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={confirmEdit} disabled={!editForm.title.trim() || editing}>
                  {editing ? 'Saving…' : 'Save changes'}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Title <span className="text-danger">*</span></label>
                <input
                  className={inputClass}
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Status</label>
                  <select
                    className={selectClass}
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as IncidentStatus })}
                  >
                    <option value="INVESTIGATING">Investigating</option>
                    <option value="IDENTIFIED">Identified</option>
                    <option value="MONITORING">Monitoring</option>
                    <option value="RESOLVED">Resolved</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Severity</label>
                  <select
                    className={selectClass}
                    value={editForm.severity}
                    onChange={(e) => setEditForm({ ...editForm, severity: e.target.value as IncidentSeverity })}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>
              <MonitorPicker
                monitors={monitors}
                selectedIds={editMonitorIds}
                onChange={setEditMonitorIds}
              />
            </div>
          </Modal>

          {/* Post Update */}
          <Modal
            isOpen={updateOpen}
            onClose={() => setUpdateOpen(false)}
            title="Post incident update"
            actions={
              <>
                <Button variant="secondary" onClick={() => setUpdateOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={confirmUpdate} disabled={!updateForm.body.trim() || posting}>
                  {posting ? 'Posting…' : 'Post update'}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Update <span className="text-danger">*</span></label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={4}
                  placeholder="What's the current status? What actions are being taken?"
                  value={updateForm.body}
                  onChange={(e) => setUpdateForm({ ...updateForm, body: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">New status</label>
                <select
                  className={selectClass}
                  value={updateForm.status}
                  onChange={(e) => setUpdateForm({ ...updateForm, status: e.target.value as IncidentStatus })}
                >
                  <option value="INVESTIGATING">Investigating</option>
                  <option value="IDENTIFIED">Identified</option>
                  <option value="MONITORING">Monitoring</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </div>
            </div>
          </Modal>

          {/* Delete */}
          <Modal
            isOpen={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title="Delete incident"
            actions={
              <>
                <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                <Button
                  variant="primary"
                  className="!bg-danger hover:!bg-danger/80"
                  onClick={confirmDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </>
            }
          >
            <p className="text-text-primary">
              Delete <strong>{deleteTarget?.title}</strong>? This will permanently remove the incident and all its updates. This cannot be undone.
            </p>
          </Modal>

          {/* Page header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Incidents</h2>
              <p className="text-text-secondary text-sm mt-1">
                {activeIncidents.length} active · {resolvedIncidents.length} resolved
              </p>
            </div>
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              <span className="flex items-center gap-2">
                <Plus className="w-4 h-4" /> New incident
              </span>
            </Button>
          </div>

          {incidents.length === 0 ? (
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <AlertOctagon className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No incidents</p>
              <p className="text-text-secondary text-sm mb-6">
                Create an incident to track and communicate operational issues to your team
              </p>
              <Button size="lg" onClick={() => setCreateOpen(true)}>
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create incident</span>
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Active incidents */}
              {activeIncidents.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
                    Active ({activeIncidents.length})
                  </h3>
                  <div className="space-y-2">
                    {activeIncidents.map((incident) => (
                      <IncidentRow
                        key={incident.id}
                        incident={incident}
                        expanded={expandedId === incident.id}
                        onToggle={() => setExpandedId(expandedId === incident.id ? null : incident.id)}
                        onEdit={() => openEdit(incident)}
                        onUpdate={() => openUpdate(incident)}
                        onDelete={() => openDelete(incident)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Resolved incidents */}
              {resolvedIncidents.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 mt-6">
                    Resolved ({resolvedIncidents.length})
                  </h3>
                  <div className="space-y-2">
                    {resolvedIncidents.map((incident) => (
                      <IncidentRow
                        key={incident.id}
                        incident={incident}
                        expanded={expandedId === incident.id}
                        onToggle={() => setExpandedId(expandedId === incident.id ? null : incident.id)}
                        onEdit={() => openEdit(incident)}
                        onUpdate={() => openUpdate(incident)}
                        onDelete={() => openDelete(incident)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </AppFrame>
  );
}

// ─── Incident Row ────────────────────────────────────────────────────────────

function IncidentRow({
  incident,
  expanded,
  onToggle,
  onEdit,
  onUpdate,
  onDelete,
}: {
  incident: Incident;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      {/* Row header */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
        onClick={onToggle}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        {/* Severity indicator */}
        <div
          className={`w-1 self-stretch rounded-full flex-shrink-0 ${
            incident.severity === 'CRITICAL' ? 'bg-red-500' :
            incident.severity === 'HIGH' ? 'bg-orange-500' :
            incident.severity === 'MEDIUM' ? 'bg-yellow-500' :
            'bg-blue-500'
          }`}
        />

        {/* Title + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-text-primary truncate">{incident.title}</span>
            <Badge className={statusColors[incident.status]}>{statusLabels[incident.status]}</Badge>
            <Badge className={severityColors[incident.severity]}>{incident.severity}</Badge>
          </div>
          {incident.description && (
            <p className="text-sm text-text-secondary truncate mt-0.5">{incident.description}</p>
          )}
        </div>

        {/* Meta */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-text-secondary flex-shrink-0">
          <span>{incident.monitors.length} monitor{incident.monitors.length !== 1 ? 's' : ''}</span>
          <span>{incident.updates.length} update{incident.updates.length !== 1 ? 's' : ''}</span>
          <span>{relativeTime(incident.createdAt)}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onUpdate}
            aria-label="Post update"
            title="Post update"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label={`Edit ${incident.title}`}
            title="Edit incident"
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-danger hover:text-danger"
            aria-label={`Delete ${incident.title}`}
            title="Delete incident"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-text-secondary ml-1" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-secondary ml-1" />
          )}
        </div>
      </div>

      {/* Expanded: timeline + monitors */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {/* Affected monitors */}
          {incident.monitors.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Affected monitors</p>
              <div className="flex flex-wrap gap-2">
                {incident.monitors.map(({ monitor }) => (
                  <Badge key={monitor.id} className="text-xs">
                    {monitor.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Timeline</p>
            {incident.updates.length === 0 ? (
              <p className="text-sm text-text-secondary italic">No updates yet.</p>
            ) : (
              <div className="space-y-3">
                {incident.updates.map((upd) => (
                  <div key={upd.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${statusColors[upd.status].split(' ')[0]}`} />
                      <div className="w-px flex-1 bg-border mt-1" />
                    </div>
                    <div className="pb-3 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-xs ${statusColors[upd.status]}`}>{statusLabels[upd.status]}</Badge>
                        <span className="text-xs text-text-secondary">{relativeTime(upd.createdAt)}</span>
                      </div>
                      <p className="text-sm text-text-primary whitespace-pre-wrap">{upd.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
