"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Clock, Save, X, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { AppFrame } from "../../../components/app-frame";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { getUser } from "../../../components/auth";
import { api } from "../../../lib/api";
import { useToast } from "../../../components/ui/toast";

interface EscalationStep {
  delayMinutes: number;
  channelId: string;
}

interface EscalationPolicy {
  id: string;
  name: string;
  steps: EscalationStep[];
  createdAt: string;
}

interface AlertChannel {
  id: string;
  name: string;
  type: string;
}

function StepRow({
  step,
  index,
  channels,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  step: EscalationStep;
  index: number;
  channels: AlertChannel[];
  onChange: (s: EscalationStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface">
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={onMoveUp} disabled={isFirst} className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-20 transition-colors"><ChevronUp className="w-3.5 h-3.5" /></button>
        <span className="text-[10px] text-text-muted text-center">{index + 1}</span>
        <button onClick={onMoveDown} disabled={isLast} className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-20 transition-colors"><ChevronDown className="w-3.5 h-3.5" /></button>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Clock className="w-3.5 h-3.5 text-text-muted" />
        <span className="text-xs text-text-secondary">After</span>
        <input
          type="number"
          min={1}
          max={1440}
          value={step.delayMinutes}
          onChange={(e) => onChange({ ...step, delayMinutes: Math.max(1, Number(e.target.value)) })}
          className="w-16 px-2 py-1 text-sm rounded-lg border border-border bg-surface-elevated text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <span className="text-xs text-text-secondary">min, notify:</span>
      </div>
      <select
        value={step.channelId}
        onChange={(e) => onChange({ ...step, channelId: e.target.value })}
        className="flex-1 px-3 py-1.5 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <option value="">— Select channel —</option>
        {channels.map((ch) => (
          <option key={ch.id} value={ch.id}>{ch.name} ({ch.type})</option>
        ))}
      </select>
      <button onClick={onRemove} className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function PolicyForm({
  policy,
  channels,
  onSave,
  onCancel,
}: {
  policy?: Partial<EscalationPolicy>;
  channels: AlertChannel[];
  onSave: (data: { name: string; steps: EscalationStep[] }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(policy?.name ?? "");
  const [steps, setSteps] = useState<EscalationStep[]>(policy?.steps ?? [{ delayMinutes: 5, channelId: "" }]);

  const addStep = () => setSteps((prev) => [...prev, { delayMinutes: 15, channelId: "" }]);
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));
  const updateStep = (i: number, s: EscalationStep) => setSteps((prev) => prev.map((st, idx) => idx === i ? s : st));
  const moveStep = (i: number, dir: "up" | "down") => {
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };

  const valid = name.trim().length > 0 && steps.length > 0 && steps.every((s) => s.channelId);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Policy Name <span className="text-danger">*</span></label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Critical Service On-Call" className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Escalation Steps</p>
          <Button size="sm" variant="secondary" onClick={addStep} className="flex items-center gap-1">
            <Plus className="w-3 h-3" />Add Step
          </Button>
        </div>
        <div className="space-y-2">
          {steps.map((step, i) => (
            <StepRow
              key={i}
              step={step}
              index={i}
              channels={channels}
              onChange={(s) => updateStep(i, s)}
              onRemove={() => removeStep(i)}
              onMoveUp={() => moveStep(i, "up")}
              onMoveDown={() => moveStep(i, "down")}
              isFirst={i === 0}
              isLast={i === steps.length - 1}
            />
          ))}
          {steps.length === 0 && (
            <div className="text-center py-6 text-sm text-text-muted border border-dashed border-border rounded-xl">
              No steps yet. Add at least one escalation step.
            </div>
          )}
        </div>
        {channels.length === 0 && (
          <p className="text-xs text-text-muted mt-2">No alert channels configured. <a href="/alerts" className="text-accent hover:underline">Add one first →</a></p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave({ name: name.trim(), steps })} disabled={!valid} className="flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" />Save Policy
        </Button>
      </div>
    </div>
  );
}

export default function EscalationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [policies, setPolicies] = useState<EscalationPolicy[]>([]);
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.push("/login"); return; }
    Promise.all([
      api<EscalationPolicy[]>("/v1/escalation-policies", user.id),
      api<AlertChannel[]>("/v1/alert-channels", user.id),
    ])
      .then(([p, ch]) => { setPolicies(p); setChannels(ch); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [router]);

  const handleCreate = async (data: { name: string; steps: EscalationStep[] }) => {
    const user = getUser(); if (!user) return;
    try {
      const created = await api<EscalationPolicy>("/v1/escalation-policies", user.id, { method: "POST", body: JSON.stringify(data) });
      setPolicies((prev) => [created, ...prev]);
      setShowCreate(false);
      toast("Policy created", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed to create", "error"); }
  };

  const handleUpdate = async (id: string, data: { name: string; steps: EscalationStep[] }) => {
    const user = getUser(); if (!user) return;
    try {
      const updated = await api<EscalationPolicy>(`/v1/escalation-policies/${id}`, user.id, { method: "PATCH", body: JSON.stringify(data) });
      setPolicies((prev) => prev.map((p) => p.id === id ? updated : p));
      setEditingId(null);
      toast("Policy updated", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed to update", "error"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this escalation policy? Monitor alert links using it will be cleared.")) return;
    const user = getUser(); if (!user) return;
    try {
      await api(`/v1/escalation-policies/${id}`, user.id, { method: "DELETE" });
      setPolicies((prev) => prev.filter((p) => p.id !== id));
      toast("Policy deleted", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed to delete", "error"); }
  };

  const getChannelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id.slice(0, 8) + "…";

  return (
    <AppFrame title="Escalation Policies" breadcrumbs={[{ label: "Alerts", href: "/alerts" }, { label: "Escalation Policies" }]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Escalation Policies</h1>
            <p className="text-sm text-text-secondary mt-1">
              Automatically notify additional channels if an alert isn&apos;t acknowledged. Steps fire in order after configurable delays.
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 shrink-0">
            <Plus className="w-4 h-4" />New Policy
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {showCreate && (
          <Card className="p-6">
            <h2 className="text-base font-semibold text-text-primary mb-4">New Escalation Policy</h2>
            <PolicyForm channels={channels} onSave={handleCreate} onCancel={() => setShowCreate(false)} />
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" /></div>
        ) : policies.length === 0 && !showCreate ? (
          <Card className="p-12 text-center">
            <div className="text-4xl mb-3">📟</div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">No escalation policies yet</h3>
            <p className="text-sm text-text-secondary mb-4">
              Escalation policies automatically notify additional channels after a delay if an alert hasn&apos;t been responded to.
              Assign policies to monitor alert channels to enable escalation.
            </p>
            <Button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 mx-auto">
              <Plus className="w-4 h-4" />Create First Policy
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {policies.map((policy) => (
              <Card key={policy.id} className="p-5">
                {editingId === policy.id ? (
                  <>
                    <h3 className="text-sm font-semibold text-text-primary mb-4">Edit Policy</h3>
                    <PolicyForm policy={policy} channels={channels} onSave={(data) => handleUpdate(policy.id, data)} onCancel={() => setEditingId(null)} />
                  </>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-text-primary">{policy.name}</span>
                        <Badge variant="default" className="text-xs">{`${policy.steps.length} step${policy.steps.length !== 1 ? 's' : ''}`}</Badge>
                      </div>
                      <div className="space-y-1">
                        {(policy.steps as EscalationStep[]).map((step, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-text-secondary">
                            <span className="w-5 h-5 rounded-full border border-border text-center leading-5 text-text-muted shrink-0">{i + 1}</span>
                            <Clock className="w-3 h-3 text-text-muted" />
                            <span>After {step.delayMinutes}min → <span className="text-text-primary font-medium">{getChannelName(step.channelId)}</span></span>
                          </div>
                        ))}
                        {policy.steps.length === 0 && <span className="text-xs text-text-muted">No steps configured</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditingId(policy.id)} className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors" title="Edit">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(policy.id)} className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        <Card className="p-5 border-dashed">
          <h3 className="text-sm font-semibold text-text-primary mb-2">How Escalation Works</h3>
          <ul className="text-xs text-text-secondary space-y-1 list-disc list-inside">
            <li>Assign an escalation policy to a monitor via Alerts → assign channel → set escalation policy.</li>
            <li>If the monitor stays down after step 1&apos;s delay, the next channel in the policy is notified.</li>
            <li>Steps fire in order; all configured channels are notified at their delay threshold.</li>
            <li>Escalation resets when the monitor recovers.</li>
          </ul>
        </Card>
      </div>
    </AppFrame>
  );
}
