'use client';

import { useEffect, useState } from 'react';
import {
  PhoneCall, Plus, Clock, Users, RefreshCw, Trash2, Edit, ChevronDown,
  ChevronUp, AlertTriangle, Settings, MoreHorizontal, UserPlus, Shield,
} from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui/toast';

// ─── Types ────────────────────────────────────────────────────────────────

type Participant = {
  id: string;
  userId: string;
  order: number;
};

type EscalationStep = {
  id: string;
  stepOrder: number;
  waitMinutes: number;
  notifyEmail: string | null;
};

type EscalationPolicy = {
  id: string;
  name: string;
  description: string | null;
  scheduleId: string | null;
  escalateAfterMin: number;
  maxEscalations: number;
  steps: EscalationStep[];
  schedule: { id: string; name: string } | null;
};

type OnCallSchedule = {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  rotationDays: number;
  createdAt: string;
  updatedAt: string;
  participants: Participant[];
  currentOnCall: Participant | null;
  policies: { id: string; name: string }[];
};

type Tab = 'schedules' | 'policies';

// ─── Main Page ────────────────────────────────────────────────────────────

export default function OnCallPage() {
  const [tab, setTab] = useState<Tab>('schedules');
  const [schedules, setSchedules] = useState<OnCallSchedule[]>([]);
  const [policies, setPolicies] = useState<EscalationPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateSchedule, setShowCreateSchedule] = useState(false);
  const [showCreatePolicy, setShowCreatePolicy] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<OnCallSchedule | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<EscalationPolicy | null>(null);
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null);
  const { success, error: toastError } = useToast();

  useEffect(() => {
    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [scheds, pols] = await Promise.all([
        loadSchedules(),
        loadPolicies(),
      ]);
      setSchedules(scheds);
      setPolicies(pols);
    } catch {
      toastError('Failed to load on-call data');
    } finally {
      setLoading(false);
    }
  }

  async function loadSchedules(): Promise<OnCallSchedule[]> {
    const data = await api<OnCallSchedule[]>('/oncall/schedules');
    const enriched = await Promise.all(
      data.map(async (s) => {
        try {
          return await api<OnCallSchedule>(`/oncall/schedules/${s.id}`);
        } catch {
          return { ...s, currentOnCall: null };
        }
      }),
    );
    return enriched;
  }

  async function loadPolicies(): Promise<EscalationPolicy[]> {
    return api<EscalationPolicy[]>('/oncall/policies');
  }

  async function deleteSchedule(id: string) {
    if (!confirm('Delete this on-call schedule? This cannot be undone.')) return;
    try {
      await api(`/oncall/schedules/${id}`, undefined, { method: 'DELETE' });
      setSchedules((s) => s.filter((x) => x.id !== id));
      success('Schedule deleted');
    } catch {
      toastError('Failed to delete schedule');
    }
  }

  async function deletePolicy(id: string) {
    if (!confirm('Delete this escalation policy? This cannot be undone.')) return;
    try {
      await api(`/oncall/policies/${id}`, undefined, { method: 'DELETE' });
      setPolicies((p) => p.filter((x) => x.id !== id));
      success('Policy deleted');
    } catch {
      toastError('Failed to delete policy');
    }
  }

  async function addParticipant(scheduleId: string, userId: string, order: number) {
    try {
      await api(`/oncall/schedules/${scheduleId}/participants`, undefined, {
        method: 'POST',
        body: JSON.stringify({ userId, order }),
      });
      const updated = await api<OnCallSchedule>(`/oncall/schedules/${scheduleId}`);
      setSchedules((s) => s.map((x) => (x.id === scheduleId ? updated : x)));
      success('Participant added');
    } catch {
      toastError('Failed to add participant');
    }
  }

  async function removeParticipant(scheduleId: string, participantId: string) {
    try {
      await api(`/oncall/schedules/${scheduleId}/participants/${participantId}`, undefined, {
        method: 'DELETE',
      });
      const updated = await api<OnCallSchedule>(`/oncall/schedules/${scheduleId}`);
      setSchedules((s) => s.map((x) => (x.id === scheduleId ? updated : x)));
      success('Participant removed');
    } catch {
      toastError('Failed to remove participant');
    }
  }

  return (
    <AppFrame
      title="On-Call"
      subtitle="Manage rotation schedules and escalation policies."
      breadcrumbs={[{ label: 'On-Call' }]}
    >
      <div className="space-y-6">
        {/* Tab bar + actions */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex bg-surface-elevated border border-border rounded-lg p-1 gap-1">
            <button
              onClick={() => setTab('schedules')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                tab === 'schedules'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Schedules
              </span>
            </button>
            <button
              onClick={() => setTab('policies')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                tab === 'policies'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Escalation Policies
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadAll}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {tab === 'schedules' ? (
              <Button onClick={() => setShowCreateSchedule(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                New Schedule
              </Button>
            ) : (
              <Button onClick={() => setShowCreatePolicy(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                New Policy
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="p-6 animate-pulse">
                <div className="h-5 bg-surface-elevated rounded w-3/4 mb-3" />
                <div className="h-4 bg-surface-elevated rounded w-1/2 mb-2" />
                <div className="h-4 bg-surface-elevated rounded w-2/3" />
              </Card>
            ))}
          </div>
        ) : tab === 'schedules' ? (
          schedules.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <div className="rounded-full bg-accent/10 p-5">
                <PhoneCall className="w-10 h-10 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">
                  No on-call schedules yet
                </h2>
                <p className="text-text-secondary max-w-sm">
                  Create a rotation schedule to ensure your team is always covered when an alert fires.
                </p>
              </div>
              <Button onClick={() => setShowCreateSchedule(true)} className="gap-2 mt-2">
                <Plus className="w-4 h-4" />
                Create Your First Schedule
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {schedules.map((schedule) => (
                <ScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  expanded={expandedSchedule === schedule.id}
                  onToggleExpand={() =>
                    setExpandedSchedule((p) => (p === schedule.id ? null : schedule.id))
                  }
                  onEdit={() => setEditingSchedule(schedule)}
                  onDelete={() => deleteSchedule(schedule.id)}
                  onAddParticipant={(userId, order) =>
                    addParticipant(schedule.id, userId, order)
                  }
                  onRemoveParticipant={(participantId) =>
                    removeParticipant(schedule.id, participantId)
                  }
                />
              ))}
            </div>
          )
        ) : policies.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="rounded-full bg-amber-500/10 p-5">
              <AlertTriangle className="w-10 h-10 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary mb-1">
                No escalation policies yet
              </h2>
              <p className="text-text-secondary max-w-sm">
                Define escalation rules so alerts automatically notify the right people if not acknowledged.
              </p>
            </div>
            <Button onClick={() => setShowCreatePolicy(true)} className="gap-2 mt-2">
              <Plus className="w-4 h-4" />
              Create Your First Policy
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {policies.map((policy) => (
              <PolicyCard
                key={policy.id}
                policy={policy}
                onEdit={() => setEditingPolicy(policy)}
                onDelete={() => deletePolicy(policy.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Schedule Modal */}
      <ScheduleModal
        isOpen={showCreateSchedule || !!editingSchedule}
        initial={editingSchedule ?? undefined}
        onClose={() => {
          setShowCreateSchedule(false);
          setEditingSchedule(null);
        }}
        onSaved={async () => {
          setShowCreateSchedule(false);
          setEditingSchedule(null);
          const s = await loadSchedules();
          setSchedules(s);
        }}
      />

      {/* Create / Edit Policy Modal */}
      <PolicyModal
        isOpen={showCreatePolicy || !!editingPolicy}
        initial={editingPolicy ?? undefined}
        schedules={schedules}
        onClose={() => {
          setShowCreatePolicy(false);
          setEditingPolicy(null);
        }}
        onSaved={async () => {
          setShowCreatePolicy(false);
          setEditingPolicy(null);
          const p = await loadPolicies();
          setPolicies(p);
        }}
      />
    </AppFrame>
  );
}

// ─── Schedule Card ─────────────────────────────────────────────────────────

function ScheduleCard({
  schedule,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddParticipant,
  onRemoveParticipant,
}: {
  schedule: OnCallSchedule;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddParticipant: (userId: string, order: number) => Promise<void>;
  onRemoveParticipant: (participantId: string) => Promise<void>;
}) {
  const [addUserId, setAddUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const currentOnCall = schedule.currentOnCall;

  async function handleAdd() {
    if (!addUserId.trim()) return;
    setSaving(true);
    const nextOrder = schedule.participants.length;
    await onAddParticipant(addUserId.trim(), nextOrder);
    setAddUserId('');
    setSaving(false);
  }

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <div className="p-5 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-text-primary">{schedule.name}</h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20">
              {schedule.timezone}
            </span>
            {schedule.policies.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface-elevated text-text-secondary border border-border">
                {schedule.policies.length} polic{schedule.policies.length !== 1 ? 'ies' : 'y'}
              </span>
            )}
          </div>
          {schedule.description && (
            <p className="text-sm text-text-secondary mt-0.5 truncate">{schedule.description}</p>
          )}
        </div>

        {/* Current on-call badge */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {currentOnCall ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-xs font-medium text-green-400 truncate max-w-[120px]">
                {currentOnCall.userId}
              </span>
            </div>
          ) : (
            <span className="text-xs text-text-secondary px-3 py-1.5 rounded-lg bg-surface-elevated border border-border">
              No participants
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-2 rounded hover:bg-surface-elevated transition-colors text-text-secondary hover:text-text-primary"
            title="Edit schedule"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded hover:bg-red-500/10 transition-colors text-text-secondary hover:text-red-400"
            title="Delete schedule"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleExpand}
            className="p-2 rounded hover:bg-surface-elevated transition-colors text-text-secondary"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="px-5 pb-4 flex items-center gap-4 text-xs text-text-secondary border-b border-border">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {schedule.rotationDays}d rotation
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {schedule.participants.length} participant{schedule.participants.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Expanded: participant list + add form */}
      {expanded && (
        <div className="p-5 space-y-4 bg-surface-elevated/30">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <Users className="w-4 h-4" />
            Rotation Order
          </div>

          {schedule.participants.length === 0 ? (
            <p className="text-sm text-text-secondary">No participants yet. Add people below.</p>
          ) : (
            <div className="space-y-2">
              {[...schedule.participants]
                .sort((a, b) => a.order - b.order)
                .map((p, idx) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                      p.id === currentOnCall?.id
                        ? 'border-green-500/30 bg-green-500/5'
                        : 'border-border bg-surface-elevated'
                    }`}
                  >
                    <span className="text-xs font-mono text-text-secondary w-6 text-right shrink-0">
                      #{idx + 1}
                    </span>
                    {p.id === currentOnCall?.id && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                    )}
                    <span className="flex-1 text-sm text-text-primary truncate">{p.userId}</span>
                    {p.id === currentOnCall?.id && (
                      <span className="text-xs text-green-400 font-medium">On-call now</span>
                    )}
                    <button
                      onClick={() => onRemoveParticipant(p.id)}
                      className="p-1 rounded hover:bg-red-500/10 text-text-secondary hover:text-red-400 transition-colors"
                      title="Remove participant"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* Add participant */}
          <div className="flex gap-2">
            <input
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="User ID or email…"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!addUserId.trim() || saving}
              className="gap-1.5 shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Policy Card ───────────────────────────────────────────────────────────

function PolicyCard({
  policy,
  onEdit,
  onDelete,
}: {
  policy: EscalationPolicy;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-text-primary">{policy.name}</h3>
            {policy.schedule && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20">
                {policy.schedule.name}
              </span>
            )}
          </div>
          {policy.description && (
            <p className="text-sm text-text-secondary mt-0.5">{policy.description}</p>
          )}

          <div className="mt-3 flex items-center gap-4 text-xs text-text-secondary flex-wrap">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Escalate after {policy.escalateAfterMin}m
            </span>
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Max {policy.maxEscalations} escalation{policy.maxEscalations !== 1 ? 's' : ''}
            </span>
            {policy.steps.length > 0 && (
              <span className="flex items-center gap-1.5">
                <MoreHorizontal className="w-3.5 h-3.5" />
                {policy.steps.length} step{policy.steps.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Steps */}
          {policy.steps.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {policy.steps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-center gap-2 text-xs text-text-secondary"
                >
                  <span className="w-5 h-5 rounded-full bg-surface-elevated border border-border flex items-center justify-center font-mono text-[10px] shrink-0">
                    {step.stepOrder + 1}
                  </span>
                  <span>Wait {step.waitMinutes}m</span>
                  {step.notifyEmail && (
                    <>
                      <span>→</span>
                      <span className="text-accent">{step.notifyEmail}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-2 rounded hover:bg-surface-elevated transition-colors text-text-secondary hover:text-text-primary"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded hover:bg-red-500/10 transition-colors text-text-secondary hover:text-red-400"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─── Schedule Modal ────────────────────────────────────────────────────────

function ScheduleModal({
  isOpen,
  initial,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  initial?: OnCallSchedule;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [rotationDays, setRotationDays] = useState(7);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { success, error: toastError } = useToast();

  useEffect(() => {
    if (isOpen) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setTimezone(initial?.timezone ?? 'UTC');
      setRotationDays(initial?.rotationDays ?? 7);
      setErrors({});
    }
  }, [isOpen, initial]);

  async function handleSave() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (rotationDays < 1 || rotationDays > 365) e.rotationDays = 'Must be 1–365 days';
    if (Object.keys(e).length) { setErrors(e); return; }

    setSaving(true);
    try {
      const body = JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        timezone,
        rotationDays,
      });
      if (initial) {
        await api(`/oncall/schedules/${initial.id}`, undefined, { method: 'PATCH', body });
        success('Schedule updated');
      } else {
        await api('/oncall/schedules', undefined, { method: 'POST', body });
        success('Schedule created');
      }
      await onSaved();
    } catch {
      toastError('Failed to save schedule');
    } finally {
      setSaving(false);
    }
  }

  const TIMEZONES = [
    'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Singapore',
    'Australia/Sydney', 'Pacific/Auckland',
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initial ? 'Edit Schedule' : 'New On-Call Schedule'}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Schedule'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Primary On-Call"
            className={`w-full px-3 py-2 rounded-lg border ${
              errors.name ? 'border-red-500' : 'border-border'
            } bg-surface text-text-primary text-sm focus:outline-none focus:border-accent`}
          />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description…"
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-accent"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Rotation (days) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={rotationDays}
              onChange={(e) => setRotationDays(parseInt(e.target.value, 10) || 1)}
              className={`w-full px-3 py-2 rounded-lg border ${
                errors.rotationDays ? 'border-red-500' : 'border-border'
              } bg-surface text-text-primary text-sm focus:outline-none focus:border-accent`}
            />
            {errors.rotationDays && <p className="text-xs text-red-400 mt-1">{errors.rotationDays}</p>}
          </div>
        </div>

        <p className="text-xs text-text-secondary">
          Each participant is on-call for the configured number of days before rotating to the next person.
          Rotation is calculated from a fixed epoch (2026-01-05 UTC).
        </p>
      </div>
    </Modal>
  );
}

// ─── Policy Modal ──────────────────────────────────────────────────────────

type StepDraft = {
  stepOrder: number;
  waitMinutes: number;
  notifyEmail: string;
};

function PolicyModal({
  isOpen,
  initial,
  schedules,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  initial?: EscalationPolicy;
  schedules: OnCallSchedule[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [escalateAfterMin, setEscalateAfterMin] = useState(15);
  const [maxEscalations, setMaxEscalations] = useState(3);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { success, error: toastError } = useToast();

  useEffect(() => {
    if (isOpen) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setScheduleId(initial?.scheduleId ?? '');
      setEscalateAfterMin(initial?.escalateAfterMin ?? 15);
      setMaxEscalations(initial?.maxEscalations ?? 3);
      setSteps(
        initial?.steps?.map((s) => ({
          stepOrder: s.stepOrder,
          waitMinutes: s.waitMinutes,
          notifyEmail: s.notifyEmail ?? '',
        })) ?? [],
      );
      setErrors({});
    }
  }, [isOpen, initial]);

  function addStep() {
    setSteps((s) => [
      ...s,
      { stepOrder: s.length, waitMinutes: 5, notifyEmail: '' },
    ]);
  }

  function removeStep(idx: number) {
    setSteps((s) => s.filter((_, i) => i !== idx).map((st, i) => ({ ...st, stepOrder: i })));
  }

  async function handleSave() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (escalateAfterMin < 1) e.escalateAfterMin = 'Must be at least 1 minute';
    if (Object.keys(e).length) { setErrors(e); return; }

    setSaving(true);
    try {
      const body = JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        scheduleId: scheduleId || undefined,
        escalateAfterMin,
        maxEscalations,
        steps: steps
          .filter((s) => s.waitMinutes >= 1)
          .map((s) => ({
            stepOrder: s.stepOrder,
            waitMinutes: s.waitMinutes,
            notifyEmail: s.notifyEmail || undefined,
          })),
      });
      if (initial) {
        await api(`/oncall/policies/${initial.id}`, undefined, { method: 'PATCH', body });
        success('Policy updated');
      } else {
        await api('/oncall/policies', undefined, { method: 'POST', body });
        success('Policy created');
      }
      await onSaved();
    } catch {
      toastError('Failed to save policy');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initial ? 'Edit Escalation Policy' : 'New Escalation Policy'}
      size="lg"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Policy'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Default Escalation"
            className={`w-full px-3 py-2 rounded-lg border ${
              errors.name ? 'border-red-500' : 'border-border'
            } bg-surface text-text-primary text-sm focus:outline-none focus:border-accent`}
          />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Description
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description…"
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            On-Call Schedule (optional)
          </label>
          <select
            value={scheduleId}
            onChange={(e) => setScheduleId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-accent"
          >
            <option value="">— No schedule linked —</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Escalate after (minutes)
            </label>
            <input
              type="number"
              min={1}
              value={escalateAfterMin}
              onChange={(e) => setEscalateAfterMin(parseInt(e.target.value, 10) || 15)}
              className={`w-full px-3 py-2 rounded-lg border ${
                errors.escalateAfterMin ? 'border-red-500' : 'border-border'
              } bg-surface text-text-primary text-sm focus:outline-none focus:border-accent`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Max escalations
            </label>
            <input
              type="number"
              min={1}
              value={maxEscalations}
              onChange={(e) => setMaxEscalations(parseInt(e.target.value, 10) || 3)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Escalation steps */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-text-primary">
              Escalation Steps
            </label>
            <Button variant="ghost" size="sm" onClick={addStep} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" />
              Add Step
            </Button>
          </div>

          {steps.length === 0 ? (
            <p className="text-xs text-text-secondary py-2">
              No steps defined. Add steps to notify people in sequence when an alert isn't acknowledged.
            </p>
          ) : (
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-surface-elevated">
                  <span className="text-xs font-mono text-text-secondary w-6 text-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-text-secondary">Wait (min)</label>
                      <input
                        type="number"
                        min={1}
                        value={step.waitMinutes}
                        onChange={(e) =>
                          setSteps((s) =>
                            s.map((x, i) =>
                              i === idx ? { ...x, waitMinutes: parseInt(e.target.value, 10) || 1 } : x,
                            ),
                          )
                        }
                        className="w-full mt-0.5 px-2 py-1 rounded border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary">Notify email</label>
                      <input
                        type="email"
                        value={step.notifyEmail}
                        onChange={(e) =>
                          setSteps((s) =>
                            s.map((x, i) =>
                              i === idx ? { ...x, notifyEmail: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="email@example.com"
                        className="w-full mt-0.5 px-2 py-1 rounded border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => removeStep(idx)}
                    className="p-1.5 rounded hover:bg-red-500/10 text-text-secondary hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
