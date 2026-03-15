"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, AlertCircle, CheckCircle2, Monitor, Bell, BellOff, X, Download, Upload, Eye, Square, CheckSquare, PlayCircle, Power, PowerOff } from "lucide-react";
import { API_BASE, api } from "../../lib/api";
import { createRealtimeSocket } from "../../lib/realtime";
import { getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../components/Table";
import { Modal } from "../components/Modal";
import { FadeIn } from "../components/FadeIn";
import { MonitorTemplates } from "../components/MonitorTemplates";
import type { MonitorTemplate } from "../components/MonitorTemplates";
import { relativeTime, formatMonitorType, targetPlaceholder, targetHelperText } from "../components/timeUtils";
import { useToast } from "../../components/ui/toast";
import Link from "next/link";
import { Sparkline } from "../components/Sparkline";

interface MonitorTag {
  id: string;
  name: string;
  color: string;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
  monitorCount: number;
  createdAt: string;
}

interface MonitorItem {
  id: string;
  name: string;
  type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE" | "TCP" | "SSL_CERT" | "HEARTBEAT";
  target: string;
  intervalSec: number;
  enabled: boolean;
  createdAt: string;
  config?: Record<string, unknown>;
  tags?: MonitorTag[];
}

interface MonitorRun {
  id: string;
  monitorId: string;
  ok: boolean;
  statusCode: number;
  latencyMs?: number;
  message: string;
  checkedAt: string;
  level?: "green" | "yellow" | "red";
}

interface AlertChannel {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: string;
}

interface PluginField {
  key: string;
  label: string;
  type: "text" | "number" | "boolean";
  required?: boolean;
  placeholder?: string;
  helpText?: string;
}

interface MonitorPlugin {
  id: string;
  displayName: string;
  description?: string | null;
  supportedMonitorTypes: Array<MonitorItem["type"]>;
  configFields: PluginField[];
}

const inputClass =
  "w-full px-4 py-3 bg-surface-elevated border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent";

const CHANNEL_TYPE_COLORS: Record<string, string> = {
  discord: "text-indigo-400",
  slack: "text-green-400",
  webhook: "text-blue-400",
  telegram: "text-sky-400",
  email: "text-yellow-400",
};

export default function MonitorsPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [monitors, setMonitors] = useState<MonitorItem[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [allChannels, setAllChannels] = useState<AlertChannel[]>([]);
  const [plugins, setPlugins] = useState<MonitorPlugin[]>([]);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [realtimeAlert, setRealtimeAlert] = useState("");

  // create/edit monitor modal
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [showTemplates, setShowTemplates] = useState(true);
  const [editingMonitor, setEditingMonitor] = useState<MonitorItem | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE" | "TCP" | "SSL_CERT" | "HEARTBEAT";
    target: string;
    intervalSec: number;
    enabled: boolean;
    pluginId: string;
    expectedText: string;
    heartbeatTimeoutMin: number;
    heartbeatToken: string;
  }>({
    name: "",
    type: "HTTP",
    target: "",
    intervalSec: 60,
    enabled: true,
    pluginId: "",
    expectedText: "",
    heartbeatTimeoutMin: 5,
    heartbeatToken: "",
  });
  const [tagInput, setTagInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formTouched, setFormTouched] = useState<Record<string, boolean>>({});

  // import/export
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: Array<{ index: number; name: string; error: string }> } | null>(null);

  // external import modal
  const externalImportFileRef = useRef<HTMLInputElement>(null);
  const [showExternalImport, setShowExternalImport] = useState(false);
  const [externalImportSource, setExternalImportSource] = useState<"uptime-robot" | "better-uptime" | "csv">("uptime-robot");
  const [externalImporting, setExternalImporting] = useState(false);
  const [externalImportResult, setExternalImportResult] = useState<{ imported: number; skipped: number; errors: Array<{ index: number; name: string; error: string }>; message: string } | null>(null);

  // bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

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
        const [monitorsData, runsData, channelsData, pluginsData, tagsData] = await Promise.all([
          api<MonitorItem[]>("/v1/monitors", userId),
          api<MonitorRun[]>("/v1/monitors/runs?limit=20", userId),
          api<AlertChannel[]>("/v1/alert-channels", userId),
          api<MonitorPlugin[]>("/v1/monitors/plugins", userId),
          api<TagItem[]>("/v1/tags", userId),
        ]);
        setMonitors(monitorsData);
        setRuns(runsData);
        setAllChannels(channelsData);
        setPlugins(pluginsData);
        setAllTags(tagsData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load monitors");
      } finally {
        setLoading(false);
      }
    }

    loadData();

    const socket = createRealtimeSocket(userId);

    socket.on("connect", () => {
      socket.emit("subscribe", { userId });
    });

    socket.on("monitor.created", (payload: MonitorItem) => {
      setMonitors((prev) => (prev.some((m) => m.id === payload.id) ? prev : [payload, ...prev]));
    });

    socket.on("monitor.updated", (payload: MonitorItem) => {
      setMonitors((prev) => prev.map((m) => (m.id === payload.id ? payload : m)));
    });

    socket.on("monitor.deleted", (payload: { id: string }) => {
      setMonitors((prev) => prev.filter((m) => m.id !== payload.id));
      setRuns((prev) => prev.filter((r) => r.monitorId !== payload.id));
    });

    socket.on(
      "monitor.checked",
      (payload: { run: MonitorRun }) => {
        if (!payload?.run) return;
        setRuns((prev) => [payload.run, ...prev.filter((r) => r.id !== payload.run.id)].slice(0, 20));
      },
    );

    socket.on(
      "alert.triggered",
      (payload: { monitor?: { name?: string }; run?: { level?: string; message?: string } }) => {
        const name = payload?.monitor?.name ?? "Monitor";
        const level = payload?.run?.level?.toUpperCase() ?? "ALERT";
        const message = payload?.run?.message ?? "Notification sent";
        setRealtimeAlert(`${name}: ${level} — ${message}`);
        setTimeout(() => setRealtimeAlert(""), 6000);
      },
    );

    return () => {
      socket.disconnect();
    };
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

  const validateMonitorForm = (): boolean => {
    const errors: Record<string, string> = {};
    const name = formData.name.trim();
    const target = formData.target.trim();

    if (!name) {
      errors.name = "Name is required";
    } else if (name.length < 2) {
      errors.name = "Name must be at least 2 characters";
    } else if (name.length > 100) {
      errors.name = "Name must be 100 characters or less";
    }

    if (!target) {
      errors.target = "Target is required";
    } else if (formData.type === "HTTP") {
      try { new URL(target); } catch { errors.target = "Must be a valid URL (e.g. https://example.com)"; }
    } else if (formData.type === "TCP" && !/^[^:\s]+:\d+$/.test(target)) {
      errors.target = "Must be host:port (e.g. db.example.com:5432)";
    }

    if (formData.intervalSec < 30) errors.interval = "Minimum interval is 30 seconds";
    if (formData.intervalSec > 3600) errors.interval = "Maximum interval is 3600 seconds (1 hour)";
    if (formData.type === "HEARTBEAT" && (formData.heartbeatTimeoutMin < 1 || formData.heartbeatTimeoutMin > 1440)) {
      errors.heartbeatTimeoutMin = "Heartbeat timeout must be between 1 and 1440 minutes";
    }

    if (formData.pluginId === "http.response-match" && !formData.expectedText.trim()) {
      errors.expectedText = "Expected text is required for this plugin";
    }

    setFormErrors(errors);
    setFormTouched({ name: true, target: true, interval: true, expectedText: true, heartbeatTimeoutMin: true });
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateMonitorForm()) return;
    try {
      const config: Record<string, unknown> = {};
      if (formData.pluginId) config.pluginId = formData.pluginId;
      if (formData.expectedText.trim()) config.expectedText = formData.expectedText.trim();
      if (formData.type === "HEARTBEAT") {
        const token = formData.heartbeatToken || crypto.randomUUID();
        config.token = token;
        config.timeoutMin = formData.heartbeatTimeoutMin;
      }

      await api("/v1/monitors", user?.id, {
        method: "POST",
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          target: formData.target,
          intervalSec: formData.intervalSec,
          enabled: formData.enabled,
          config,
          tags: selectedTags,
        }),
      });
      setShowModal(false);
      setFormData({ name: "", type: "HTTP", target: "", intervalSec: 60, enabled: true, pluginId: "", expectedText: "", heartbeatTimeoutMin: 5, heartbeatToken: "" });
      setSelectedTags([]);
      setTagInput("");
      const [monitorsData, tagsData] = await Promise.all([
        api<MonitorItem[]>("/v1/monitors", user?.id),
        api<TagItem[]>("/v1/tags", user?.id),
      ]);
      setMonitors(monitorsData);
      setAllTags(tagsData);
      success("Monitor created");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to create monitor");
    }
  };

  const handleUpdate = async () => {
    if (!editingMonitor) return;
    if (!validateMonitorForm()) return;
    try {
      const config: Record<string, unknown> = {};
      if (formData.pluginId) config.pluginId = formData.pluginId;
      if (formData.expectedText.trim()) config.expectedText = formData.expectedText.trim();
      if (formData.type === "HEARTBEAT") {
        config.token = formData.heartbeatToken;
        config.timeoutMin = formData.heartbeatTimeoutMin;
      }

      await api(`/v1/monitors/${editingMonitor.id}`, user?.id, {
        method: "PATCH",
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          target: formData.target,
          intervalSec: formData.intervalSec,
          enabled: formData.enabled,
          config,
          tags: selectedTags,
        }),
      });
      setShowModal(false);
      setEditingMonitor(null);
      setSelectedTags([]);
      setTagInput("");
      const [monitorsData, tagsData] = await Promise.all([
        api<MonitorItem[]>("/v1/monitors", user?.id),
        api<TagItem[]>("/v1/tags", user?.id),
      ]);
      setMonitors(monitorsData);
      setAllTags(tagsData);
      success("Monitor updated");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to update monitor");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this monitor?")) return;
    try {
      await api(`/v1/monitors/${id}`, user?.id, { method: "DELETE" });
      setMonitors(monitors.filter((m) => m.id !== id));
      success("Monitor deleted");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to delete monitor");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === monitors.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(monitors.map((m) => m.id)));
    }
  };

  const handleBulkAction = async (action: "enable" | "disable" | "delete" | "run") => {
    if (!selectedIds.size) return;
    if (action === "delete" && !window.confirm(`Delete ${selectedIds.size} monitor${selectedIds.size > 1 ? "s" : ""}?`)) return;
    setBulkLoading(true);
    try {
      const result = await api<{ ok: boolean; affected: number }>("/v1/monitors/bulk", user?.id, {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selectedIds), action }),
      });
      if (action === "delete") {
        setMonitors((prev) => prev.filter((m) => !selectedIds.has(m.id)));
        setRuns((prev) => prev.filter((r) => !selectedIds.has(r.monitorId)));
      } else if (action === "enable" || action === "disable") {
        setMonitors((prev) => prev.map((m) => selectedIds.has(m.id) ? { ...m, enabled: action === "enable" } : m));
      }
      setSelectedIds(new Set());
      success(`${result.affected} monitor${result.affected !== 1 ? "s" : ""} ${action === "delete" ? "deleted" : action === "enable" ? "enabled" : action === "disable" ? "disabled" : "queued for check"}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleApplyTemplate = (t: MonitorTemplate) => {
    setFormData({
      name: t.name,
      type: t.type,
      target: t.target,
      intervalSec: t.intervalSec,
      enabled: true,
      pluginId: t.pluginId ?? "",
      expectedText: t.expectedText ?? "",
      heartbeatTimeoutMin: 5,
      heartbeatToken: "",
    });
    setShowTemplates(false);
  };

  const handleExport = async () => {
    try {
      const data = await api<{ version: string; exportedAt: string; monitors: unknown[] }>("/v1/monitors/export", user?.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pulsedock-monitors-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      success("Monitors exported");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Export failed");
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { monitors?: unknown[] };
      const monitorsArray = Array.isArray(parsed) ? parsed : (parsed.monitors ?? []);
      const result = await api<{ imported: number; errors: Array<{ index: number; name: string; error: string }> }>("/v1/monitors/import", user?.id, {
        method: "POST",
        body: JSON.stringify({ monitors: monitorsArray }),
      });
      setImportResult(result);
      const monitorsData = await api<MonitorItem[]>("/v1/monitors", user?.id);
      setMonitors(monitorsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleExternalImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExternalImporting(true);
    setExternalImportResult(null);
    try {
      const text = await file.text();
      let payload: unknown;
      if (externalImportSource === "csv") {
        payload = text;
      } else {
        payload = JSON.parse(text);
      }
      const result = await api<{ imported: number; skipped: number; errors: Array<{ index: number; name: string; error: string }>; message: string }>(
        "/v1/monitors/import-external",
        user?.id,
        {
          method: "POST",
          body: JSON.stringify({ source: externalImportSource, payload }),
        },
      );
      setExternalImportResult(result);
      const monitorsData = await api<MonitorItem[]>("/v1/monitors", user?.id);
      setMonitors(monitorsData);
    } catch (e) {
      setExternalImportResult({ imported: 0, skipped: 0, errors: [], message: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setExternalImporting(false);
      if (externalImportFileRef.current) externalImportFileRef.current.value = "";
    }
  };

  const unassignedChannels = allChannels.filter(
    (c) => !assignedChannels.some((a) => a.id === c.id)
  );

  const availablePlugins = plugins.filter((p) => p.supportedMonitorTypes.includes(formData.type));
  const selectedPlugin = availablePlugins.find((p) => p.id === formData.pluginId) ?? null;

  const filteredMonitors = activeTagFilter
    ? monitors.filter((m) => m.tags?.some((t) => t.name === activeTagFilter))
    : monitors;

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

        {realtimeAlert && (
          <FadeIn>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
              <Bell className="w-5 h-5 text-warning mt-0.5 shrink-0" />
              <span className="text-warning text-sm">{realtimeAlert}</span>
            </div>
          </FadeIn>
        )}

        <FadeIn>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Monitors</h2>
              <p className="text-text-secondary text-sm mt-1">
                {monitors.length} {monitors.length === 1 ? "monitor" : "monitors"} active
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExport}
                className="flex items-center gap-2"
                title="Export monitors as JSON"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2"
                title="Import monitors from PulseDock JSON"
                disabled={importing}
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">{importing ? "Importing…" : "Import"}</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportFile}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setShowExternalImport(true); setExternalImportResult(null); }}
                className="flex items-center gap-2"
                title="Import from Uptime Robot, BetterUptime, or CSV"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Import from…</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setModalMode("create");
                  setEditingMonitor(null);
                  setFormData({ name: "", type: "HTTP", target: "", intervalSec: 60, enabled: true, pluginId: "", expectedText: "", heartbeatTimeoutMin: 5, heartbeatToken: "" });
                  setFormErrors({});
                  setFormTouched({});
                  setSelectedTags([]);
                  setTagInput("");
                  setShowModal(true);
                  setShowTemplates(true);
                }}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Monitor</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>
          </div>
        </FadeIn>

        {allTags.length > 0 && (
          <FadeIn>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setActiveTagFilter(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeTagFilter === null ? "bg-accent text-white" : "bg-surface-elevated text-text-secondary hover:text-text-primary"}`}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => setActiveTagFilter(activeTagFilter === tag.name ? null : tag.name)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-colors border"
                  style={{
                    backgroundColor: activeTagFilter === tag.name ? tag.color + "33" : "transparent",
                    borderColor: tag.color + "66",
                    color: activeTagFilter === tag.name ? tag.color : undefined,
                  }}
                >
                  {tag.name}
                  {tag.monitorCount > 0 && <span className="ml-1 opacity-60">({tag.monitorCount})</span>}
                </button>
              ))}
            </div>
          </FadeIn>
        )}

        {importResult && (
          <FadeIn>
            <div className={`flex items-start gap-3 p-4 rounded-xl border ${importResult.errors.length === 0 ? "bg-success/10 border-success/20" : "bg-warning/10 border-warning/20"}`}>
              <CheckCircle2 className={`w-5 h-5 mt-0.5 shrink-0 ${importResult.errors.length === 0 ? "text-success" : "text-warning"}`} />
              <div className="flex-1">
                <p className={`text-sm font-medium ${importResult.errors.length === 0 ? "text-success" : "text-warning"}`}>
                  Imported {importResult.imported} monitor{importResult.imported !== 1 ? "s" : ""}
                  {importResult.errors.length > 0 && `, ${importResult.errors.length} failed`}
                </p>
                {importResult.errors.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {importResult.errors.map((e, i) => (
                      <li key={i} className="text-xs text-text-secondary">
                        <span className="font-medium">{e.name}</span>: {e.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button onClick={() => setImportResult(null)} className="text-text-secondary hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
          </FadeIn>
        )}

        {filteredMonitors.length === 0 ? (
          <FadeIn delay={0.1}>
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <Monitor className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              {monitors.length === 0 ? (
                <>
                  <p className="text-text-primary text-lg font-medium mb-2">No monitors yet</p>
                  <p className="text-text-secondary text-sm mb-6">
                    Create your first monitor to start tracking uptime and performance
                  </p>
                  <Button
                    size="lg"
                    onClick={() => {
                      setModalMode("create");
                      setEditingMonitor(null);
                      setFormData({ name: "", type: "HTTP", target: "", intervalSec: 60, enabled: true, pluginId: "", expectedText: "", heartbeatTimeoutMin: 5, heartbeatToken: "" });
                      setFormErrors({});
                      setFormTouched({});
                      setSelectedTags([]);
                      setTagInput("");
                      setShowModal(true);
                      setShowTemplates(true);
                    }}
                  >
                    Create your first monitor
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-text-primary text-lg font-medium mb-2">No monitors with tag &quot;{activeTagFilter}&quot;</p>
                  <p className="text-text-secondary text-sm mb-4">
                    Try selecting a different tag or clear the filter
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => setActiveTagFilter(null)}>
                    Clear filter
                  </Button>
                </>
              )}
            </Card>
          </FadeIn>
        ) : (
          <FadeIn delay={0.1}>
            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5">
                <span className="text-sm font-medium text-text-primary mr-1">{selectedIds.size} selected</span>
                <Button size="sm" variant="secondary" onClick={() => handleBulkAction("enable")} disabled={bulkLoading} className="flex items-center gap-1.5">
                  <Power className="w-3.5 h-3.5" />Enable
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleBulkAction("disable")} disabled={bulkLoading} className="flex items-center gap-1.5">
                  <PowerOff className="w-3.5 h-3.5" />Disable
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleBulkAction("run")} disabled={bulkLoading} className="flex items-center gap-1.5">
                  <PlayCircle className="w-3.5 h-3.5" />Run now
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleBulkAction("delete")} disabled={bulkLoading} className="flex items-center gap-1.5 text-danger hover:text-danger ml-auto">
                  <Trash2 className="w-3.5 h-3.5" />Delete
                </Button>
                <button onClick={() => setSelectedIds(new Set())} className="ml-1 p-1 rounded hover:bg-surface-elevated text-text-secondary hover:text-text-primary" aria-label="Clear selection">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <Card className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeader className="w-10">
                        <button
                          onClick={toggleSelectAll}
                          className="p-0.5 rounded text-text-secondary hover:text-text-primary transition-colors"
                          aria-label={selectedIds.size === monitors.length ? "Deselect all" : "Select all"}
                        >
                          {selectedIds.size === monitors.length && monitors.length > 0
                            ? <CheckSquare className="w-4 h-4 text-accent" />
                            : <Square className="w-4 h-4" />}
                        </button>
                      </TableHeader>
                      <TableHeader>Name</TableHeader>
                      <TableHeader className="hidden sm:table-cell">Type</TableHeader>
                      <TableHeader className="hidden md:table-cell">Target</TableHeader>
                      <TableHeader className="hidden lg:table-cell">Interval</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader className="hidden sm:table-cell">Alerts</TableHeader>
                      <TableHeader>Actions</TableHeader>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {filteredMonitors.map((monitor) => {
                      const lastRun = runs.find((r) => r.monitorId === monitor.id);
                      return (
                        <TableRow key={monitor.id} className={selectedIds.has(monitor.id) ? "bg-accent/5" : ""}>
                          <TableCell className="w-10">
                            <button
                              onClick={() => toggleSelect(monitor.id)}
                              className="p-0.5 rounded text-text-secondary hover:text-text-primary transition-colors"
                              aria-label={selectedIds.has(monitor.id) ? `Deselect ${monitor.name}` : `Select ${monitor.name}`}
                            >
                              {selectedIds.has(monitor.id)
                                ? <CheckSquare className="w-4 h-4 text-accent" />
                                : <Square className="w-4 h-4" />}
                            </button>
                          </TableCell>
                          <TableCell className="font-medium text-text-primary">
                            <Link href={"/monitors/" + monitor.id} className="hover:text-accent transition-colors truncate block max-w-[140px] sm:max-w-none">{monitor.name}</Link>
                            {monitor.tags && monitor.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {monitor.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag.id}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-none"
                                    style={{ backgroundColor: tag.color + "22", color: tag.color }}
                                  >
                                    {tag.name}
                                  </span>
                                ))}
                                {monitor.tags.length > 3 && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] text-text-secondary leading-none">
                                    +{monitor.tags.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-text-secondary">{formatMonitorType(monitor.type)}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-text-secondary truncate max-w-[200px]" title={monitor.target}>
                            {monitor.target}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-text-secondary">{monitor.intervalSec}s</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {!monitor.enabled ? (
                                <Badge variant="warning">Disabled</Badge>
                              ) : lastRun ? (
                                <Badge variant={lastRun.ok ? "success" : "danger"}>
                                  {lastRun.ok ? "OK" : "Failed"}
                                </Badge>
                              ) : (
                                <Badge>Pending</Badge>
                              )}
                              <Sparkline runs={runs.filter((r) => r.monitorId === monitor.id).slice(0, 30)} width={80} height={16} />
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
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
                                    pluginId: String(monitor.config?.pluginId ?? ""),
                                    expectedText: String(monitor.config?.expectedText ?? ""),
                                    heartbeatTimeoutMin: Number(monitor.config?.timeoutMin ?? 5),
                                    heartbeatToken: String(monitor.config?.token ?? ""),
                                  });
                                  setSelectedTags(monitor.tags?.map((t) => t.name) ?? []);
                                  setTagInput("");
                                  setFormErrors({});
                                  setFormTouched({});
                                  setShowModal(true);
                  setShowTemplates(true);
                                }}
                                aria-label={`Edit monitor ${monitor.name}`}
                                title="Edit monitor"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(monitor.id)} className="text-danger hover:text-danger" aria-label={`Delete monitor ${monitor.name}`} title="Delete monitor">
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
            <h2 className="text-xl font-bold text-text-primary">Recent Activity</h2>
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
                            {relativeTime(run.checkedAt)}
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
        onClose={() => { setShowModal(false); setEditingMonitor(null); setFormErrors({}); setFormTouched({}); setSelectedTags([]); setTagInput(""); }}
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
          {modalMode === "create" && showTemplates && (
            <div className="rounded-xl border border-border/60 p-3 bg-surface-elevated/30">
              <MonitorTemplates onSelect={handleApplyTemplate} />
              <div className="mt-3 pt-3 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setShowTemplates(false)}
                  className="text-xs text-text-secondary hover:text-accent transition-colors"
                >
                  Start from scratch →
                </button>
              </div>
            </div>
          )}

          {modalMode === "create" && !showTemplates && (
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              className="text-xs text-text-secondary hover:text-accent transition-colors flex items-center gap-1"
            >
              ← Use a template
            </button>
          )}

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Monitor Name <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (formTouched.name) setFormErrors((prev) => ({ ...prev, name: e.target.value.trim().length < 2 ? "Name must be at least 2 characters" : "" }));
              }}
              onBlur={() => setFormTouched((t) => ({ ...t, name: true }))}
              className={`${inputClass} ${formTouched.name && formErrors.name ? "border-danger focus:ring-danger" : ""}`}
              placeholder="My API"
              aria-required="true"
              aria-invalid={formTouched.name && !!formErrors.name}
              aria-describedby={formErrors.name ? "name-error" : undefined}
            />
            {formTouched.name && formErrors.name && (
              <p id="name-error" role="alert" className="mt-1 text-xs text-danger">{formErrors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => {
                const nextType = e.target.value as typeof formData.type;
                setFormData({
                  ...formData,
                  type: nextType,
                  pluginId: "",
                  expectedText: "",
                  heartbeatTimeoutMin: nextType === "HEARTBEAT" ? formData.heartbeatTimeoutMin || 5 : formData.heartbeatTimeoutMin,
                  heartbeatToken: nextType === "HEARTBEAT" ? (formData.heartbeatToken || crypto.randomUUID()) : formData.heartbeatToken,
                });
              }}
              className={inputClass}
            >
              <option value="HTTP">HTTP Check</option>
              <option value="GIT_RELEASE">Git Release</option>
              <option value="DOCKER_IMAGE">Docker Image</option>
              <option value="TCP">TCP Port</option>
              <option value="SSL_CERT">SSL Certificate</option>
              <option value="HEARTBEAT">Heartbeat</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Check Plugin</label>
            <select
              value={formData.pluginId}
              onChange={(e) => setFormData({ ...formData, pluginId: e.target.value, expectedText: "" })}
              className={inputClass}
            >
              <option value="">Built-in check logic</option>
              {availablePlugins.map((plugin) => (
                <option key={plugin.id} value={plugin.id}>
                  {plugin.displayName}
                </option>
              ))}
            </select>
            {selectedPlugin?.description && (
              <p className="mt-1 text-xs text-text-secondary">{selectedPlugin.description}</p>
            )}
          </div>

          {formData.pluginId === "http.response-match" && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Expected response text <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input
                type="text"
                value={formData.expectedText}
                onChange={(e) => {
                  setFormData({ ...formData, expectedText: e.target.value });
                  if (formTouched.expectedText) setFormErrors((prev) => ({ ...prev, expectedText: !e.target.value.trim() ? "Expected text is required" : "" }));
                }}
                onBlur={() => setFormTouched((t) => ({ ...t, expectedText: true }))}
                className={`${inputClass} ${formTouched.expectedText && formErrors.expectedText ? "border-danger focus:ring-danger" : ""}`}
                placeholder={selectedPlugin?.configFields?.[0]?.placeholder ?? "OK"}
                aria-invalid={formTouched.expectedText && !!formErrors.expectedText}
              />
              {formTouched.expectedText && formErrors.expectedText ? (
                <p role="alert" className="mt-1 text-xs text-danger">{formErrors.expectedText}</p>
              ) : (
                <p className="mt-1 text-xs text-text-secondary">
                  {selectedPlugin?.configFields?.[0]?.helpText ?? "Case-sensitive substring that must be present in the response body."}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Target <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <input
              type="text"
              value={formData.target}
              onChange={(e) => {
                setFormData({ ...formData, target: e.target.value });
                if (formTouched.target) {
                  let err = "";
                  const nextTarget = e.target.value.trim();
                  if (!nextTarget) err = "Target is required";
                  else if (formData.type === "HTTP") { try { new URL(nextTarget); } catch { err = "Must be a valid URL"; } }
                  else if (formData.type === "TCP" && !/^[^:\s]+:\d+$/.test(nextTarget)) err = "Must be host:port";
                  setFormErrors((prev) => ({ ...prev, target: err }));
                }
              }}
              onBlur={() => setFormTouched((t) => ({ ...t, target: true }))}
              className={`${inputClass} ${formTouched.target && formErrors.target ? "border-danger focus:ring-danger" : ""}`}
              placeholder={targetPlaceholder(formData.type)}
              aria-required="true"
              aria-invalid={formTouched.target && !!formErrors.target}
              aria-describedby={formErrors.target ? "target-error" : "target-hint"}
            />
            {formTouched.target && formErrors.target ? (
              <p id="target-error" role="alert" className="mt-1 text-xs text-danger">{formErrors.target}</p>
            ) : (
              <p id="target-hint" className="mt-1 text-xs text-text-secondary">{targetHelperText(formData.type)}</p>
            )}
          </div>

          {formData.type === "HEARTBEAT" && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Alert if no ping for (minutes) <span className="text-danger" aria-hidden="true">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={formData.heartbeatTimeoutMin}
                  onChange={(e) => {
                    const value = Math.max(1, Number(e.target.value || 1));
                    setFormData({ ...formData, heartbeatTimeoutMin: value });
                  }}
                  className={inputClass}
                />
                {formErrors.heartbeatTimeoutMin && (
                  <p role="alert" className="mt-1 text-xs text-danger">{formErrors.heartbeatTimeoutMin}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Ping URL</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${API_BASE}/v1/heartbeat/${formData.heartbeatToken || "<token>"}`}
                    className={`${inputClass} font-mono text-xs`}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      const url = `${API_BASE}/v1/heartbeat/${formData.heartbeatToken || "<token>"}`;
                      await navigator.clipboard.writeText(url);
                      success("Heartbeat URL copied");
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <p className="mt-1 text-xs text-text-secondary">Call this URL with POST from your cron job or app to mark it healthy.</p>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Check Interval (seconds) <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <input
              type="number"
              min="30"
              max="3600"
              value={formData.intervalSec}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setFormData({ ...formData, intervalSec: val });
                if (formTouched.interval) setFormErrors((prev) => ({ ...prev, interval: val < 30 ? "Min 30s" : val > 3600 ? "Max 3600s" : "" }));
              }}
              onBlur={() => setFormTouched((t) => ({ ...t, interval: true }))}
              className={`${inputClass} ${formTouched.interval && formErrors.interval ? "border-danger focus:ring-danger" : ""}`}
              aria-invalid={formTouched.interval && !!formErrors.interval}
            />
            {formTouched.interval && formErrors.interval ? (
              <p role="alert" className="mt-1 text-xs text-danger">{formErrors.interval}</p>
            ) : (
              <p className="mt-1 text-xs text-text-secondary">Between 30 and 3600 seconds</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Tags</label>
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedTags.map((tag) => {
                  const tagObj = allTags.find((t) => t.name === tag);
                  return (
                    <span
                      key={tag}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: (tagObj?.color ?? "#6366f1") + "22", color: tagObj?.color ?? "#6366f1" }}
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
                        aria-label={`Remove tag ${tag}`}
                        className="hover:opacity-70"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                  e.preventDefault();
                  const newTag = tagInput.trim().replace(/,+$/, "").trim();
                  if (newTag && !selectedTags.includes(newTag)) {
                    setSelectedTags((prev) => [...prev, newTag]);
                  }
                  setTagInput("");
                }
              }}
              className={inputClass}
              placeholder="Type a tag name, press Enter or comma"
            />
            {allTags.filter((t) => !selectedTags.includes(t.name)).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {allTags
                  .filter((t) => !selectedTags.includes(t.name))
                  .map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => setSelectedTags((prev) => [...prev, tag.name])}
                      className="px-2 py-0.5 rounded-full text-xs border transition-colors hover:opacity-80"
                      style={{ borderColor: tag.color + "66", color: tag.color }}
                    >
                      + {tag.name}
                    </button>
                  ))}
              </div>
            )}
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
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="alert-panel-title"
            className="relative w-full max-w-md bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Bell className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h3 id="alert-panel-title" className="text-base font-semibold text-text-primary">Alert Channels</h3>
                  <p className="text-xs text-text-secondary truncate max-w-[200px]">{alertPanelMonitor.name}</p>
                </div>
              </div>
              <button
                onClick={() => setAlertPanelMonitor(null)}
                className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-text-secondary hover:text-text-primary"
                aria-label="Close alert channels panel"
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
                              aria-label={`Remove ${channel.name} from this monitor`}
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
                              aria-label={`Add ${channel.name} to this monitor`}
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
      {/* External Import Modal */}
      {showExternalImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Import from external service</h2>
              <button onClick={() => setShowExternalImport(false)} className="text-text-secondary hover:text-text-primary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Source selector */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-text-primary">Source</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "uptime-robot", label: "Uptime Robot", hint: "JSON export" },
                    { id: "better-uptime", label: "BetterUptime", hint: "JSON export" },
                    { id: "csv", label: "Generic CSV", hint: ".csv file" },
                  ] as const).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setExternalImportSource(s.id)}
                      className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border text-sm transition-colors ${
                        externalImportSource === s.id
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-surface-secondary text-text-secondary hover:border-accent/50"
                      }`}
                    >
                      <span className="font-medium">{s.label}</span>
                      <span className="text-xs opacity-70">{s.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Instructions */}
              <div className="rounded-xl bg-surface-secondary border border-border p-4 text-xs text-text-secondary space-y-1">
                {externalImportSource === "uptime-robot" && (
                  <>
                    <p className="font-medium text-text-primary mb-1">How to export from Uptime Robot:</p>
                    <p>1. Log in → My Settings → Export → Download JSON</p>
                    <p>2. Upload the downloaded <code className="font-mono bg-surface px-1 rounded">uptimerobot-*.json</code> file below.</p>
                    <p className="mt-1 text-text-secondary/70">Only HTTP/HTTPS monitors are imported. Ping, port, and keyword monitors are skipped.</p>
                  </>
                )}
                {externalImportSource === "better-uptime" && (
                  <>
                    <p className="font-medium text-text-primary mb-1">How to export from BetterUptime:</p>
                    <p>1. Use the BetterUptime API: <code className="font-mono bg-surface px-1 rounded">GET /api/v2/monitors</code></p>
                    <p>2. Save the JSON response and upload it below.</p>
                    <p className="mt-1 text-text-secondary/70">Only status/keyword check types are imported.</p>
                  </>
                )}
                {externalImportSource === "csv" && (
                  <>
                    <p className="font-medium text-text-primary mb-1">CSV format:</p>
                    <p>First row must be headers. Required column: <code className="font-mono bg-surface px-1 rounded">url</code></p>
                    <p>Optional: <code className="font-mono bg-surface px-1 rounded">name</code>, <code className="font-mono bg-surface px-1 rounded">interval</code>, <code className="font-mono bg-surface px-1 rounded">paused</code></p>
                  </>
                )}
              </div>

              {/* Result */}
              {externalImportResult && (
                <div className={`rounded-xl p-4 border text-sm ${
                  externalImportResult.errors.length === 0 && externalImportResult.imported > 0
                    ? "bg-success/10 border-success/20 text-success"
                    : externalImportResult.imported === 0
                      ? "bg-danger/10 border-danger/20 text-danger"
                      : "bg-warning/10 border-warning/20 text-warning"
                }`}>
                  <p className="font-medium">{externalImportResult.message}</p>
                  {externalImportResult.skipped > 0 && (
                    <p className="text-xs mt-1 opacity-80">{externalImportResult.skipped} duplicate{externalImportResult.skipped !== 1 ? "s" : ""} skipped (URL already monitored).</p>
                  )}
                  {externalImportResult.errors.map((err, i) => (
                    <p key={i} className="text-xs mt-1 opacity-80">⚠ {err.name}: {err.error}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setShowExternalImport(false)}>Cancel</Button>
              <Button
                onClick={() => externalImportFileRef.current?.click()}
                disabled={externalImporting}
                className="flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {externalImporting ? "Importing…" : "Choose file & Import"}
              </Button>
              <input
                ref={externalImportFileRef}
                type="file"
                accept={externalImportSource === "csv" ? ".csv,text/csv" : ".json,application/json"}
                className="hidden"
                onChange={handleExternalImportFile}
              />
            </div>
          </div>
        </div>
      )}
    </AppFrame>
  );
}
