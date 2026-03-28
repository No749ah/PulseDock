'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Edit, Trash2, Plus, Calendar, RefreshCw } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../components/Table';
import { SortableHeader, TablePagination } from '../components/SortableTable';
import { useTableSort, exportCSV, exportJSON } from '../../lib/useTableSort';
import { getUser } from '../../components/auth';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui/toast';

type MaintenanceWindow = {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  recurrenceDays: string | null;
  durationMinutes: number | null;
  recurrenceEndsAt: string | null;
  monitorIds: string[];
  monitorCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type MonitorOption = {
  id: string;
  name: string;
  type: string;
};

const DAYS_OF_WEEK = [
  { label: 'Sun', value: '0' },
  { label: 'Mon', value: '1' },
  { label: 'Tue', value: '2' },
  { label: 'Wed', value: '3' },
  { label: 'Thu', value: '4' },
  { label: 'Fri', value: '5' },
  { label: 'Sat', value: '6' },
];

const inputClass =
  'w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

const selectClass =
  'w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatus(w: MaintenanceWindow): 'active' | 'upcoming' | 'past' | 'recurring' {
  if (w.isActive) return 'active';
  if (w.recurrence !== 'NONE') return 'recurring';
  const now = Date.now();
  if (new Date(w.startsAt).getTime() > now) return 'upcoming';
  return 'past';
}

