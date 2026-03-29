'use client';

import { useEffect, useState, useCallback } from 'react';
import { BookOpen, Plus, Edit, Trash2, X } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

// ─── Types ───────────────────────────────────────────────────────────────────

type StepType = 'check' | 'escalate' | 'runbook' | 'command' | 'notify';

interface PlaybookStep {
  id: string;
  title: string;
  description?: string;
  type: StepType;
  contact?: string;
  url?: string;
}

interface Playbook {
  id: string;
  name: string;
  description?: string;
  steps: PlaybookStep[];
  forSeverities: string[];
  _count: { monitors: number };
}

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

const severityColors: Record<string, string> = {
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  LOW: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const stepTypeColors: Record<StepType, string> = {
  check: 'bg-blue-500/20 text-blue-400',
  escalate: 'bg-red-500/20 text-red-400',
  runbook: 'bg-purple-500/20 text-purple-400',
  command: 'bg-zinc-500/20 text-zinc-400',
  notify: 'bg-green-500/20 text-green-400',
};

function newStep(): PlaybookStep {
  return { id: crypto.randomUUID(), title: '', type: 'check' };
}

// ─── Modal ───────────────────────────────────────────────────────────────────

interface ModalProps {
  playbook: Playbook | null;
  onClose: () => void;
  onSaved: () => void;
}

function PlaybookModal({ playbook, onClose, onSaved }: ModalProps) {
  const { success, error: toastError } = useToast();
  const [name, setName] = useState(playbook?.name ?? '');
  const [description, setDescription] = useState(playbook?.description ?? '');
  const [steps, setSteps] = useState<PlaybookStep[]>(playbook?.steps?.length ? playbook.steps : [newStep()]);
  const [forSeverities, setForSeverities] = useState<string[]>(playbook?.forSeverities ?? []);
  const [saving, setSaving] = useState(false);

  const toggleSeverity = (sev: string) => {
    setForSeverities((prev) => prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev]);
  };

  const updateStep = (index: number, patch: Partial<PlaybookStep>) => {
    setSteps((prev) => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) { toastError('Name required'); return; }
    if (steps.length === 0) { toastError('Add at least one step'); return; }

    const payload = JSON.stringify({ name, description, steps, forSeverities });
    const headers = { 'Content-Type': 'application/json' };
    setSaving(true);
    try {
      if (playbook) {
        await api(`/v1/playbooks/${playbook.id}`, undefined, { method: 'PATCH', headers, body: payload });
      } else {
        await api('/v1/playbooks', undefined, { method: 'POST', headers, body: payload });
      }
      success(playbook ? 'Playbook updated' : 'Playbook created');
      onSaved();
    } catch {
      toastError('Failed to save playbook');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">
            {playbook ? 'Edit Playbook' : 'New Playbook'}
          </h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
            <input
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Database Outage Response"
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
            <textarea
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of when to use this playbook"
            />
          </div>

          {/* Severities */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Applies to severities</label>
            <div className="flex gap-2 flex-wrap">
              {SEVERITIES.map((sev) => (
                <button
                  key={sev}
                  onClick={() => toggleSeverity(sev)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    forSeverities.includes(sev)
                      ? severityColors[sev]
                      : 'bg-surface-2 text-text-muted border-border hover:border-text-secondary'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Steps</label>
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={step.id} className="bg-surface-2 border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-text-muted w-5 shrink-0">{idx + 1}</span>
                    <select
                      className="bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none"
                      value={step.type}
                      onChange={(e) => updateStep(idx, { type: e.target.value as StepType })}
                    >
                      <option value="check">Check</option>
                      <option value="escalate">Escalate</option>
                      <option value="runbook">Runbook</option>
                      <option value="command">Command</option>
                      <option value="notify">Notify</option>
                    </select>
                    <input
                      className="flex-1 bg-surface border border-border rounded-md px-2 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none"
                      placeholder="Step title"
                      value={step.title}
                      onChange={(e) => updateStep(idx, { title: e.target.value })}
                      maxLength={200}
                    />
                    <button
                      onClick={() => removeStep(idx)}
                      className="text-text-muted hover:text-red-400 transition-colors shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    className="w-full bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text-secondary placeholder-text-muted focus:outline-none resize-none"
                    rows={2}
                    placeholder="Description (optional)"
                    value={step.description ?? ''}
                    onChange={(e) => updateStep(idx, { description: e.target.value })}
                    maxLength={1000}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text-secondary placeholder-text-muted focus:outline-none"
                      placeholder="Contact (optional)"
                      value={step.contact ?? ''}
                      onChange={(e) => updateStep(idx, { contact: e.target.value })}
                      maxLength={200}
                    />
                    <input
                      className="bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text-secondary placeholder-text-muted focus:outline-none"
                      placeholder="URL (optional)"
                      value={step.url ?? ''}
                      onChange={(e) => updateStep(idx, { url: e.target.value })}
                      maxLength={500}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setSteps((prev) => [...prev, newStep()])}
              className="mt-3 flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Step
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-border">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Playbook'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlaybooksPage() {
  const { success, error: toastError } = useToast();
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Playbook | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Playbook[]>('/v1/playbooks');
      setPlaybooks(data);
    } catch {
      toastError('Failed to load playbooks');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this playbook? It will be detached from all monitors.')) return;
    try {
      await api(`/v1/playbooks/${id}`, undefined, { method: 'DELETE' });
      success('Playbook deleted');
      void load();
    } catch {
      toastError('Failed to delete playbook');
    }
  };

  const openCreate = () => { setEditTarget(null); setModalOpen(true); };
  const openEdit = (pb: Playbook) => { setEditTarget(pb); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditTarget(null); };
  const onSaved = () => { closeModal(); void load(); };

  return (
    <AppFrame title="Incident Playbooks">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Incident Playbooks</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Attach step-by-step response guides to monitors. They appear automatically on incident pages.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Playbook
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-5 animate-pulse">
              <div className="h-5 bg-surface-2 rounded w-2/3 mb-3" />
              <div className="h-3 bg-surface-2 rounded w-full mb-2" />
              <div className="h-3 bg-surface-2 rounded w-4/5" />
            </div>
          ))}
        </div>
      ) : playbooks.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-surface-2 rounded-2xl mb-4">
            <BookOpen className="h-10 w-10 text-text-muted" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">No playbooks yet</h2>
          <p className="text-sm text-text-secondary max-w-sm mb-6">
            Create your first playbook to guide on-call responders through incident resolution.
          </p>
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create your first playbook
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {playbooks.map((pb) => (
            <Card key={pb.id} className="p-5 flex flex-col gap-4">
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-text-primary truncate">{pb.name}</h3>
                  {pb.description && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">{pb.description}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(pb)}
                    className="p-1.5 text-text-muted hover:text-primary transition-colors rounded-md hover:bg-primary/10"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(pb.id)}
                    className="p-1.5 text-text-muted hover:text-red-400 transition-colors rounded-md hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Meta */}
              <div className="flex flex-wrap gap-1.5">
                <Badge className="text-xs bg-surface-2 text-text-secondary border border-border">
                  {pb.steps.length} {pb.steps.length === 1 ? 'step' : 'steps'}
                </Badge>
                {pb.forSeverities.map((sev) => (
                  <Badge key={sev} className={`text-xs border ${severityColors[sev] ?? ''}`}>
                    {sev}
                  </Badge>
                ))}
              </div>

              {/* Step type preview */}
              {pb.steps.length > 0 && (
                <div className="space-y-1">
                  {pb.steps.slice(0, 3).map((step, idx) => (
                    <div key={step.id} className="flex items-center gap-2 text-xs text-text-secondary">
                      <span className="text-text-muted w-4 shrink-0">{idx + 1}.</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${stepTypeColors[step.type]}`}>
                        {step.type}
                      </span>
                      <span className="truncate">{step.title}</span>
                    </div>
                  ))}
                  {pb.steps.length > 3 && (
                    <p className="text-xs text-text-muted pl-6">+{pb.steps.length - 3} more steps</p>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="text-xs text-text-muted pt-1 border-t border-border/50">
                {pb._count.monitors} {pb._count.monitors === 1 ? 'monitor' : 'monitors'} using this
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <PlaybookModal playbook={editTarget} onClose={closeModal} onSaved={onSaved} />
      )}
    </AppFrame>
  );
}
