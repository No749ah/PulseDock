"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Eye, AlertCircle, CheckCircle2, Monitor, Bell, BellOff, X } from "lucide-react";
import { api } from "../../lib/api";
import { getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../components/Table";
import { Modal } from "../components/Modal";
import { FadeIn } from "../components/FadeIn";

interface MonitorItem {
  id: string;
  name: string;
  type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE";
  target: string;
  intervalSec: number;
  enabled: boolean;
  createdAt: string;
}

interface MonitorRun {
  id: string;
  monitorId: string;
  ok: boolean;
  status: number;
  latencyMs?: number;
  message: string;
  checkedAt: string;
}

interface AlertChannel {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: string;
}

const inputClass =
  "w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

const CHANNEL_TYPE_COLORS: Record<string, string> = {
  discord: "text-indigo-400",
  slack: "text-green-400",
  webhook: "text-blue-400",
  telegram: "text-sky-400",
  email: "text-yellow-400",
};

export default function MonitorsPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [monitors, setMonitors] = useState<MonitorItem[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [allChannels, setAllChannels] = useState<AlertChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // create/edit monitor modal
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingMonitor, setEditingMonitor] = useState<MonitorItem | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE";
    target: string;
    intervalSec: number;
    enabled: boolean;
  }>({
    name: "",
    type: "HTTP",
    target: "",
    intervalSec: 60,
    enabled: true,
  });

  // alert assignment panel
  const [alertPanelMonitor, setAlertPanelMonitor] = useState<MonitorItem | null>(null);
  const [assignedChannels, setAssignedChannels] = useState<AlertChannel[]>([]);
  const [alertPanelLoading, setAlertPanelLoading] = useState(false);
  const [alertPanelError, setAlertPanelError] = useState("");

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    if (!currentUser) {
      router.push("/login");
      return;
    }

    const userId = currentUser.id;

    async function loadData() {
      try {
        setLoading(true);
        setError("");
        const [monitorsData, runsData, channelsData] = await Promise.all([
          api<MonitorItem[]>("/v1/monitors", userId),
          api<MonitorRun[]>("/v1/monitors/runs?limit=20", userId),
          api<AlertChannel[]>("/v1/alert-channels", userId),
        ]);
        setMonitors(monitorsData);
        setRuns(runsData);
        setAllChannels(channelsData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load monitors");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  const openAlertPanel = async (monitor: MonitorItem) => {
    setAlertPanelMonitor(monitor);
    setAlertPanelLoading(true);
    setAlertPanelError("");
    try {
      const assigned = await api<AlertChannel[]>(`/v1/monitors/${monitor.id}/alerts`, user?.id);
      setAssignedChannels(assigned);
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : "Failed to load alerts");
    } finally {
      setAlertPanelLoading(false);
    }
  };

  const assignChannel = async (channelId: string) => {
    if (!alertPanelMonitor) return;
    try {
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, user?.id, { method: "POST" });
      const updated = await api<AlertChannel[]>(`/v1/monitors/${alertPanelMonitor.id}/alerts`, user?.id);
      setAssignedChannels(updated);
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : "Failed to assign channel");
    }
  };

  const unassignChannel = async (channelId: string) => {
    if (!alertPanelMonitor) return;
    try {
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, user?.id, { method: "DELETE" });
      setAssignedChannels((prev) => prev.filter((c) => c.id !== channelId));
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : "Failed to unassign channel");
    }
  };

  const handleCreate = async () => {
    try {
      await api("/v1/monitors", user?.id, {
        method: "POST",
        body: JSON.stringify(formData),
      });
      setShowModal(false);
      setFormData({ name: "", type: "HTTP", target: "", intervalSec: 60, enabled: true });
      const monitorsData = await api<MonitorItem[]>("/v1/monitors", user?.id);
      setMonitors(monitorsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create monitor");
    }
  };

  const handleUpdate = async () => {
    if (!editingMonitor) return;
    try {
      await api(`/v1/monitors/${editingMonitor.id}`, user?.id, {
        method: "PATCH",
        body: JSON.stringify(formData),
      });
      setShowModal(false);
      setEditingMonitor(null);
      const monitorsData = await api<MonitorItem[]>("/v1/monitors", user?.id);
      setMonitors(monitorsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update monitor");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this monitor?")) return;
    try {
      await api(`/v1/monitors/${id}`, user?.id, { method: "DELETE" });
      setMonitors(monitors.filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete monitor");
    }
  };

  const unassignedChannels = allChannels.filter(
    (c) => !assignedChannels.some((a) => a.id === c.id)
  );

  if (!user) return null;
  if (loading)
    return (
      <AppFrame title="Monitors">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      </AppFrame>
    );

  return (
    <AppFrame title="Monitors" subtitle="Manage your application monitors">
      <div className="space-y-6">
        {error && (
          <FadeIn>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20">
              <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
              <span className="text-danger text-sm">{error}</span>
            </div>
          </FadeIn>
        )}

        <FadeIn>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Monitors</h2>
              <p className="text-text-secondary text-sm mt-1">
                {monitors.length} {monitors.length === 1 ? "monitor" : "monitors"} active
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => {
                setModalMode("create");
                setEditingMonitor(null);
                setFormData({ name: "", type: "HTTP", target: "", intervalSec: 60, enabled: true });
                setShowModal(true);
              }}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New Monitor
            </Button>
          </div>
        </FadeIn>

        {monitors.length === 0 ? (
          <FadeIn delay={0.1}>
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <Monitor className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No monitors yet</p>
              <p className="text-text-secondary text-sm mb-6">
                Create your first monitor to start tracking uptime and performance
              </p>
              <Button size="lg" onClick={() => setShowModal(true)}>Create your first monitor</Button>
            </Card>
          </FadeIn>
        ) : (
          <FadeIn delay={0.1}>
            <Card className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeader>Name</TableHeader>
                      <TableHeader>Type</TableHeader>
                      <TableHeader>Target</TableHeader>
                      <TableHeader>Interval</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader>Alerts</TableHeader>
                      <TableHeader>Actions</TableHeader>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {monitors.map((monitor) => {
                      const lastRun = runs.find((r) => r.monitorId === monitor.id);
                      return (
                        <TableRow key={monitor.id}>
                          <TableCell className="font-medium text-text-primary">{monitor.name}</TableCell>
                          <TableCell className="text-sm text-text-secondary">{monitor.type}</TableCell>
                          <TableCell className="text-sm text-text-secondary truncate max-w-[200px]">
                            {monitor.target}
                          </TableCell>
                          <TableCell className="text-sm text-text-secondary">{monitor.intervalSec}s</TableCell>
                          <TableCell>
                            {!monitor.enabled ? (
                              <Badge variant="warning">Disabled</Badge>
                            ) : lastRun ? (
                              <Badge variant={lastRun.ok ? "success" : "danger"}>
                                {lastRun.ok ? "OK" : "Failed"}
                              </Badge>
                            ) : (
                              <Badge>Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={() => openAlertPanel(monitor)}
                              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors"
                              title="Manage alert channels"
                            >
                              <Bell className="w-3.5 h-3.5" />
                              <span>Manage</span>
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setModalMode("edit");
                                  setEditingMonitor(monitor);
                                  setFormData({
                                    name: monitor.name,
                                    type: monitor.type,
                                    target: monitor.target,
                                    intervalSec: monitor.intervalSec,
                                    enabled: monitor.enabled,
                                  });
                                  setShowModal(true);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(monitor.id)} className="text-danger hover:text-danger">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </FadeIn>
        )}

        {/* Recent runs */}
        <FadeIn delay={0.2}>
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-text-primary">Recent Activity</h2>
            {runs.length === 0 ? (
              <Card className="text-center py-12">
                <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                  <Eye className="w-10 h-10 text-text-secondary opacity-50" />
                </div>
                <p className="text-text-primary font-medium mb-1">No check runs yet</p>
                <p className="text-text-secondary text-sm">Results will appear here after monitors run their first checks</p>
              </Card>
            ) : (
              <Card>
                <div className="space-y-2">
                  {runs.slice(0, 10).map((run) => (
                    <div key={run.id} className="flex items-center justify-between py-3 px-3 rounded-lg bg-surface-elevated/50">
                      <div className="flex items-center gap-3">
                        {run.ok ? (
                          <div className="p-1.5 rounded-full bg-success/10">
                            <CheckCircle2 className="w-4 h-4 text-success" />
                          </div>
                        ) : (
                          <div className="p-1.5 rounded-full bg-danger/10">
                            <AlertCircle className="w-4 h-4 text-danger" />
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="text-sm text-text-primary">
                            <strong>{monitors.find((m) => m.id === run.monitorId)?.name}</strong> — {run.message}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {new Date(run.checkedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {run.latencyMs && <span className="text-xs text-text-secondary font-mono">{run.latencyMs}ms</span>}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </FadeIn>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingMonitor(null); }}
        title={modalMode === "create" ? "New Monitor" : "Edit Monitor"}
        size="md"
        actions={
          <>
            <Button variant="secondary" onClick={() => { setShowModal(false); setEditingMonitor(null); }}>
              Cancel
            </Button>
            <Button onClick={modalMode === "create" ? handleCreate : handleUpdate}>
              {modalMode === "create" ? "Create" : "Update"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Monitor Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={inputClass}
              placeholder="My API"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as typeof formData.type })}
              className={inputClass}
            >
              <option value="HTTP">HTTP Check</option>
              <option value="GIT_RELEASE">Git Release</option>
              <option value="DOCKER_IMAGE">Docker Image</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Target</label>
            <input
              type="text"
              value={formData.target}
              onChange={(e) => setFormData({ ...formData, target: e.target.value })}
              className={inputClass}
              placeholder="https://api.example.com/health"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Check Interval (seconds)</label>
            <input
              type="number"
              min="30"
              max="3600"
              value={formData.intervalSec}
              onChange={(e) => setFormData({ ...formData, intervalSec: parseInt(e.target.value) })}
              className={inputClass}
            />
          </div>

          <label className="flex items-center gap-3 py-1">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              className="w-5 h-5 rounded border-border bg-surface text-accent focus:ring-accent"
            />
            <span className="text-sm text-text-primary">Enabled</span>
          </label>
        </div>
      </Modal>

      {/* Alert Assignment Panel (slide-in from right) */}
      {alertPanelMonitor && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setAlertPanelMonitor(null)}
          />
          {/* Panel */}
          <div className="relative w-full max-w-md bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Bell className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-text-primary">Alert Channels</h3>
                  <p className="text-xs text-text-secondary truncate max-w-[200px]">{alertPanelMonitor.name}</p>
                </div>
              </div>
              <button
                onClick={() => setAlertPanelMonitor(null)}
                className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-text-secondary hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {alertPanelError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20">
                  <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                  <span className="text-danger text-xs">{alertPanelError}</span>
                </div>
              )}

              {alertPanelLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
                </div>
              ) : (
                <>
                  {/* Assigned channels */}
                  <div>
                    <h4 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
                      Assigned ({assignedChannels.length})
                    </h4>
                    {assignedChannels.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-border text-center">
                        <BellOff className="w-8 h-8 text-text-secondary opacity-40 mb-2" />
                        <p className="text-sm text-text-secondary">No channels assigned</p>
                        <p className="text-xs text-text-secondary opacity-60 mt-1">
                          Add channels below to receive alerts
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {assignedChannels.map((channel) => (
                          <div
                            key={channel.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated border border-border/50"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`text-xs font-semibold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[channel.type] ?? "text-text-secondary"}`}>
                                {channel.type}
                              </span>
                              <span className="text-sm text-text-primary truncate">{channel.name}</span>
                            </div>
                            <button
                              onClick={() => unassignChannel(channel.id)}
                              className="ml-3 p-1.5 rounded-md hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors shrink-0"
                              title="Remove"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Available channels to add */}
                  {unassignedChannels.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">
                        Available
                      </h4>
                      <div className="space-y-2">
                        {unassignedChannels.map((channel) => (
                          <div
                            key={channel.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border/50 hover:border-accent/30 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`text-xs font-semibold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[channel.type] ?? "text-text-secondary"}`}>
                                {channel.type}
                              </span>
                              <span className="text-sm text-text-primary truncate">{channel.name}</span>
                            </div>
                            <button
                              onClick={() => assignChannel(channel.id)}
                              className="ml-3 p-1.5 rounded-md bg-accent/10 hover:bg-accent/20 text-accent transition-colors shrink-0"
                              title="Add"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {allChannels.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-text-secondary">No alert channels configured.</p>
                      <p className="text-xs text-text-secondary opacity-60 mt-1">
                        Create channels on the Alerts page first.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => setAlertPanelMonitor(null)}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppFrame>
  );
}