function formatWindowDuration(w: MaintenanceWindow): string {
  const mins = w.durationMinutes ??
    Math.round((new Date(w.endsAt).getTime() - new Date(w.startsAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m window`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m window` : `${hrs}h window`;
}

function formatEndsIn(w: MaintenanceWindow): string {
  const remaining = new Date(w.endsAt).getTime() - Date.now();
  if (remaining <= 0) return 'ending now';
  const totalMins = Math.floor(remaining / 60000);
  if (totalMins < 60) return `Ends in ${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `Ends in ${hrs}h ${mins}m` : `Ends in ${hrs}h`;
}

function recurrenceLabel(w: MaintenanceWindow): string {
  if (w.recurrence === 'NONE') return '';
  if (w.recurrence === 'DAILY') return 'Daily';
  if (w.recurrence === 'MONTHLY') return 'Monthly';
  if (w.recurrence === 'WEEKLY') {
    const days = (w.recurrenceDays ?? '')
      .split(',')
      .map((d) => DAYS_OF_WEEK.find((x) => x.value === d.trim())?.label ?? '')
      .filter(Boolean);
    return days.length > 0 ? `Weekly (${days.join(', ')})` : 'Weekly';
  }
  return w.recurrence;
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ window: w }: { window: MaintenanceWindow }) {
  const status = getStatus(w);
  if (status === 'active') {
    return (
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
      </span>
    );
  }
  if (status === 'recurring') {
    return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 flex items-center gap-1"><RefreshCw className="w-3 h-3" />{recurrenceLabel(w)}</Badge>;
  }
  if (status === 'upcoming') {
    return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Upcoming</Badge>;
  }
  return <Badge className="bg-text-secondary/20 text-text-secondary border-text-secondary/30">Past</Badge>;
}

// ─── UpcomingWidget ───────────────────────────────────────────────────────────

function UpcomingWidget({ windows }: { windows: MaintenanceWindow[] }) {
  const upcoming = windows
    .filter((w) => getStatus(w) === 'upcoming' || getStatus(w) === 'recurring')
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 3);

  if (upcoming.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-blue-400">Upcoming & Recurring Maintenance</h3>
      </div>
      <div className="space-y-2">
        {upcoming.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-primary truncate block">{w.name}</span>
                {w.recurrence !== 'NONE' && (
                  <span className="text-xs text-purple-400 flex items-center gap-0.5">
                    <RefreshCw className="w-2.5 h-2.5" /> {w.recurrence.toLowerCase()}
                  </span>
                )}
              </div>
              <span className="text-xs text-text-secondary">
                {w.recurrence !== 'NONE' ? (
                  <>
                    Starting {new Date(w.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} UTC
                    {' · '}{formatWindowDuration(w)}
                  </>
                ) : (
                  <>
                    {new Date(w.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                    at {new Date(w.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{formatWindowDuration(w)}
                  </>
                )}
              </span>
            </div>
            <span className="text-xs text-text-secondary flex-shrink-0">
              {w.monitorCount > 0 ? `${w.monitorCount} monitor${w.monitorCount !== 1 ? 's' : ''}` : 'All monitors'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MonitorPicker ────────────────────────────────────────────────────────────

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
      <label className="block text-sm font-medium text-text-secondary mb-1.5">
        Affected monitors <span className="text-text-secondary/50">(optional — empty means all monitors)</span>
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
              <span className="text-xs text-text-secondary flex-shrink-0">{m.type.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── RecurrenceForm ───────────────────────────────────────────────────────────

type RecurrenceState = {
  recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  recurrenceDays: string[];
  recurrenceEndsAt: string;
};

function RecurrenceForm({
  value,
  onChange,
}: {
  value: RecurrenceState;
  onChange: (v: RecurrenceState) => void;
}) {
  function toggleDay(d: string) {
    const current = value.recurrenceDays;
    onChange({
      ...value,
      recurrenceDays: current.includes(d) ? current.filter((x) => x !== d) : [...current, d],
    });
  }

  return (
    <div className="space-y-3 pt-1">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">Recurrence</label>
        <select
          className={selectClass}
          value={value.recurrence}
          onChange={(e) => onChange({ ...value, recurrence: e.target.value as RecurrenceState['recurrence'] })}
        >
          <option value="NONE">One-time (no recurrence)</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly (same day each month)</option>
        </select>
      </div>

      {value.recurrence === 'WEEKLY' && (
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Active days</label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS_OF_WEEK.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  value.recurrenceDays.includes(d.value)
                    ? 'bg-accent text-white'
                    : 'bg-surface border border-border text-text-secondary hover:bg-surface-elevated'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {value.recurrence !== 'NONE' && (
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            End recurrence on <span className="text-text-secondary/50">(optional)</span>
          </label>
          <input
            type="date"
            className={inputClass}
            value={value.recurrenceEndsAt}
            onChange={(e) => onChange({ ...value, recurrenceEndsAt: e.target.value })}
          />
          <p className="text-xs text-text-secondary mt-1">
            After this date, no new occurrences will be active. Leave blank for indefinite recurrence.
          </p>
        </div>
      )}

      {value.recurrence !== 'NONE' && (
        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 text-xs text-purple-300">
          <RefreshCw className="w-3 h-3 inline-block mr-1 mb-0.5" />
          {value.recurrence === 'DAILY' && 'Alerts will be suppressed at the configured start time every day.'}
          {value.recurrence === 'WEEKLY' && (
            value.recurrenceDays.length === 0
              ? 'Select at least one day of the week for weekly recurrence.'
              : `Alerts suppressed every ${value.recurrenceDays.map(d => DAYS_OF_WEEK.find(x => x.value === d)?.label).join(', ')} during the maintenance window.`
          )}
          {value.recurrence === 'MONTHLY' && 'Alerts suppressed on the same day each month during the maintenance window.'}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const defaultRecurrence: RecurrenceState = {
  recurrence: 'NONE',
  recurrenceDays: [],
  recurrenceEndsAt: '',
};

export default function MaintenancePage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [windows, setWindows] = useState<MaintenanceWindow[]>([]);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('25');
  const { sort, toggle, sorted } = useTableSort<'name' | 'startsAt' | 'endsAt' | 'monitorCount'>('startsAt');

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', startsAt: '', endsAt: '' });
  const [createMonitorIds, setCreateMonitorIds] = useState<string[]>([]);
  const [createRecurrence, setCreateRecurrence] = useState<RecurrenceState>(defaultRecurrence);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<MaintenanceWindow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', startsAt: '', endsAt: '' });
  const [editMonitorIds, setEditMonitorIds] = useState<string[]>([]);
  const [editRecurrence, setEditRecurrence] = useState<RecurrenceState>(defaultRecurrence);

  useEffect(() => {
    const user = getUser();
    if (!user) router.push('/login');
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      const [windowsData, monitorsData] = await Promise.all([
        api<MaintenanceWindow[]>('/v1/maintenance'),
        api<MonitorOption[]>('/v1/monitors'),
      ]);
      setWindows(windowsData);
      setMonitors(monitorsData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => router.push('/login'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function resetCreateForm() {
    setForm({ name: '', description: '', startsAt: '', endsAt: '' });
    setCreateMonitorIds([]);
    setCreateRecurrence(defaultRecurrence);
  }

  async function createWindow() {
    try {
      const recurrenceDaysStr = createRecurrence.recurrenceDays.sort().join(',') || undefined;
      await api('/v1/maintenance', undefined, {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          monitorIds: createMonitorIds.length > 0 ? createMonitorIds : undefined,
          recurrence: createRecurrence.recurrence,
          recurrenceDays: recurrenceDaysStr,
          recurrenceEndsAt: createRecurrence.recurrenceEndsAt
            ? new Date(createRecurrence.recurrenceEndsAt).toISOString()
            : undefined,
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
    setEditMonitorIds(w.monitorIds ?? []);
    setEditRecurrence({
      recurrence: w.recurrence ?? 'NONE',
      recurrenceDays: w.recurrenceDays ? w.recurrenceDays.split(',') : [],
      recurrenceEndsAt: w.recurrenceEndsAt ? w.recurrenceEndsAt.substring(0, 10) : '',
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selected) return;
    try {
      const recurrenceDaysStr = editRecurrence.recurrenceDays.sort().join(',') || undefined;
      await api(`/v1/maintenance/${selected.id}`, '', {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description || undefined,
          startsAt: new Date(editForm.startsAt).toISOString(),
          endsAt: new Date(editForm.endsAt).toISOString(),
          monitorIds: editMonitorIds,
          recurrence: editRecurrence.recurrence,
          recurrenceDays: recurrenceDaysStr,
          recurrenceEndsAt: editRecurrence.recurrenceEndsAt
            ? new Date(editRecurrence.recurrenceEndsAt).toISOString()
            : null,
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

  const formFields = (
    f: typeof form,
    setF: (v: typeof form) => void,
    monitorIds: string[],
    setMonitorIds: (v: string[]) => void,
    recurrenceState: RecurrenceState,
    setRecurrenceState: (v: RecurrenceState) => void,
  ) => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">Name <span className="text-danger">*</span></label>
        <input
          className={inputClass}
          placeholder="e.g. Database migration"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">Description <span className="text-text-secondary/50">(optional)</span></label>
        <textarea
          className={`${inputClass} resize-none`}
          rows={2}
          placeholder="Brief description of the maintenance"
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            {recurrenceState.recurrence !== 'NONE' ? 'First occurrence start' : 'Starts at'} <span className="text-danger">*</span>
          </label>
          <input
            type="datetime-local"
            className={inputClass}
            value={f.startsAt}
            onChange={(e) => setF({ ...f, startsAt: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            {recurrenceState.recurrence !== 'NONE' ? 'First occurrence end' : 'Ends at'} <span className="text-danger">*</span>
          </label>
          <input
            type="datetime-local"
            className={inputClass}
            value={f.endsAt}
            onChange={(e) => setF({ ...f, endsAt: e.target.value })}
          />
        </div>
      </div>
      {recurrenceState.recurrence !== 'NONE' && (
        <p className="text-xs text-text-secondary -mt-1">
          The start/end times define the <em>daily time window</em> for each recurring occurrence (by time-of-day only).
        </p>
      )}
      <RecurrenceForm value={recurrenceState} onChange={setRecurrenceState} />
      <MonitorPicker monitors={monitors} selectedIds={monitorIds} onChange={setMonitorIds} />
    </div>
  );

  return (
    <AppFrame title="Maintenance" subtitle="Schedule one-time or recurring maintenance windows to suppress alerts during planned downtime." breadcrumbs={[{ label: 'Maintenance' }]}>
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
                <Button onClick={createWindow} disabled={!form.name || !form.startsAt || !form.endsAt}>Create window</Button>
              </>
            }
          >
            {formFields(form, setForm, createMonitorIds, setCreateMonitorIds, createRecurrence, setCreateRecurrence)}
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
            {formFields(editForm, setEditForm, editMonitorIds, setEditMonitorIds, editRecurrence, setEditRecurrence)}
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
            <p className="text-text-primary">
              Delete <strong>{selected?.name}</strong>?
              {selected && selected.recurrence !== 'NONE' && (
                <span className="text-text-secondary"> This is a recurring window — all future occurrences will be removed.</span>
              )}
              {' '}This cannot be undone.
            </p>
          </Modal>

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Maintenance Windows</h2>
              <p className="text-text-secondary text-sm mt-1">
                {windows.length} {windows.length === 1 ? 'window' : 'windows'} ·{' '}
                {windows.filter(w => w.recurrence !== 'NONE').length} recurring
              </p>
            </div>
            <Button size="lg" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
              <span className="flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Schedule window</span>
            </Button>
          </div>

          {windows.length === 0 ? (
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <Calendar className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No maintenance windows scheduled</p>
              <p className="text-text-secondary text-sm mb-6">
                Schedule one-time or recurring maintenance windows to suppress alerts during planned downtime.
                <br />
                <span className="text-purple-400">Recurring windows</span> support daily, weekly, or monthly patterns.
              </p>
              <Button size="lg" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Schedule Window</span>
              </Button>
            </Card>
          ) : (
            <>
              <UpcomingWidget windows={windows} />
              <Card className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHead>
                      <tr className="bg-surface-elevated border-b border-border">
                        <SortableHeader sortKey="name" sort={sort} onSort={toggle}>Name</SortableHeader>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Status</th>
                        <SortableHeader sortKey="startsAt" sort={sort} onSort={toggle}>Start</SortableHeader>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Duration</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider hidden md:table-cell">Recurrence</th>
                        <SortableHeader sortKey="monitorCount" sort={sort} onSort={toggle}>Monitors</SortableHeader>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Actions</th>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {sorted(windows, (w) => {
                        if (sort.key === 'name') return w.name;
                        if (sort.key === 'startsAt') return w.startsAt;
                        if (sort.key === 'endsAt') return w.endsAt;
                        if (sort.key === 'monitorCount') return w.monitorCount;
                        return w.startsAt;
                      })
                        .slice(
                          (Math.min(page, Math.max(1, Math.ceil(windows.length / Number(pageSize)))) - 1) * Number(pageSize),
                          Math.min(page, Math.max(1, Math.ceil(windows.length / Number(pageSize)))) * Number(pageSize),
                        )
                        .map((w) => (
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
                            <TableCell>
                              <div className="text-sm">
                                {w.recurrence !== 'NONE' ? (
                                  <span className="text-text-secondary">
                                    {new Date(w.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} UTC daily
                                  </span>
                                ) : (
                                  new Date(w.startsAt).toLocaleString()
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <span className="text-text-secondary">{formatWindowDuration(w)}</span>
                                {w.isActive && (
                                  <p className="text-xs text-green-400 mt-0.5">{formatEndsIn(w)}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {w.recurrence !== 'NONE' ? (
                                <span className="text-xs text-purple-400 flex items-center gap-1">
                                  <RefreshCw className="w-3 h-3" />
                                  {recurrenceLabel(w)}
                                  {w.recurrenceEndsAt && (
                                    <span className="text-text-secondary ml-1">
                                      until {new Date(w.recurrenceEndsAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-text-secondary text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {w.monitorCount > 0 ? (
                                <Badge>{`${w.monitorCount} affected`}</Badge>
                              ) : (
                                <Badge className="bg-text-secondary/10 text-text-secondary/70 border-text-secondary/20">All</Badge>
                              )}
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
                  <TablePagination
                    page={Math.min(page, Math.max(1, Math.ceil(windows.length / Number(pageSize))))}
                    pageCount={Math.max(1, Math.ceil(windows.length / Number(pageSize)))}
                    pageSize={pageSize}
                    totalItems={windows.length}
                    onPage={setPage}
                    onPageSize={(s) => { setPageSize(s); setPage(1); }}
                    pageSizeOptions={[10, 25, 50, 100]}
                    onExportCSV={() => exportCSV('maintenance-windows.csv', windows.map((w) => ({
                      id: w.id, name: w.name, description: w.description ?? '', startsAt: w.startsAt,
                      endsAt: w.endsAt, recurrence: w.recurrence, recurrenceDays: w.recurrenceDays ?? '',
                      durationMinutes: w.durationMinutes ?? '', monitorCount: w.monitorCount, isActive: w.isActive,
                    })))}
                    onExportJSON={() => exportJSON('maintenance-windows.json', windows)}
                  />
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </AppFrame>
  );
}
