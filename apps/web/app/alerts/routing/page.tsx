"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, AlertTriangle, Save, FlaskConical, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { AppFrame } from "../../../components/app-frame";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Modal } from "../../components/Modal";
import { getUser } from "../../../components/auth";
import { api } from "../../../lib/api";
import { useToast } from "../../../components/ui/toast";

interface RoutingRule {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  matchTags: string[];
  matchTypes: string[];
  matchFolderIds: string[];
  matchLevels: string[];
  matchMonitorIds: string[];
  channelIds: string[];
  overrideNotifyOn: string | null;
  createdAt: string;
}

interface AlertChannel {
  id: string;
  name: string;
  type: string;
}

interface MonitorItem {
  id: string;
  name: string;
  type: string;
  folderId?: string | null;
  tags?: Array<{ id: string; name: string }>;
}

interface Folder {
  id: string;
  name: string;
}

interface SimulateResult {
  monitor: { id: string; name: string; type: string };
  simulatedLevel: string;
  monitorTags: string[];
  totalRules: number;
  matchedRulesCount: number;
  routing: Array<{
    ruleId: string;
    ruleName: string;
    priority: number;
    matched: boolean;
    checks: Array<{ condition: string; passed: boolean; reason: string }>;
    channelIds: string[];
  }>;
  routedChannels: Array<{ id: string; name: string; type: string }>;
  fallback: { active: boolean; description: string; channels: Array<{ id: string; name: string; type: string }> } | null;
}

const MONITOR_TYPES = ["HTTP", "GIT_RELEASE", "DOCKER_IMAGE", "TCP", "SSL_CERT", "HEARTBEAT", "DNS", "PING", "SMTP", "BROWSER", "WHOIS", "FTP", "IMAP", "POP3"];
const ALERT_LEVELS = ["green", "yellow", "red"];

