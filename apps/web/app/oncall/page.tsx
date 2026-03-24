'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit, Trash2, Plus, UserCog, ShieldAlert, PhoneCall } from 'lucide-react';
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

/* ── Types ── */

type Participant = {
  id: string;
  userId: string;
  order: number;
  user?: { id: string; name: string; email: string };
};

type Schedule = {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  rotationDays: number;
  participants: Participant[];
  currentOnCall?: { id: string; name: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
};

type EscalationPolicy = {
  id: string;
  name: string;
  description: string | null;
  scheduleId: string | null;
  schedule?: { id: string; name: string } | null;
  escalateAfterMin: number;
  maxEscalations: number;
  createdAt: string;
  updatedAt: string;
};

const inputClass =
  'w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
];

type Tab = 'schedules' | 'policies';

export default function OnCallPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [tab, setTab] = useState<Tab>('schedules');
  const [loading, setLoading] = useState(true);

  /* ── Schedules state ── */
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schPage, setSchPage] = useState(1);
  const [schPageSize, setSchPageSize] = useState('25');
  const schSort = useTableSort<'name' | 'timezone' | 'rotationDays'>('name');

  const [schCreateOpen, setSchCreateOpen] = useState(false);
  const [schForm, setSchForm] = useState({ name: '', description: '', timezone: 'UTC', rotationDays: '7' });

  const [schEditOpen, setSchEditOpen] = useState(false);
  const [schSelected, setSchSelected] = useState<Schedule | null>(null);
  const [schEditForm, setSchEditForm] = useState({ name: '', description: '', timezone: 'UTC', rotationDays: '7' });

  const [schDeleteOpen, setSchDeleteOpen] = useState(false);

  /* ── Policies state ── */
  const [policies, setPolicies] = useState<EscalationPolicy[]>([]);
  const [polPage, setPolPage] = useState(1);
  const [polPageSize, setPolPageSize] = useState('25');
  const polSort = useTableSort<'name' | 'escalateAfterMin' | 'maxEscalations'>('name');

  const [polCreateOpen, setPolCreateOpen] = useState(false);
  const [polForm, setPolForm] = useState({ name: '', description: '', scheduleId: '', escalateAfterMin: '30', maxEscalations: '3' });

  const [polEditOpen, setPolEditOpen] = useState(false);
  const [polSelected, setPolSelected] = useState<EscalationPolicy | null>(null);
  const [polEditForm, setPolEditForm] = useState({ name: '', description: '', scheduleId: '', escalateAfterMin: '30', maxEscalations: '3' });

  const [polDeleteOpen, setPolDeleteOpen] = useState(false);

  /* ── Auth ── */
  useEffect(() => {
    const user = getUser();
    if (!user) router.push('/login');
  }, [router]);

  /* ── Data loading ── */
  async function load() {
    setLoading(true);
    try {
      const [schedulesData, policiesData] = await Promise.all([
        api<Schedule[]>('/v1/oncall/schedules'),
        api<EscalationPolicy[]>('/v1/oncall/policies'),
      ]);
      setSchedules(schedulesData);
      setPolicies(policiesData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => router.push('/login'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Schedule CRUD ── */
  function resetSchForm() {
    setSchForm({ name: '', description: '', timezone: 'UTC', rotationDays: '7' });
  }

  async function createSchedule() {
    try {
      await api('/v1/oncall/schedules', undefined, {
        method: 'POST',
        body: JSON.stringify({
          name: schForm.name,
          description: schForm.description || undefined,
          timezone: schForm.timezone,
          rotationDays: Number(schForm.rotationDays) || 7,
        }),
      });
      setSchCreateOpen(false);
      resetSchForm();
      await load();
      success('Schedule created');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create schedule');
    }
  }

  function openSchEdit(s: Schedule) {
    setSchSelected(s);
    setSchEditForm({
      name: s.name,
      description: s.description ?? '',
      timezone: s.timezone,
      rotationDays: String(s.rotationDays),
    });
    setSchEditOpen(true);
  }

  async function saveSchEdit() {
    if (!schSelected) return;
    try {
      await api(`/v1/oncall/schedules/${schSelected.id}`, '', {
        method: 'PATCH',
        body: JSON.stringify({
          name: schEditForm.name,
          description: schEditForm.description || undefined,
          timezone: schEditForm.timezone,
          rotationDays: Number(schEditForm.rotationDays) || 7,
        }),
      });
      setSchEditOpen(false);
      await load();
      success('Schedule updated');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to update schedule');
    }
  }

  function openSchDelete(s: Schedule) {
    setSchSelected(s);
    setSchDeleteOpen(true);
  }

  async function confirmSchDelete() {
    if (!schSelected) return;
    try {
      await api(`/v1/oncall/schedules/${schSelected.id}`, '', { method: 'DELETE' });
      setSchDeleteOpen(false);
      await load();
      success('Schedule deleted');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to delete schedule');
    }
  }

  /* ── Policy CRUD ── */
  function resetPolForm() {
    setPolForm({ name: '', description: '', scheduleId: '', escalateAfterMin: '30', maxEscalations: '3' });
  }

  async function createPolicy() {
    try {
      await api('/v1/oncall/policies', undefined, {
        method: 'POST',
        body: JSON.stringify({
          name: polForm.name,
          description: polForm.description || undefined,
          scheduleId: polForm.scheduleId || undefined,
          escalateAfterMin: Number(polForm.escalateAfterMin) || 30,
          maxEscalations: Number(polForm.maxEscalations) || 3,
        }),
      });
      setPolCreateOpen(false);
      resetPolForm();
      await load();
      success('Escalation policy created');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create escalation policy');
    }
  }

  function openPolEdit(p: EscalationPolicy) {
    setPolSelected(p);
    setPolEditForm({
      name: p.name,
      description: p.description ?? '',
      scheduleId: p.scheduleId ?? '',
      escalateAfterMin: String(p.escalateAfterMin),
      maxEscalations: String(p.maxEscalations),
    });
    setPolEditOpen(true);
  }

  async function savePolEdit() {
    if (!polSelected) return;
    try {
      await api(`/v1/oncall/policies/${polSelected.id}`, '', {
        method: 'PATCH',
        body: JSON.stringify({
          name: polEditForm.name,
          description: polEditForm.description || undefined,
          scheduleId: polEditForm.scheduleId || undefined,
          escalateAfterMin: Number(polEditForm.escalateAfterMin) || 30,
          maxEscalations: Number(polEditForm.maxEscalations) || 3,
        }),
      });
      setPolEditOpen(false);
      await load();
      success('Escalation policy updated');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to update escalation policy');
    }
  }

  function openPolDelete(p: EscalationPolicy) {
    setPolSelected(p);
    setPolDeleteOpen(true);
  }

  async function confirmPolDelete() {
    if (!polSelected) return;
    try {
      await api(`/v1/oncall/policies/${polSelected.id}`, '', { method: 'DELETE' });
      setPolDeleteOpen(false);
      await load();
      success('Escalation policy deleted');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to delete escalation policy');
    }
  }

  /* ── Pagination helpers ── */
  const schPageCount = Math.max(1, Math.ceil(schedules.length / Number(schPageSize)));
  const schCurrentPage = Math.min(schPage, schPageCount);
  const schSlice = schSort.sorted(schedules, (s) => {
    if (schSort.sort.key === 'name') return s.name;
    if (schSort.sort.key === 'timezone') return s.timezone;
    if (schSort.sort.key === 'rotationDays') return s.rotationDays;
    return s.name;
  }).slice((schCurrentPage - 1) * Number(schPageSize), schCurrentPage * Number(schPageSize));

  const polPageCount = Math.max(1, Math.ceil(policies.length / Number(polPageSize)));
  const polCurrentPage = Math.min(polPage, polPageCount);
  const polSlice = polSort.sorted(policies, (p) => {
    if (polSort.sort.key === 'name') return p.name;
    if (polSort.sort.key === 'escalateAfterMin') return p.escalateAfterMin;
    if (polSort.sort.key === 'maxEscalations') return p.maxEscalations;
    return p.name;
  }).slice((polCurrentPage - 1) * Number(polPageSize), polCurrentPage * Number(polPageSize));

  /* ── Schedule form fields ── */
  function ScheduleFormFields({ form: f, onChange }: { form: typeof schForm; onChange: (v: typeof schForm) => void }) {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
          <input className={inputClass} placeholder="e.g. Primary On-Call" value={f.name} onChange={(e) => onChange({ ...f, name: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Description <span className="text-text-secondary/50">(optional)</span></label>
          <textarea className={`${inputClass} resize-none`} rows={3} placeholder="Brief description of this schedule" value={f.description} onChange={(e) => onChange({ ...f, description: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Timezone</label>
          <select className={inputClass} value={f.timezone} onChange={(e) => onChange({ ...f, timezone: e.target.value })}>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Rotation (days)</label>
          <input type="number" min={1} max={365} className={inputClass} value={f.rotationDays} onChange={(e) => onChange({ ...f, rotationDays: e.target.value })} />
        </div>
      </div>
    );
  }

  /* ── Policy form fields ── */
  function PolicyFormFields({ form: f, onChange }: { form: typeof polForm; onChange: (v: typeof polForm) => void }) {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
          <input className={inputClass} placeholder="e.g. Default Escalation" value={f.name} onChange={(e) => onChange({ ...f, name: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Description <span className="text-text-secondary/50">(optional)</span></label>
          <textarea className={`${inputClass} resize-none`} rows={3} placeholder="Brief description of this policy" value={f.description} onChange={(e) => onChange({ ...f, description: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Linked Schedule</label>
          <select className={inputClass} value={f.scheduleId} onChange={(e) => onChange({ ...f, scheduleId: e.target.value })}>
            <option value="">— None —</option>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Escalate After (minutes)</label>
          <input type="number" min={1} className={inputClass} value={f.escalateAfterMin} onChange={(e) => onChange({ ...f, escalateAfterMin: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Max Escalations</label>
          <input type="number" min={0} className={inputClass} value={f.maxEscalations} onChange={(e) => onChange({ ...f, maxEscalations: e.target.value })} />
        </div>
      </div>
    );
  }

  return (
    <AppFrame title="On-Call" subtitle="Manage on-call schedules and escalation policies." breadcrumbs={[{ label: 'On-Call' }]}>
      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ── Schedule Modals ── */}
          <Modal
            isOpen={schCreateOpen}
            onClose={() => { setSchCreateOpen(false); resetSchForm(); }}
            title="Create on-call schedule"
            actions={<><Button variant="secondary" onClick={() => { setSchCreateOpen(false); resetSchForm(); }}>Cancel</Button><Button onClick={createSchedule}>Create</Button></>}
          >
            <ScheduleFormFields form={schForm} onChange={setSchForm} />
          </Modal>

          <Modal
            isOpen={schEditOpen}
            onClose={() => setSchEditOpen(false)}
            title="Edit schedule"
            actions={<><Button variant="secondary" onClick={() => setSchEditOpen(false)}>Cancel</Button><Button onClick={saveSchEdit}>Save</Button></>}
          >
            <ScheduleFormFields form={schEditForm} onChange={setSchEditForm} />
          </Modal>

          <Modal
            isOpen={schDeleteOpen}
            onClose={() => setSchDeleteOpen(false)}
            title="Delete schedule"
            actions={<><Button variant="secondary" onClick={() => setSchDeleteOpen(false)}>Cancel</Button><Button variant="primary" className="!bg-danger hover:!bg-danger/80" onClick={confirmSchDelete}>Delete</Button></>}
          >
            <p className="text-text-primary">Delete <strong>{schSelected?.name}</strong>? This cannot be undone.</p>
          </Modal>

          {/* ── Policy Modals ── */}
          <Modal
            isOpen={polCreateOpen}
            onClose={() => { setPolCreateOpen(false); resetPolForm(); }}
            title="Create escalation policy"
            actions={<><Button variant="secondary" onClick={() => { setPolCreateOpen(false); resetPolForm(); }}>Cancel</Button><Button onClick={createPolicy}>Create</Button></>}
          >
            <PolicyFormFields form={polForm} onChange={setPolForm} />
          </Modal>

          <Modal
            isOpen={polEditOpen}
            onClose={() => setPolEditOpen(false)}
            title="Edit escalation policy"
            actions={<><Button variant="secondary" onClick={() => setPolEditOpen(false)}>Cancel</Button><Button onClick={savePolEdit}>Save</Button></>}
          >
            <PolicyFormFields form={polEditForm} onChange={setPolEditForm} />
          </Modal>

          <Modal
            isOpen={polDeleteOpen}
            onClose={() => setPolDeleteOpen(false)}
            title="Delete escalation policy"
            actions={<><Button variant="secondary" onClick={() => setPolDeleteOpen(false)}>Cancel</Button><Button variant="primary" className="!bg-danger hover:!bg-danger/80" onClick={confirmPolDelete}>Delete</Button></>}
          >
            <p className="text-text-primary">Delete <strong>{polSelected?.name}</strong>? This cannot be undone.</p>
          </Modal>

          {/* ── Tabs ── */}
          <div className="flex items-center gap-1 mb-6 border-b border-border">
            <button
              onClick={() => setTab('schedules')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'schedules' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
            >
              <span className="flex items-center gap-2"><UserCog className="w-4 h-4" /> Schedules</span>
            </button>
            <button
              onClick={() => setTab('policies')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'policies' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
            >
              <span className="flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Escalation Policies</span>
            </button>
          </div>

          {/* ── Schedules Tab ── */}
          {tab === 'schedules' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-text-primary">On-Call Schedules</h2>
                  <p className="text-text-secondary text-sm mt-1">
                    {schedules.length} {schedules.length === 1 ? 'schedule' : 'schedules'}
                  </p>
                </div>
                <Button size="lg" onClick={() => { resetSchForm(); setSchCreateOpen(true); }}>
                  <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create Schedule</span>
                </Button>
              </div>

              {schedules.length === 0 ? (
                <Card className="text-center py-16">
                  <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                    <UserCog className="w-12 h-12 text-text-secondary opacity-50" />
                  </div>
                  <p className="text-text-primary text-lg font-medium mb-2">No on-call schedules</p>
                  <p className="text-text-secondary text-sm mb-6">Create a schedule to define who is on call and when they rotate</p>
                  <Button size="lg" onClick={() => { resetSchForm(); setSchCreateOpen(true); }}>
                    <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create Schedule</span>
                  </Button>
                </Card>
              ) : (
                <Card className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHead>
                        <tr className="bg-surface-elevated border-b border-border">
                          <SortableHeader sortKey="name" sort={schSort.sort} onSort={schSort.toggle}>Name</SortableHeader>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Description</th>
                          <SortableHeader sortKey="timezone" sort={schSort.sort} onSort={schSort.toggle}>Timezone</SortableHeader>
                          <SortableHeader sortKey="rotationDays" sort={schSort.sort} onSort={schSort.toggle}>Rotation</SortableHeader>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Participants</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Current On-Call</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Actions</th>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {schSlice.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell><span className="font-medium text-text-primary">{s.name}</span></TableCell>
                            <TableCell>
                              {s.description ? (
                                <span className="text-text-secondary text-sm max-w-xs truncate block">{s.description}</span>
                              ) : (
                                <span className="text-text-secondary text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell><Badge>{s.timezone}</Badge></TableCell>
                            <TableCell><span className="text-text-primary">{s.rotationDays} {s.rotationDays === 1 ? 'day' : 'days'}</span></TableCell>
                            <TableCell>
                              {s.participants && s.participants.length > 0 ? (
                                <Badge>{String(s.participants.length)}</Badge>
                              ) : (
                                <span className="text-text-secondary text-sm">0</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {s.currentOnCall ? (
                                <span className="text-text-primary font-medium">{s.currentOnCall.name}</span>
                              ) : (
                                <span className="text-text-secondary text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" onClick={() => openSchEdit(s)} aria-label={`Edit ${s.name}`} title="Edit schedule">
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => openSchDelete(s)} className="text-danger hover:text-danger" aria-label={`Delete ${s.name}`} title="Delete schedule">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <TablePagination
                      page={schCurrentPage}
                      pageCount={schPageCount}
                      pageSize={schPageSize}
                      totalItems={schedules.length}
                      onPage={setSchPage}
                      onPageSize={(s) => { setSchPageSize(s); setSchPage(1); }}
                      pageSizeOptions={[10, 25, 50, 100]}
                      onExportCSV={() => exportCSV('oncall-schedules.csv', schedules.map((s) => ({
                        id: s.id, name: s.name, description: s.description ?? '', timezone: s.timezone,
                        rotationDays: s.rotationDays, participants: s.participants?.length ?? 0,
                      })))}
                      onExportJSON={() => exportJSON('oncall-schedules.json', schedules)}
                    />
                  </div>
                </Card>
              )}
            </>
          )}

          {/* ── Escalation Policies Tab ── */}
          {tab === 'policies' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-text-primary">Escalation Policies</h2>
                  <p className="text-text-secondary text-sm mt-1">
                    {policies.length} {policies.length === 1 ? 'policy' : 'policies'}
                  </p>
                </div>
                <Button size="lg" onClick={() => { resetPolForm(); setPolCreateOpen(true); }}>
                  <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create Policy</span>
                </Button>
              </div>

              {policies.length === 0 ? (
                <Card className="text-center py-16">
                  <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                    <ShieldAlert className="w-12 h-12 text-text-secondary opacity-50" />
                  </div>
                  <p className="text-text-primary text-lg font-medium mb-2">No escalation policies</p>
                  <p className="text-text-secondary text-sm mb-6">Create a policy to define how incidents escalate when not acknowledged</p>
                  <Button size="lg" onClick={() => { resetPolForm(); setPolCreateOpen(true); }}>
                    <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create Policy</span>
                  </Button>
                </Card>
              ) : (
                <Card className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHead>
                        <tr className="bg-surface-elevated border-b border-border">
                          <SortableHeader sortKey="name" sort={polSort.sort} onSort={polSort.toggle}>Name</SortableHeader>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Description</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Schedule</th>
                          <SortableHeader sortKey="escalateAfterMin" sort={polSort.sort} onSort={polSort.toggle}>Escalate After</SortableHeader>
                          <SortableHeader sortKey="maxEscalations" sort={polSort.sort} onSort={polSort.toggle}>Max Escalations</SortableHeader>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Actions</th>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {polSlice.map((p) => {
                          const linkedSchedule = schedules.find((s) => s.id === p.scheduleId);
                          return (
                            <TableRow key={p.id}>
                              <TableCell><span className="font-medium text-text-primary">{p.name}</span></TableCell>
                              <TableCell>
                                {p.description ? (
                                  <span className="text-text-secondary text-sm max-w-xs truncate block">{p.description}</span>
                                ) : (
                                  <span className="text-text-secondary text-sm">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {linkedSchedule ? (
                                  <Badge>{linkedSchedule.name}</Badge>
                                ) : p.schedule ? (
                                  <Badge>{p.schedule.name}</Badge>
                                ) : (
                                  <span className="text-text-secondary text-sm">—</span>
                                )}
                              </TableCell>
                              <TableCell><span className="text-text-primary">{p.escalateAfterMin} min</span></TableCell>
                              <TableCell><span className="text-text-primary">{p.maxEscalations}</span></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => openPolEdit(p)} aria-label={`Edit ${p.name}`} title="Edit policy">
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => openPolDelete(p)} className="text-danger hover:text-danger" aria-label={`Delete ${p.name}`} title="Delete policy">
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
                      page={polCurrentPage}
                      pageCount={polPageCount}
                      pageSize={polPageSize}
                      totalItems={policies.length}
                      onPage={setPolPage}
                      onPageSize={(s) => { setPolPageSize(s); setPolPage(1); }}
                      pageSizeOptions={[10, 25, 50, 100]}
                      onExportCSV={() => exportCSV('escalation-policies.csv', policies.map((p) => ({
                        id: p.id, name: p.name, description: p.description ?? '',
                        scheduleId: p.scheduleId ?? '', escalateAfterMin: p.escalateAfterMin,
                        maxEscalations: p.maxEscalations,
                      })))}
                      onExportJSON={() => exportJSON('escalation-policies.json', policies)}
                    />
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </AppFrame>
  );
}