function RuleForm({
  rule,
  channels,
  monitors,
  folders,
  onSave,
  onCancel,
}: {
  rule: Partial<RoutingRule>;
  channels: AlertChannel[];
  monitors: MonitorItem[];
  folders: Folder[];
  onSave: (data: Partial<RoutingRule>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<RoutingRule>>({
    name: "",
    description: "",
    enabled: true,
    matchTags: [],
    matchTypes: [],
    matchFolderIds: [],
    matchLevels: [],
    matchMonitorIds: [],
    channelIds: [],
    overrideNotifyOn: null,
    ...rule,
  });

  const toggle = (field: keyof RoutingRule, value: string) => {
    setForm((prev) => {
      const arr = (prev[field] as string[]) ?? [];
      return { ...prev, [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  };

  const allTags = [...new Set(monitors.flatMap((m) => m.tags?.map((t) => t.name) ?? []))].sort();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Rule Name <span className="text-danger">*</span></label>
          <input value={form.name ?? ""} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Production critical → PagerDuty" className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Description</label>
          <input value={form.description ?? ""} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional note" className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Match Conditions <span className="font-normal normal-case text-text-muted">(empty = match everything)</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">Monitor Types</label>
            <div className="flex flex-wrap gap-1.5">
              {MONITOR_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => toggle("matchTypes", t)} className={`px-2 py-1 text-xs rounded-lg border transition-colors ${(form.matchTypes ?? []).includes(t) ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface text-text-secondary hover:border-accent/50"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">Alert Levels</label>
            <div className="flex flex-wrap gap-1.5">
              {ALERT_LEVELS.map((l) => (
                <button key={l} type="button" onClick={() => toggle("matchLevels", l)} className={`px-2 py-1 text-xs rounded-lg border transition-colors ${(form.matchLevels ?? []).includes(l) ? l === "green" ? "border-success bg-success/15 text-success" : l === "yellow" ? "border-warning bg-warning/15 text-warning" : "border-danger bg-danger/15 text-danger" : "border-border bg-surface text-text-secondary hover:border-accent/50"}`}>
                  {l === "green" ? "✅ Recovery" : l === "yellow" ? "⚠️ Degraded" : "🚨 Down"}
                </button>
              ))}
            </div>
          </div>
          {allTags.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">Tags</label>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => (
                  <button key={tag} type="button" onClick={() => toggle("matchTags", tag)} className={`px-2 py-1 text-xs rounded-lg border transition-colors ${(form.matchTags ?? []).includes(tag) ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface text-text-secondary hover:border-accent/50"}`}>{tag}</button>
                ))}
              </div>
            </div>
          )}
          {folders.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">Folders</label>
              <div className="flex flex-wrap gap-1.5">
                {folders.map((f) => (
                  <button key={f.id} type="button" onClick={() => toggle("matchFolderIds", f.id)} className={`px-2 py-1 text-xs rounded-lg border transition-colors ${(form.matchFolderIds ?? []).includes(f.id) ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface text-text-secondary hover:border-accent/50"}`}>📁 {f.name}</button>
                ))}
              </div>
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-text-secondary mb-2">Specific Monitors <span className="font-normal text-text-muted">(leave empty to match all)</span></label>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {monitors.slice(0, 50).map((m) => (
                <button key={m.id} type="button" onClick={() => toggle("matchMonitorIds", m.id)} className={`px-2 py-1 text-xs rounded-lg border transition-colors ${(form.matchMonitorIds ?? []).includes(m.id) ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface text-text-secondary hover:border-accent/50"}`}>{m.name}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Route To <span className="text-danger">*</span></p>
        <div className="flex flex-wrap gap-2">
          {channels.map((ch) => (
            <button key={ch.id} type="button" onClick={() => toggle("channelIds", ch.id)} className={`px-3 py-1.5 text-xs rounded-xl border transition-colors ${(form.channelIds ?? []).includes(ch.id) ? "border-accent bg-accent/15 text-accent font-medium" : "border-border bg-surface text-text-secondary hover:border-accent/50"}`}>
              {ch.name} <span className="opacity-60">({ch.type})</span>
            </button>
          ))}
          {channels.length === 0 && <p className="text-xs text-text-muted">No alert channels configured. <a href="/alerts" className="text-accent hover:underline">Add one first →</a></p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Override Notify-On</label>
          <select value={form.overrideNotifyOn ?? ""} onChange={(e) => setForm((p) => ({ ...p, overrideNotifyOn: e.target.value || null }))} className="px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
            <option value="">— Keep channel default —</option>
            <option value="ON_CHANGE">ON_CHANGE</option>
            <option value="ALWAYS">ALWAYS</option>
            <option value="FIRST_ONLY">FIRST_ONLY</option>
            <option value="DAILY_DIGEST">DAILY_DIGEST</option>
          </select>
        </div>
        <div className="flex items-center gap-2 mt-5">
          <label className="text-xs font-medium text-text-secondary">Enabled</label>
          <button type="button" onClick={() => setForm((p) => ({ ...p, enabled: !p.enabled }))} className={`transition-colors ${form.enabled ? "text-success" : "text-text-muted"}`}>
            {form.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={!form.name?.trim() || (form.channelIds ?? []).length === 0} className="flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" />Save Rule
        </Button>
      </div>
    </div>
  );
}

export default function AlertRoutingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [monitors, setMonitors] = useState<MonitorItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSimulate, setShowSimulate] = useState(false);
  const [simMonitorId, setSimMonitorId] = useState("");
  const [simLevel, setSimLevel] = useState("red");
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<SimulateResult | null>(null);
  const [simError, setSimError] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!user) { router.push("/login"); return; }
    Promise.all([
      api<RoutingRule[]>("/v1/alert-routing-rules", user.id),
      api<AlertChannel[]>("/v1/alert-channels", user.id),
      api<MonitorItem[]>("/v1/monitors", user.id),
      api<Folder[]>("/v1/folders", user.id).catch(() => [] as Folder[]),
    ])
      .then(([r, ch, m, f]) => { setRules(r); setChannels(ch); setMonitors(m); setFolders(f); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [router]);

  const handleCreate = async (data: Partial<RoutingRule>) => {
    const user = getUser(); if (!user) return;
    try {
      const created = await api<RoutingRule>("/v1/alert-routing-rules", user.id, { method: "POST", body: JSON.stringify(data) });
      setRules((prev) => [...prev, created]);
      setShowCreate(false);
      toast("Rule created", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed to create rule", "error"); }
  };

  const handleUpdate = async (id: string, data: Partial<RoutingRule>) => {
    const user = getUser(); if (!user) return;
    try {
      const updated = await api<RoutingRule>(`/v1/alert-routing-rules/${id}`, user.id, { method: "PATCH", body: JSON.stringify(data) });
      setRules((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setEditingId(null);
      toast("Rule updated", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed to update rule", "error"); }
  };

  const handleToggle = async (rule: RoutingRule) => {
    const user = getUser(); if (!user) return;
    try {
      const updated = await api<RoutingRule>(`/v1/alert-routing-rules/${rule.id}/toggle`, user.id, { method: "PATCH" });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    } catch (e) { toast(e instanceof Error ? e.message : "Failed to toggle", "error"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this routing rule?")) return;
    const user = getUser(); if (!user) return;
    try {
      await api(`/v1/alert-routing-rules/${id}`, user.id, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast("Rule deleted", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed to delete", "error"); }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rules.length) return;
    const user = getUser(); if (!user) return;
    const newOrder = [...rules];
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    setRules(newOrder);
    try {
      await api<RoutingRule[]>("/v1/alert-routing-rules/reorder", user.id, { method: "PATCH", body: JSON.stringify({ ids: newOrder.map((r) => r.id) }) });
    } catch (e) { toast("Failed to reorder", "error"); }
  };

  const handleSimulate = async () => {
    if (!simMonitorId) { setSimError("Select a monitor to simulate"); return; }
    const user = getUser(); if (!user) return;
    setSimLoading(true); setSimError(""); setSimResult(null);
    try {
      const result = await api<SimulateResult>("/v1/alert-routing-rules/simulate", user.id, {
        method: "POST",
        body: JSON.stringify({ monitorId: simMonitorId, level: simLevel }),
      });
      setSimResult(result);
    } catch (e) {
      setSimError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setSimLoading(false);
    }
  };

  const getChannelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id.slice(0, 8) + "…";

  function RuleMatchSummary({ rule }: { rule: RoutingRule }) {
    const parts: string[] = [];
    if (rule.matchTypes.length > 0) parts.push(`type: ${rule.matchTypes.join(", ")}`);
    if (rule.matchLevels.length > 0) parts.push(`level: ${rule.matchLevels.map(l => l === "green" ? "recovery" : l === "yellow" ? "degraded" : "down").join(", ")}`);
    if (rule.matchTags.length > 0) parts.push(`tags: ${rule.matchTags.join(", ")}`);
    if (rule.matchFolderIds.length > 0) parts.push(`${rule.matchFolderIds.length} folder(s)`);
    if (rule.matchMonitorIds.length > 0) parts.push(`${rule.matchMonitorIds.length} monitor(s)`);
    return <span className="text-xs text-text-muted">{parts.length === 0 ? "Matches all alerts" : parts.join(" · ")}</span>;
  }

  return (
    <AppFrame title="Alert Routing Rules" breadcrumbs={[{ label: "Alerts", href: "/alerts" }, { label: "Routing Rules" }]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Alert Routing Rules</h1>
            <p className="text-sm text-text-secondary mt-1">Route alerts to specific channels based on monitor type, level, tags, or folder. Rules are evaluated in priority order — first match wins.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" onClick={() => { setSimResult(null); setSimError(""); setShowSimulate(true); }} className="flex items-center gap-1.5">
              <FlaskConical className="w-4 h-4" />Simulate
            </Button>
            <Button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5"><Plus className="w-4 h-4" />New Rule</Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {showCreate && (
          <Card className="p-6">
            <h2 className="text-base font-semibold text-text-primary mb-4">New Routing Rule</h2>
            <RuleForm rule={{}} channels={channels} monitors={monitors} folders={folders} onSave={handleCreate} onCancel={() => setShowCreate(false)} />
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" /></div>
        ) : rules.length === 0 && !showCreate ? (
          <Card className="p-12 text-center">
            <div className="text-4xl mb-3">🔀</div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">No routing rules yet</h3>
            <p className="text-sm text-text-secondary mb-4">Routing rules let you send different alerts to different channels based on conditions. Without rules, all alerts follow the default per-monitor channel assignments.</p>
            <Button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 mx-auto"><Plus className="w-4 h-4" />Create First Rule</Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {rules.map((rule, index) => (
              <Card key={rule.id} className={`p-5 transition-all ${!rule.enabled ? "opacity-60" : ""}`}>
                {editingId === rule.id ? (
                  <>
                    <h3 className="text-sm font-semibold text-text-primary mb-4">Edit Rule</h3>
                    <RuleForm rule={rule} channels={channels} monitors={monitors} folders={folders} onSave={(data) => handleUpdate(rule.id, data)} onCancel={() => setEditingId(null)} />
                  </>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-0.5 pt-0.5 shrink-0">
                      <button onClick={() => handleMove(index, "up")} disabled={index === 0} className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-20 transition-colors" title="Move up"><ChevronUp className="w-4 h-4" /></button>
                      <span className="text-[10px] text-text-muted text-center leading-none px-1">#{index + 1}</span>
                      <button onClick={() => handleMove(index, "down")} disabled={index === rules.length - 1} className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-20 transition-colors" title="Move down"><ChevronDown className="w-4 h-4" /></button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-text-primary text-sm">{rule.name}</span>
                        <Badge variant={rule.enabled ? "success" : "default"} className="text-xs">{rule.enabled ? "Active" : "Disabled"}</Badge>
                        {rule.overrideNotifyOn && <Badge variant="warning" className="text-xs">{rule.overrideNotifyOn}</Badge>}
                      </div>
                      {rule.description && <p className="text-xs text-text-secondary mb-1">{rule.description}</p>}
                      <RuleMatchSummary rule={rule} />
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="text-xs text-text-muted">→</span>
                        {rule.channelIds.map((cid) => (
                          <span key={cid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-accent/10 text-accent border border-accent/20">{getChannelName(cid)}</span>
                        ))}
                        {rule.channelIds.length === 0 && <span className="text-xs text-danger">⚠ No channels assigned</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleToggle(rule)} className={`p-1.5 rounded-lg transition-colors ${rule.enabled ? "text-success hover:bg-success/10" : "text-text-muted hover:bg-surface"}`} title={rule.enabled ? "Disable" : "Enable"}>
                        {rule.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <button onClick={() => setEditingId(rule.id)} className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors" title="Edit">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(rule.id)} className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        <Card className="p-5 border-dashed">
          <h3 className="text-sm font-semibold text-text-primary mb-2">How Routing Rules Work</h3>
          <ul className="text-xs text-text-secondary space-y-1 list-disc list-inside">
            <li>Rules are evaluated in priority order (top = highest priority). First matching rule wins.</li>
            <li>If a rule matches, its channels are used <em>instead of</em> the monitor&apos;s default channels.</li>
            <li>If no rule matches, the monitor&apos;s default channel assignments are used.</li>
            <li>Empty match conditions mean &quot;match everything&quot; — be careful with catch-all rules.</li>
            <li>Use &quot;Override Notify-On&quot; to force a different notification frequency for routed alerts.</li>
          </ul>
        </Card>
      </div>

      {/* Simulate Modal */}
      <Modal isOpen={showSimulate} onClose={() => setShowSimulate(false)} title="Simulate Alert Routing">
        <div className="space-y-5">
          <p className="text-sm text-text-secondary">
            Select a monitor and alert level to see which routing rules would match and which channels would receive the alert — without sending any actual notifications.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Monitor</label>
              <select
                value={simMonitorId}
                onChange={(e) => { setSimMonitorId(e.target.value); setSimResult(null); }}
                className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Select monitor…</option>
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.type})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Alert Level</label>
              <div className="flex gap-2">
                {[
                  { value: "red", label: "🔴 Down", cls: "border-danger/50 text-danger bg-danger/5" },
                  { value: "yellow", label: "🟡 Degraded", cls: "border-warning/50 text-warning bg-warning/5" },
                  { value: "green", label: "🟢 Recovery", cls: "border-success/50 text-success bg-success/5" },
                ].map(({ value, label, cls }) => (
                  <button
                    key={value}
                    onClick={() => { setSimLevel(value); setSimResult(null); }}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${simLevel === value ? cls : "border-border text-text-secondary hover:border-border-strong"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {simError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />{simError}
            </div>
          )}

          <Button onClick={handleSimulate} disabled={simLoading || !simMonitorId} className="w-full flex items-center justify-center gap-2">
            {simLoading ? (
              <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Simulating…</>
            ) : (
              <><FlaskConical className="w-4 h-4" />Run Simulation</>
            )}
          </Button>

          {simResult && (
            <div className="space-y-4 pt-2 border-t border-border">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">{simResult.monitor.name}</p>
                  <p className="text-xs text-text-muted">{simResult.monitor.type} · Level: <span className={simResult.simulatedLevel === "red" ? "text-danger" : simResult.simulatedLevel === "yellow" ? "text-warning" : "text-success"}>{simResult.simulatedLevel}</span></p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-text-primary">{simResult.matchedRulesCount}/{simResult.totalRules}</p>
                  <p className="text-xs text-text-muted">rules matched</p>
                </div>
              </div>

              {simResult.matchedRulesCount > 0 ? (
                <div>
                  <p className="text-xs font-medium text-text-secondary mb-2">Routed to channels:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {simResult.routedChannels.map((ch) => (
                      <span key={ch.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-accent/10 text-accent border border-accent/20 font-medium">
                        {ch.name}
                        <span className="text-accent/60">({ch.type})</span>
                      </span>
                    ))}
                    {simResult.routedChannels.length === 0 && (
                      <span className="text-xs text-danger">⚠ Matched rules have no channels assigned</span>
                    )}
                  </div>
                </div>
              ) : simResult.fallback ? (
                <div className="p-3 rounded-lg bg-surface-elevated border border-border">
                  <p className="text-xs text-text-secondary mb-2">{simResult.fallback.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {simResult.fallback.channels.map((ch) => (
                      <span key={ch.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-surface text-text-primary border border-border">
                        {ch.name} <span className="text-text-muted">({ch.type})</span>
                      </span>
                    ))}
                    {simResult.fallback.channels.length === 0 && (
                      <span className="text-xs text-danger">No channels linked to this monitor — alert would not be sent</span>
                    )}
                  </div>
                </div>
              ) : null}

              {simResult.routing.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-text-secondary mb-2">Rule evaluation trace:</p>
                  <div className="space-y-2">
                    {simResult.routing.map((r) => (
                      <div key={r.ruleId} className={`px-3 py-2.5 rounded-lg border text-xs ${r.matched ? "border-success/30 bg-success/5" : "border-border bg-surface-elevated/30"}`}>
                        <div className="flex items-center gap-2">
                          {r.matched ? <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-text-muted shrink-0" />}
                          <span className={`font-medium ${r.matched ? "text-success" : "text-text-secondary"}`}>#{r.priority + 1} {r.ruleName}</span>
                          {r.matched && r.channelIds.length > 0 && (
                            <span className="ml-auto text-text-muted flex items-center gap-1">
                              <ArrowRight className="w-3 h-3" />
                              {r.channelIds.map((cid) => getChannelName(cid)).join(", ")}
                            </span>
                          )}
                        </div>
                        {r.checks.length > 0 && !r.matched && (
                          <div className="mt-1.5 pl-5 space-y-0.5">
                            {r.checks.filter((c) => !c.passed).map((c, i) => (
                              <p key={i} className="text-text-muted">{c.reason}</p>
                            ))}
                          </div>
                        )}
                        {r.checks.length === 0 && r.matched && (
                          <p className="mt-1 pl-5 text-text-muted">No conditions — matches all alerts</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </AppFrame>
  );
}
