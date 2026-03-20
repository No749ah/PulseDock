"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, AlertCircle, CheckCircle2, Monitor, Bell, BellOff, X, Download, Upload, Eye, Square, CheckSquare, PlayCircle, Power, PowerOff, Shield, Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, LayoutGrid, List, SlidersHorizontal, BookmarkPlus, Bookmark, Filter, Clock, Tag } from "lucide-react";
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
import { MonitorStatusCell } from "../components/MonitorStatusCell";
import { MiniSparkline } from "../../components/charts";
import { HelpTooltip } from "../../components/help-tooltip";

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

interface AlertChannelSummary {
  id: string;
  name: string;
  type: string;
  notifyOn: string;
}

interface MonitorItem {
  id: string;
  name: string;
  type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE" | "TCP" | "SSL_CERT" | "HEARTBEAT";
  target: string;
  intervalSec: number;
  confirmations: number;
  enabled: boolean;
  createdAt: string;
  folderId?: string | null;
  config?: Record<string, unknown>;
  tags?: MonitorTag[];
  alertChannels?: AlertChannelSummary[];
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
  notifyOn?: string;
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

const NOTIFY_ON_LABELS: Record<string, string> = {
  ON_CHANGE:     "On status change",
  ALWAYS:        "Every failed check",
  FIRST_ONLY:    "First failure only",
  DAILY_DIGEST:  "Daily digest",
  VERSION_ANY:   "Any update",
  VERSION_MAJOR: "Major updates only",
};

const UPTIME_NOTIFY_OPTIONS = [
  { value: "ON_CHANGE",    label: "On status change" },
  { value: "ALWAYS",       label: "Every failed check" },
  { value: "FIRST_ONLY",   label: "First failure only" },
  { value: "DAILY_DIGEST", label: "Daily digest (max 1/day)" },
];

const VERSION_NOTIFY_OPTIONS = [
  { value: "VERSION_ANY",   label: "Any update (minor + major)" },
  { value: "VERSION_MAJOR", label: "Major updates only" },
];

function MonitorsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: toastError } = useToast();
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [monitors, setMonitors] = useState<MonitorItem[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [allChannels, setAllChannels] = useState<AlertChannel[]>([]);
  const [plugins, setPlugins] = useState<MonitorPlugin[]>([]);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  // Advanced filter panel state
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set(["up", "down", "degraded", "paused"]));
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set(["HTTP", "TCP", "SSL_CERT", "HEARTBEAT"]));
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set());
  const [savedPresets, setSavedPresets] = useState<Array<{ name: string; filters: Record<string, string> }>>(() => {
    try { return JSON.parse(localStorage.getItem("monitor-filter-presets") || "[]"); } catch { return []; }
  });
  const [sortBy, setSortBy] = useState<"name" | "status" | "latency" | "uptime" | "lastChecked" | "type" | "interval">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  // Column visibility (persisted to localStorage)
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("monitor-col-visibility");
      return stored ? JSON.parse(stored) : { type: true, target: true, interval: true, trend: true, alerts: true, latency: true };
    } catch {
      return { type: true, target: true, interval: true, trend: true, alerts: true, latency: true };
    }
  });
  const [showColPicker, setShowColPicker] = useState(false);
  const toggleCol = (col: string) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [col]: !prev[col] };
      try { localStorage.setItem("monitor-col-visibility", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(() => {
    try { const s = localStorage.getItem("monitor-page-size"); return s ? (s === "all" ? "all" : Number(s)) : 25; } catch { return 25; }
  });

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
    type: "HTTP" | "TCP" | "SSL_CERT" | "HEARTBEAT";
    target: string;
    intervalSec: number;
    confirmations: number;
    enabled: boolean;
    pluginId: string;
    expectedText: string;
    heartbeatTimeoutMin: number;
    heartbeatToken: string;
    folderId: string;
  }>({
    name: "",
    type: "HTTP",
    target: "",
    intervalSec: 60,
    confirmations: 1,
    enabled: true,
    pluginId: "",
    expectedText: "",
    heartbeatTimeoutMin: 5,
    heartbeatToken: "",
    folderId: "",
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
  const lastSelectedIndexRef = useRef<number>(-1);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [checkingNowId, setCheckingNowId] = useState<string | null>(null);

  // badge modal
  const [badgeMonitor, setBadgeMonitor] = useState<MonitorItem | null>(null);

  // row expansion
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRowExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // alert assignment panel
  const [alertPanelMonitor, setAlertPanelMonitor] = useState<MonitorItem | null>(null);
  const [assignedChannels, setAssignedChannels] = useState<AlertChannel[]>([]);
  const [alertPanelLoading, setAlertPanelLoading] = useState(false);
  const [alertPanelError, setAlertPanelError] = useState("");

  // Reset to page 1 when filters/sort change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, typeFilter, activeTagFilter, folderFilter, sortBy, sortDir, filterStatuses, filterTypes, filterTags]);

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
        const [monitorsData, runsData, channelsData, pluginsData, tagsData, foldersData] = await Promise.all([
          api<MonitorItem[]>("/v1/monitors", userId),
          api<MonitorRun[]>("/v1/monitors/runs?limit=20", userId),
          api<AlertChannel[]>("/v1/alert-channels", userId),
          api<MonitorPlugin[]>("/v1/monitors/plugins", userId),
          api<TagItem[]>("/v1/tags", userId),
          api<{ id: string; name: string }[]>("/v1/folders", userId),
        ]);
        setMonitors(monitorsData);
        setRuns(runsData);
        setAllChannels(channelsData);
        setPlugins(pluginsData);
        setAllTags(tagsData);
        setFolders(foldersData);
        const folderParam = searchParams.get("folder");
        if (folderParam) {
          setFolderFilter(folderParam);
        }
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
      // Refresh monitor list so alert pills update
      const updatedMonitors = await api<MonitorItem[]>("/v1/monitors", user?.id);
      setMonitors(updatedMonitors);
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : "Failed to assign channel");
    }
  };

  const unassignChannel = async (channelId: string) => {
    if (!alertPanelMonitor) return;
    try {
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, user?.id, { method: "DELETE" });
      setAssignedChannels((prev) => prev.filter((c) => c.id !== channelId));
      const updatedMonitors = await api<MonitorItem[]>("/v1/monitors", user?.id);
      setMonitors(updatedMonitors);
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : "Failed to unassign channel");
    }
  };

  const updateNotifyOn = async (channelId: string, notifyOn: string) => {
    if (!alertPanelMonitor) return;
    try {
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, user?.id, {
        method: "PATCH",
        body: JSON.stringify({ notifyOn }),
      });
      setAssignedChannels((prev) => prev.map((c) => c.id === channelId ? { ...c, notifyOn } : c));
      const updatedMonitors = await api<MonitorItem[]>("/v1/monitors", user?.id);
      setMonitors(updatedMonitors);
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : "Failed to update notification setting");
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
    if (formData.confirmations < 1) errors.confirmations = "Minimum is 1 confirmation";
    if (formData.confirmations > 10) errors.confirmations = "Maximum is 10 confirmations";
    if (formData.type === "HEARTBEAT" && (formData.heartbeatTimeoutMin < 1 || formData.heartbeatTimeoutMin > 1440)) {
      errors.heartbeatTimeoutMin = "Heartbeat timeout must be between 1 and 1440 minutes";
    }

    if (formData.pluginId === "http.response-match" && !formData.expectedText.trim()) {
      errors.expectedText = "Expected text is required for this plugin";
    }

    setFormErrors(errors);
    setFormTouched({ name: true, target: true, interval: true, confirmations: true, expectedText: true, heartbeatTimeoutMin: true });
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
      if (formData.type === "HTTP") {
        const f = formData as typeof formData & { expectedStatus?: number; bodyContains?: string; httpMethod?: string; requestHeaders?: string; requestBody?: string; responseTimeThresholdMs?: number };
        if (f.expectedStatus) config.expectedStatus = f.expectedStatus;
        if (f.bodyContains?.trim()) config.bodyContains = f.bodyContains.trim();
        if (f.httpMethod && f.httpMethod !== "GET") config.httpMethod = f.httpMethod;
        if (f.requestHeaders?.trim()) {
          try {
            const parsed: Record<string, string> = {};
            for (const line of f.requestHeaders.split("\n")) {
              const idx = line.indexOf(":");
              if (idx > 0) {
                const key = line.slice(0, idx).trim();
                const val = line.slice(idx + 1).trim();
                if (key) parsed[key] = val;
              }
            }
            if (Object.keys(parsed).length > 0) config.requestHeaders = parsed;
          } catch { /* skip invalid */ }
        }
        if (f.requestBody?.trim()) config.requestBody = f.requestBody.trim();
        if (f.responseTimeThresholdMs && f.responseTimeThresholdMs > 0) config.responseTimeThresholdMs = f.responseTimeThresholdMs;
      }

      await api("/v1/monitors", user?.id, {
        method: "POST",
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          target: formData.target,
          intervalSec: formData.intervalSec,
          confirmations: formData.confirmations,
          enabled: formData.enabled,
          config,
          tags: selectedTags,
          folderId: formData.folderId || null,
        }),
      });
      setShowModal(false);
      setFormData({ name: "", type: "HTTP", target: "", intervalSec: 60, confirmations: 1, enabled: true, pluginId: "", expectedText: "", heartbeatTimeoutMin: 5, heartbeatToken: "", folderId: "" });
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
      if (formData.type === "HTTP") {
        const f = formData as typeof formData & { expectedStatus?: number; bodyContains?: string; httpMethod?: string; requestHeaders?: string; requestBody?: string; responseTimeThresholdMs?: number };
        if (f.expectedStatus) config.expectedStatus = f.expectedStatus;
        if (f.bodyContains?.trim()) config.bodyContains = f.bodyContains.trim();
        if (f.httpMethod && f.httpMethod !== "GET") config.httpMethod = f.httpMethod;
        if (f.requestHeaders?.trim()) {
          try {
            const parsed: Record<string, string> = {};
            for (const line of f.requestHeaders.split("\n")) {
              const idx = line.indexOf(":");
              if (idx > 0) {
                const key = line.slice(0, idx).trim();
                const val = line.slice(idx + 1).trim();
                if (key) parsed[key] = val;
              }
            }
            if (Object.keys(parsed).length > 0) config.requestHeaders = parsed;
          } catch { /* skip invalid */ }
        }
        if (f.requestBody?.trim()) config.requestBody = f.requestBody.trim();
        if (f.responseTimeThresholdMs && f.responseTimeThresholdMs > 0) config.responseTimeThresholdMs = f.responseTimeThresholdMs;
      }

      await api(`/v1/monitors/${editingMonitor.id}`, user?.id, {
        method: "PATCH",
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          target: formData.target,
          intervalSec: formData.intervalSec,
          confirmations: formData.confirmations,
          enabled: formData.enabled,
          config,
          tags: selectedTags,
          folderId: formData.folderId || null,
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

  const toggleSelect = (id: string, event?: React.MouseEvent) => {
    const currentIndex = monitors.findIndex((m) => m.id === id);
    if (event?.shiftKey && lastSelectedIndexRef.current >= 0 && currentIndex >= 0) {
      // Range selection: select all monitors between last clicked and current
      const lo = Math.min(lastSelectedIndexRef.current, currentIndex);
      const hi = Math.max(lastSelectedIndexRef.current, currentIndex);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) {
          next.add(monitors[i].id);
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    }
    lastSelectedIndexRef.current = currentIndex;
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

  const handleCheckNow = async (monitorId: string) => {
    if (checkingNowId) return;
    setCheckingNowId(monitorId);
    try {
      await api("/v1/monitors/bulk", user?.id, {
        method: "POST",
        body: JSON.stringify({ ids: [monitorId], action: "run" }),
      });
      success("Check triggered");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to trigger check");
    } finally {
      setCheckingNowId(null);
    }
  };

  const handleApplyTemplate = (t: MonitorTemplate) => {
    // Version types are handled on the Versions page; fall back to HTTP if a version template slips through
    const safeType = (["HTTP", "TCP", "SSL_CERT", "HEARTBEAT"] as string[]).includes(t.type)
      ? (t.type as "HTTP" | "TCP" | "SSL_CERT" | "HEARTBEAT")
      : "HTTP";
    setFormData({
      name: t.name,
      type: safeType,
      target: t.target,
      intervalSec: t.intervalSec,
      confirmations: 1,
      enabled: true,
      pluginId: t.pluginId ?? "",
      expectedText: t.expectedText ?? "",
      heartbeatTimeoutMin: 5,
      heartbeatToken: "",
      folderId: "",
    });
    setShowTemplates(false);
  };

  const handleExport = async (format: "json" | "csv" = "json") => {
    try {
      const data = await api<{ version: string; exportedAt: string; monitors: MonitorItem[] }>("/v1/monitors/export", user?.id);
      let blob: Blob;
      let filename: string;
      if (format === "csv") {
        const headers = ["id", "name", "type", "target", "enabled", "interval", "tags"];
        const rows = data.monitors.map((m) => [
          `"${(m.id ?? "").replace(/"/g, '""')}"`,
          `"${(m.name ?? "").replace(/"/g, '""')}"`,
          m.type ?? "",
          `"${(m.target ?? "").replace(/"/g, '""')}"`,
          m.enabled ? "true" : "false",
          m.intervalSec ?? "",
          `"${(m.tags ?? []).map((t: { name: string }) => t.name).join(", ")}"`,
        ]);
        const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
        blob = new Blob([csv], { type: "text/csv" });
        filename = `pulsedock-monitors-${new Date().toISOString().slice(0, 10)}.csv`;
      } else {
        blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        filename = `pulsedock-monitors-${new Date().toISOString().slice(0, 10)}.json`;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      success(`Monitors exported as ${format.toUpperCase()}`);
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

  // Compute active filter count for badge
  const defaultStatuses = new Set(["up", "down", "degraded", "paused"]);
  const defaultTypes = new Set(["HTTP", "TCP", "SSL_CERT", "HEARTBEAT"]);
  const activeFilterCount =
    (filterStatuses.size < defaultStatuses.size ? 1 : 0) +
    (filterTypes.size < defaultTypes.size ? 1 : 0) +
    (filterTags.size > 0 ? 1 : 0);

  const filteredMonitors = monitors.filter((m) => {
    // Version-type monitors belong on the Versions page — never show here
    if (m.type === "GIT_RELEASE" || m.type === "DOCKER_IMAGE") return false;
    // Tag filter (from chips above table)
    if (activeTagFilter && !m.tags?.some((t) => t.name === activeTagFilter)) return false;
    // Enabled/disabled filter (legacy top bar)
    if (statusFilter === "enabled" && !m.enabled) return false;
    if (statusFilter === "disabled" && m.enabled) return false;
    if (folderFilter && m.folderId !== folderFilter) return false;
    // Advanced type filter
    if (filterTypes.size < defaultTypes.size && !filterTypes.has(m.type)) return false;
    // Legacy single type filter
    if (typeFilter !== "all" && m.type !== typeFilter) return false;
    // Advanced tag filter (from panel)
    if (filterTags.size > 0 && !m.tags?.some((t) => filterTags.has(t.name))) return false;
    // Advanced status filter
    if (filterStatuses.size < defaultStatuses.size) {
      const lastRun = runs.find((r) => r.monitorId === m.id);
      if (!m.enabled) {
        if (!filterStatuses.has("paused")) return false;
      } else if (!lastRun) {
        // no data yet — treat as up
        if (!filterStatuses.has("up")) return false;
      } else {
        const lvl = lastRun.level ?? "green";
        if (lvl === "green" && !filterStatuses.has("up")) return false;
        if (lvl === "yellow" && !filterStatuses.has("degraded")) return false;
        if (lvl === "red" && !filterStatuses.has("down")) return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !m.target.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const MONITOR_TYPES = ["HTTP", "TCP", "SSL_CERT", "HEARTBEAT"] as const;

  function saveCurrentPreset() {
    const name = prompt("Save filter preset as:");
    if (!name?.trim()) return;
    const preset = { name: name.trim(), filters: { statusFilter, typeFilter, activeTagFilter: activeTagFilter ?? "", folderFilter: folderFilter ?? "" } };
    const next = [...savedPresets, preset];
    setSavedPresets(next);
    try { localStorage.setItem("monitor-filter-presets", JSON.stringify(next)); } catch {}
  }

  function applyPreset(preset: (typeof savedPresets)[number]) {
    setStatusFilter((preset.filters.statusFilter as "all" | "enabled" | "disabled") || "all");
    setTypeFilter(preset.filters.typeFilter || "all");
    setActiveTagFilter(preset.filters.activeTagFilter || null);
    setFolderFilter(preset.filters.folderFilter || null);
  }

  function deletePreset(idx: number) {
    const next = savedPresets.filter((_, i) => i !== idx);
    setSavedPresets(next);
    try { localStorage.setItem("monitor-filter-presets", JSON.stringify(next)); } catch {}
  }

  function handleSort(col: typeof sortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  const sortedMonitors = [...filteredMonitors].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const runA = runs.find((r) => r.monitorId === a.id);
    const runB = runs.find((r) => r.monitorId === b.id);
    switch (sortBy) {
      case "name":
        return dir * a.name.localeCompare(b.name);
      case "status": {
        const order = { green: 0, yellow: 1, red: 2, undefined: 3 };
        const la = (runA?.level ?? "undefined") as keyof typeof order;
        const lb = (runB?.level ?? "undefined") as keyof typeof order;
        return dir * ((order[la] ?? 3) - (order[lb] ?? 3));
      }
      case "latency": {
        const la = runA?.latencyMs ?? Infinity;
        const lb = runB?.latencyMs ?? Infinity;
        return dir * (la - lb);
      }
      case "lastChecked": {
        const ta = runA?.checkedAt ? new Date(runA.checkedAt).getTime() : 0;
        const tb = runB?.checkedAt ? new Date(runB.checkedAt).getTime() : 0;
        return dir * (ta - tb);
      }
      case "type":
        return dir * a.type.localeCompare(b.type);
      case "interval":
        return dir * (a.intervalSec - b.intervalSec);
      default:
        return 0;
    }
  });

  // Paginated slice
  const totalFiltered = sortedMonitors.length;
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(totalFiltered / (pageSize as number)));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedMonitors = pageSize === "all"
    ? sortedMonitors
    : sortedMonitors.slice((safePage - 1) * (pageSize as number), safePage * (pageSize as number));

  if (!user) return null;
  if (loading)
    return (
      <AppFrame title="Uptime Checks">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      </AppFrame>
    );

  return (
    <AppFrame title="Uptime Checks" subtitle="HTTP, TCP, SSL & Heartbeat monitors" breadcrumbs={[{ label: "Monitors" }]}>
      <div className="space-y-6">
        {error && (
          
            <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20">
              <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
              <span className="text-danger text-sm">{error}</span>
            </div>
          
        )}

        {realtimeAlert && (
          
            <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
              <Bell className="w-5 h-5 text-warning mt-0.5 shrink-0" />
              <span className="text-warning text-sm">{realtimeAlert}</span>
            </div>
          
        )}

        
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Uptime Checks</h2>
              <p className="text-text-secondary text-sm mt-1">
                {monitors.filter((m) => m.type !== "GIT_RELEASE" && m.type !== "DOCKER_IMAGE").length} monitors
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setViewMode("table")}
                  className={`p-1.5 transition-colors ${viewMode === "table" ? "bg-accent/20 text-accent" : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"}`}
                  title="Table view"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-accent/20 text-accent" : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"}`}
                  title="Grid view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Column visibility toggle (table view only) */}
              {viewMode === "table" && (
                <div className="relative">
                  <button
                    onClick={() => setShowColPicker((v) => !v)}
                    title="Toggle column visibility"
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${showColPicker ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated"}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Columns</span>
                  </button>
                  {showColPicker && (
                    <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-xl border border-border bg-surface shadow-xl shadow-black/30 p-2 space-y-1">
                      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-2 py-1">Visible Columns</p>
                      {([ ["type", "Type"], ["target", "Target"], ["interval", "Interval"], ["latency", "Latency"], ["trend", "Trend"], ["alerts", "Alerts"] ] as [string, string][]).map(([col, label]) => (
                        <button
                          key={col}
                          onClick={() => toggleCol(col)}
                          className="flex items-center justify-between w-full rounded-lg px-2 py-1.5 text-xs hover:bg-surface-elevated transition-colors"
                        >
                          <span className={visibleCols[col] ? "text-text-primary" : "text-text-muted"}>{label}</span>
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] ${visibleCols[col] ? "bg-accent border-accent text-white" : "border-border"}`}>
                            {visibleCols[col] ? "✓" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-0.5 bg-surface-elevated border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => handleExport("json")}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                  title="Export monitors as JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">JSON</span>
                </button>
                <div className="w-px h-4 bg-border" />
                <button
                  onClick={() => handleExport("csv")}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                  title="Export monitors as CSV"
                >
                  <span className="hidden sm:inline">CSV</span>
                  <span className="sm:hidden"><Download className="w-3.5 h-3.5" /></span>
                </button>
              </div>
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
                  setFormData({ name: "", type: "HTTP", target: "", intervalSec: 60, confirmations: 1, enabled: true, pluginId: "", expectedText: "", heartbeatTimeoutMin: 5, heartbeatToken: "", folderId: "" });
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
        

        {/* Search + Status filter bar */}
        
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
              <input
                type="text"
                placeholder="Search monitors…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 bg-surface-elevated border border-border rounded-lg p-1">
              {(["all", "enabled", "disabled"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize ${statusFilter === f ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"}`}
                >
                  {f}
                </button>
              ))}
            </div>
            {folders.length > 0 && (
              <select
                value={folderFilter ?? ""}
                onChange={(e) => setFolderFilter(e.target.value || null)}
                className="px-3 py-2 bg-surface-elevated border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                aria-label="Filter by project"
              >
                <option value="">All Projects</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => setShowAdvancedFilters((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${showAdvancedFilters || activeFilterCount > 0 ? "bg-accent/10 border-accent/40 text-accent" : "bg-surface-elevated border-border text-text-secondary hover:text-text-primary"}`}
              aria-label="Advanced filters"
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          
            <div className="rounded-xl border border-border bg-surface/60 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">Filters</span>
                <div className="flex items-center gap-2">
                  {savedPresets.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {savedPresets.map((preset, idx) => (
                        <div key={idx} className="flex items-center gap-0.5 bg-surface-elevated border border-border rounded-lg overflow-hidden">
                          <button
                            onClick={() => applyPreset(preset)}
                            className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
                          >
                            <Bookmark className="w-3 h-3 inline mr-1" />
                            {preset.name}
                          </button>
                          <button
                            onClick={() => deletePreset(idx)}
                            className="px-1.5 py-1 text-text-muted hover:text-danger transition-colors"
                            aria-label={`Delete preset ${preset.name}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={saveCurrentPreset}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-surface-elevated text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    Save
                  </button>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => {
                        setFilterStatuses(new Set(["up", "down", "degraded", "paused"]));
                        setFilterTypes(new Set(["HTTP", "TCP", "SSL_CERT", "HEARTBEAT"]));
                        setFilterTags(new Set());
                        setTypeFilter("all");
                        setStatusFilter("all");
                        setActiveTagFilter(null);
                        setFolderFilter(null);
                      }}
                      className="text-xs text-danger/70 hover:text-danger transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Status filter */}
                <div className="space-y-2">
                  <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Status</span>
                  <div className="space-y-1.5">
                    {([
                      { key: "up", label: "Up", color: "text-success" },
                      { key: "down", label: "Down", color: "text-danger" },
                      { key: "degraded", label: "Degraded", color: "text-warning" },
                      { key: "paused", label: "Paused", color: "text-text-secondary" },
                    ] as const).map(({ key, label, color }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={filterStatuses.has(key)}
                          onChange={() => {
                            setFilterStatuses((prev) => {
                              const next = new Set(prev);
                              next.has(key) ? next.delete(key) : next.add(key);
                              return next;
                            });
                          }}
                          className="w-3.5 h-3.5 rounded border-border bg-surface accent-accent"
                        />
                        <span className={`text-xs font-medium ${color} group-hover:opacity-80`}>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Type filter */}
                <div className="space-y-2">
                  <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Type</span>
                  <div className="space-y-1.5">
                    {([
                      { key: "HTTP", label: "HTTP" },
                      { key: "TCP", label: "TCP" },
                      { key: "SSL_CERT", label: "SSL" },
                      { key: "HEARTBEAT", label: "Heartbeat" },
                    ] as const).map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={filterTypes.has(key)}
                          onChange={() => {
                            setFilterTypes((prev) => {
                              const next = new Set(prev);
                              next.has(key) ? next.delete(key) : next.add(key);
                              return next;
                            });
                          }}
                          className="w-3.5 h-3.5 rounded border-border bg-surface accent-accent"
                        />
                        <span className="text-xs text-text-primary group-hover:opacity-80">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Tag filter */}
                {allTags.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Tags</span>
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() => {
                            setFilterTags((prev) => {
                              const next = new Set(prev);
                              next.has(tag.name) ? next.delete(tag.name) : next.add(tag.name);
                              return next;
                            });
                          }}
                          className="px-2 py-1 rounded-full text-xs font-medium transition-all border"
                          style={{
                            backgroundColor: filterTags.has(tag.name) ? tag.color + "40" : "transparent",
                            borderColor: tag.color + "80",
                            color: filterTags.has(tag.name) ? tag.color : undefined,
                            opacity: filterTags.has(tag.name) ? 1 : 0.6,
                          }}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          
        )}

        {allTags.length > 0 && (
          
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
                    backgroundColor: activeTagFilter === tag.name ? tag.color + "40" : "transparent",
                    borderColor: tag.color + "80",
                    color: activeTagFilter === tag.name ? tag.color : undefined,
                  }}
                >
                  {tag.name}
                  {tag.monitorCount > 0 && <span className="ml-1 opacity-60">({tag.monitorCount})</span>}
                </button>
              ))}
            </div>
          
        )}

        {importResult && (
          
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
          
        )}

        {filteredMonitors.length === 0 ? (
          
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
                      setFormData({ name: "", type: "HTTP", target: "", intervalSec: 60, confirmations: 1, enabled: true, pluginId: "", expectedText: "", heartbeatTimeoutMin: 5, heartbeatToken: "", folderId: "" });
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
                  <p className="text-text-primary text-lg font-medium mb-2">No monitors match</p>
                  <p className="text-text-secondary text-sm mb-4">
                    Try adjusting your search or filters
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => { setActiveTagFilter(null); setSearchQuery(""); setStatusFilter("all"); setFolderFilter(null); }}>
                    Clear filters
                  </Button>
                </>
              )}
            </Card>
          
        ) : (
          <>
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
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedMonitors.map((monitor) => {
                  const lastRun = runs.find((r) => r.monitorId === monitor.id);
                  const level = !monitor.enabled ? "paused" : (lastRun?.level ?? "green");
                  const dotCls = level === "green" ? "bg-success" : level === "yellow" ? "bg-warning" : level === "paused" ? "bg-text-muted/60" : "bg-danger";
                  const typeLabel = monitor.type === "HTTP" ? "HTTP" : monitor.type === "TCP" ? "TCP" : monitor.type === "SSL_CERT" ? "SSL" : monitor.type === "HEARTBEAT" ? "Heartbeat" : monitor.type;
                  const monitorRuns = runs.filter((r) => r.monitorId === monitor.id);
                  const upCount = monitorRuns.filter((r) => r.ok).length;
                  const uptime7d = monitorRuns.length > 0 ? Math.round((upCount / monitorRuns.length) * 100) : null;
                  // Compute last check relative time
                  const lastCheckText = lastRun ? relativeTime(lastRun.checkedAt) : null;
                  // Interval label
                  const intervalLabel = monitor.intervalSec < 60 ? `${monitor.intervalSec}s` : monitor.intervalSec < 3600 ? `${Math.round(monitor.intervalSec / 60)}m` : `${Math.round(monitor.intervalSec / 3600)}h`;
                  return (
                    <div key={monitor.id} className="rounded-2xl border border-border bg-surface p-6 transition-all hover:border-border-hover group">
                      {/* Top row: status dot + name + type badge */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${dotCls}`} />
                          <p className="font-semibold text-text-primary truncate text-sm">{monitor.name}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-border/60 text-text-muted shrink-0">{typeLabel}</span>
                      </div>
                      {/* Target URL */}
                      <p className="text-xs text-text-secondary font-mono truncate mb-3" title={monitor.target}>{monitor.target}</p>
                      {/* Stats row */}
                      <div className="flex items-center gap-3 text-xs text-text-secondary mb-3">
                        {lastCheckText && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 opacity-60" />
                            {lastCheckText}
                          </span>
                        )}
                        {uptime7d !== null && (
                          <span className={`font-medium ${uptime7d >= 99 ? "text-success" : uptime7d >= 90 ? "text-warning" : "text-danger"}`}>
                            {uptime7d}% up
                          </span>
                        )}
                        {lastRun?.latencyMs != null && (
                          <span className="font-mono">{lastRun.latencyMs}ms</span>
                        )}
                      </div>
                      {/* Tags */}
                      {monitor.tags && monitor.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {monitor.tags.slice(0, 3).map((t: { id: string; name: string; color: string }) => (
                            <span key={t.id} className="text-xs px-1.5 py-0.5 rounded-full border" style={{ borderColor: t.color + "80", color: t.color, backgroundColor: t.color + "22" }}>{t.name}</span>
                          ))}
                        </div>
                      )}
                      {/* Bottom row: interval chip + actions */}
                      <div className="flex items-center gap-2 pt-3 border-t border-border/60">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-border/60 text-text-muted">{intervalLabel}</span>
                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            onClick={() => { setModalMode("edit"); setEditingMonitor(monitor); setFormData({ name: monitor.name, type: monitor.type, target: monitor.target, intervalSec: monitor.intervalSec, confirmations: monitor.confirmations ?? 1, enabled: monitor.enabled, pluginId: String(monitor.config?.pluginId ?? ""), expectedText: String(monitor.config?.expectedText ?? ""), heartbeatTimeoutMin: Number(monitor.config?.timeoutMin ?? 5), heartbeatToken: String(monitor.config?.token ?? ""), folderId: monitor.folderId ?? "" } as typeof formData); setSelectedTags(monitor.tags?.map((t) => t.name) ?? []); setTagInput(""); setFormErrors({}); setFormTouched({}); setShowModal(true); setShowTemplates(false); }}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-surface-elevated border border-border/60 text-text-secondary hover:text-accent hover:border-accent/50 transition-colors"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(monitor.id)}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-surface-elevated border border-border/60 text-danger/70 hover:text-danger hover:border-danger/50 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
            <Card className="p-0">
              {/* Table top bar: row count + page size */}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/60 text-xs text-text-secondary">
                <span>
                  {totalFiltered === 0 ? "No monitors" : pageSize === "all"
                    ? `${totalFiltered} monitor${totalFiltered !== 1 ? "s" : ""}`
                    : `${Math.min((safePage - 1) * (pageSize as number) + 1, totalFiltered)}–${Math.min(safePage * (pageSize as number), totalFiltered)} of ${totalFiltered}`}
                </span>
                <div className="flex items-center gap-2">
                  <label htmlFor="monitor-page-size" className="text-text-secondary">Per page:</label>
                  <select
                    id="monitor-page-size"
                    value={pageSize}
                    onChange={(e) => {
                      const v = e.target.value === "all" ? "all" : Number(e.target.value);
                      setPageSize(v);
                      setCurrentPage(1);
                      try { localStorage.setItem("monitor-page-size", String(v)); } catch {}
                    }}
                    className="bg-surface-elevated border border-border/60 rounded-md px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                    <option value="all">All</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHead className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur-sm">
                    <tr>
                      <TableHeader className="w-6 pr-0">{""}</TableHeader>
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
                      <TableHeader>
                        <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-text-primary transition-colors">
                          Name
                          {sortBy === "name" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                        </button>
                      </TableHeader>
                      {visibleCols.type && (
                        <TableHeader className="hidden sm:table-cell">
                          <button onClick={() => handleSort("type")} className="flex items-center gap-1 hover:text-text-primary transition-colors">
                            Type
                            {sortBy === "type" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                          </button>
                        </TableHeader>
                      )}
                      {visibleCols.target && <TableHeader className="hidden md:table-cell">Target</TableHeader>}
                      {visibleCols.interval && (
                        <TableHeader className="hidden lg:table-cell">
                          <button onClick={() => handleSort("interval")} className="flex items-center gap-1 hover:text-text-primary transition-colors">
                            Interval
                            {sortBy === "interval" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                          </button>
                        </TableHeader>
                      )}
                      <TableHeader>
                        <button onClick={() => handleSort("status")} className="flex items-center gap-1 hover:text-text-primary transition-colors">
                          Status
                          {sortBy === "status" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                        </button>
                      </TableHeader>
                      {visibleCols.latency && <TableHeader className="hidden lg:table-cell">
                        <button onClick={() => handleSort("latency" as never)} className="flex items-center gap-1 hover:text-text-primary transition-colors">
                          Latency
                          {sortBy === ("latency" as never) ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                        </button>
                      </TableHeader>}
                      {visibleCols.trend && <TableHeader className="hidden xl:table-cell">Trend</TableHeader>}
                      {visibleCols.alerts && <TableHeader className="hidden sm:table-cell">Alerts</TableHeader>}
                      <TableHeader>
                        <button onClick={() => handleSort("lastChecked")} className="flex items-center gap-1 hover:text-text-primary transition-colors">
                          Last Check
                          {sortBy === "lastChecked" ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                        </button>
                      </TableHeader>
                      <TableHeader>Actions</TableHeader>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {paginatedMonitors.map((monitor) => {
                      const lastRun = runs.find((r) => r.monitorId === monitor.id);
                      const isExpanded = expandedRows.has(monitor.id);
                      const monitorRuns = runs.filter((r) => r.monitorId === monitor.id);
                      const recentRuns = [...monitorRuns].sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()).slice(0, 5);
                      const intervalLabel = monitor.intervalSec < 60 ? `${monitor.intervalSec}s` : monitor.intervalSec < 3600 ? `${Math.round(monitor.intervalSec / 60)}m` : `${Math.round(monitor.intervalSec / 3600)}h`;
                      // count visible columns for colspan
                      const visColCount = [visibleCols.type, visibleCols.target, visibleCols.interval, visibleCols.latency, visibleCols.trend, visibleCols.alerts].filter(Boolean).length;
                      const totalCols = 1 + 1 + 1 + visColCount + 2; // expand + checkbox + name + vis + lastCheck + actions
                      return (
                        <React.Fragment key={monitor.id}>
                        <TableRow className={`group/row relative ${selectedIds.has(monitor.id) ? "bg-accent/5" : ""}`}>
                          <TableCell className="w-6 pr-0 pl-2">
                            <button
                              onClick={() => toggleRowExpand(monitor.id)}
                              className="p-0.5 rounded text-text-secondary hover:text-accent transition-colors"
                              aria-label={isExpanded ? `Collapse ${monitor.name}` : `Expand ${monitor.name}`}
                            >
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 text-accent" />
                                : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          </TableCell>
                          <TableCell className="w-10">
                            <button
                              onClick={(e) => toggleSelect(monitor.id, e)}
                              className="p-0.5 rounded text-text-secondary hover:text-text-primary transition-colors"
                              aria-label={selectedIds.has(monitor.id) ? `Deselect ${monitor.name}` : `Select ${monitor.name} (Shift+click to select range)`}
                            >
                              {selectedIds.has(monitor.id)
                                ? <CheckSquare className="w-4 h-4 text-accent" />
                                : <Square className="w-4 h-4" />}
                            </button>
                          </TableCell>
                          <TableCell className="font-medium text-text-primary">
                            <Link href={"/monitors/" + monitor.id} className="hover:text-accent transition-colors truncate block max-w-[140px] sm:max-w-none">{monitor.name}</Link>
                            {monitor.folderId && (
                              <span className="text-xs text-text-secondary bg-surface px-1.5 py-0.5 rounded mr-1">
                                {folders.find((f) => f.id === monitor.folderId)?.name}
                              </span>
                            )}
                            {monitor.tags && monitor.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {monitor.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag.id}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-none"
                                    style={{ backgroundColor: tag.color + "30", color: tag.color, textShadow: "0 0 8px " + tag.color + "40" }}
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
                          {visibleCols.type && <TableCell className="hidden sm:table-cell text-sm text-text-secondary">{formatMonitorType(monitor.type)}</TableCell>}
                          {visibleCols.target && <TableCell className="hidden md:table-cell text-sm text-text-secondary truncate max-w-[200px]" title={monitor.target}>{monitor.target}</TableCell>}
                          {visibleCols.interval && <TableCell className="hidden lg:table-cell text-sm text-text-secondary">{monitor.intervalSec}s</TableCell>}
                          <TableCell>
                            <MonitorStatusCell
                              monitorId={monitor.id}
                              monitorType={monitor.type}
                              enabled={monitor.enabled}
                              runs={runs}
                            />
                          </TableCell>
                          {/* Latency column */}
                          {visibleCols.latency && (
                            <TableCell className="hidden lg:table-cell text-sm font-mono tabular-nums">
                              {lastRun?.latencyMs != null ? (
                                <span className={lastRun.latencyMs > 2000 ? "text-danger" : lastRun.latencyMs > 800 ? "text-warning" : "text-text-primary"}>
                                  {lastRun.latencyMs}ms
                                </span>
                              ) : (
                                <span className="text-text-muted">—</span>
                              )}
                            </TableCell>
                          )}
                          {/* Trend sparkline — last 20 runs for this monitor */}
                          {visibleCols.trend && (
                          <TableCell className="hidden xl:table-cell">
                            {(() => {
                              const monRuns = runs
                                .filter((r) => r.monitorId === monitor.id)
                                .slice(0, 20)
                                .reverse();
                              const lastRun = runs.find((r) => r.monitorId === monitor.id);
                              if (monRuns.length === 0) return <span className="text-xs text-text-muted">—</span>;
                              return (
                                <MiniSparkline
                                  data={monRuns.map((r) => ({ value: r.latencyMs ?? 0, ok: r.ok }))}
                                  height={28}
                                  color={lastRun?.ok !== false ? "#3fb950" : "#f85149"}
                                  className="w-20"
                                />
                              );
                            })()}
                          </TableCell>
                          )}
                          {visibleCols.alerts && <TableCell className="hidden sm:table-cell">
                            <button
                              onClick={() => openAlertPanel(monitor)}
                              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors group"
                              title="Manage alert channels"
                            >
                              <div className="flex items-center gap-1">
                                {monitor.alertChannels && monitor.alertChannels.length > 0 ? (
                                  <>
                                    {monitor.alertChannels.slice(0, 3).map((ch) => (
                                      <span
                                        key={ch.id}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[ch.type] ?? "text-text-secondary"} bg-surface-elevated border border-border`}
                                        title={`${ch.name} — ${NOTIFY_ON_LABELS[ch.notifyOn] ?? ch.notifyOn}`}
                                      >
                                        {ch.type}
                                      </span>
                                    ))}
                                    {monitor.alertChannels.length > 3 && (
                                      <span className="text-[10px] text-text-secondary">+{monitor.alertChannels.length - 3}</span>
                                    )}
                                  </>
                                ) : (
                                  <Bell className="w-3.5 h-3.5 opacity-40" />
                                )}
                              </div>
                              <span className="hidden group-hover:inline text-[10px] text-accent ml-0.5">Edit</span>
                            </button>
                          </TableCell>}
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
                                    confirmations: monitor.confirmations ?? 1,
                                    enabled: monitor.enabled,
                                    pluginId: String(monitor.config?.pluginId ?? ""),
                                    expectedText: String(monitor.config?.expectedText ?? ""),
                                    heartbeatTimeoutMin: Number(monitor.config?.timeoutMin ?? 5),
                                    heartbeatToken: String(monitor.config?.token ?? ""),
                                    folderId: monitor.folderId ?? "",
                                    expectedStatus: monitor.config?.expectedStatus ? Number(monitor.config.expectedStatus) : undefined,
                                    bodyContains: String(monitor.config?.bodyContains ?? ""),
                                    httpMethod: String(monitor.config?.httpMethod ?? "GET"),
                                    requestHeaders: monitor.config?.requestHeaders
                                      ? Object.entries(monitor.config.requestHeaders as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("\n")
                                      : "",
                                    requestBody: String(monitor.config?.requestBody ?? ""),
                                    responseTimeThresholdMs: monitor.config?.responseTimeThresholdMs ? Number(monitor.config.responseTimeThresholdMs) : undefined,
                                  } as typeof formData & { expectedStatus?: number; bodyContains?: string; httpMethod?: string; requestHeaders?: string; requestBody?: string; responseTimeThresholdMs?: number });
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
                              <Button variant="ghost" size="sm" onClick={() => handleCheckNow(monitor.id)} disabled={checkingNowId === monitor.id || !monitor.enabled} className="text-text-secondary hover:text-accent" aria-label={`Run check now for ${monitor.name}`} title="Run check now">
                                <PlayCircle className={`w-4 h-4 ${checkingNowId === monitor.id ? "animate-pulse" : ""}`} />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setBadgeMonitor(monitor)} className="text-text-secondary hover:text-text-primary" aria-label={`Get embed badge for ${monitor.name}`} title="Embed badge">
                                <Shield className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(monitor.id)} className="text-danger hover:text-danger" aria-label={`Delete monitor ${monitor.name}`} title="Delete monitor">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                          {/* Hover quick-action overlay */}
                          <td className="absolute right-0 top-0 bottom-0 hidden group-hover/row:flex items-center gap-1 px-3 bg-gradient-to-l from-surface via-surface/95 to-transparent pointer-events-none">
                            <div className="flex items-center gap-1 pointer-events-auto">
                              <button
                                onClick={() => {
                                  setModalMode("edit");
                                  setEditingMonitor(monitor);
                                  setFormData({
                                    name: monitor.name, type: monitor.type, target: monitor.target,
                                    intervalSec: monitor.intervalSec, confirmations: monitor.confirmations ?? 1,
                                    enabled: monitor.enabled, pluginId: String(monitor.config?.pluginId ?? ""),
                                    expectedText: String(monitor.config?.expectedText ?? ""),
                                    heartbeatTimeoutMin: Number(monitor.config?.timeoutMin ?? 5),
                                    heartbeatToken: String(monitor.config?.token ?? ""),
                                    folderId: monitor.folderId ?? "",
                                  } as typeof formData);
                                  setSelectedTags(monitor.tags?.map((t) => t.name) ?? []);
                                  setTagInput(""); setFormErrors({}); setFormTouched({});
                                  setShowModal(true); setShowTemplates(true);
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-surface-elevated border border-border text-text-primary hover:text-accent hover:border-accent/50 transition-colors"
                                title="Edit monitor"
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    await api(`/v1/monitors/${monitor.id}`, user?.id, { method: "PATCH", body: JSON.stringify({ enabled: !monitor.enabled }) });
                                    setMonitors((prev) => prev.map((m) => m.id === monitor.id ? { ...m, enabled: !monitor.enabled } : m));
                                    success(monitor.enabled ? "Monitor disabled" : "Monitor enabled");
                                  } catch (e) { toastError(e instanceof Error ? e.message : "Failed to update monitor"); }
                                }}
                                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-surface-elevated border border-border transition-colors ${monitor.enabled ? "text-warning hover:border-warning/50" : "text-green-400 hover:border-green-400/50"}`}
                                title={monitor.enabled ? "Disable monitor" : "Enable monitor"}
                              >
                                {monitor.enabled ? <><PowerOff className="w-3 h-3" /> Disable</> : <><Power className="w-3 h-3" /> Enable</>}
                              </button>
                              <button
                                onClick={() => handleDelete(monitor.id)}
                                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-surface-elevated border border-border text-danger hover:border-danger/50 transition-colors"
                                title="Delete monitor"
                              >
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </div>
                          </td>
                        </TableRow>
                        {/* Row expansion panel */}
                        {isExpanded && (
                          <tr className="bg-surface-elevated/40 border-b border-border/60">
                            <td colSpan={totalCols} className="px-6 py-4">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                                {/* Recent check history + sparkline */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Recent Checks</p>
                                    <Link href={`/monitors/${monitor.id}`} className="text-xs text-accent hover:underline">View detail →</Link>
                                  </div>
                                  {recentRuns.length === 0 ? (
                                    <p className="text-xs text-text-secondary">No checks yet</p>
                                  ) : (
                                    <>
                                      {/* Status dots row */}
                                      <div className="flex items-center gap-1.5">
                                        {recentRuns.map((r) => {
                                          const dotColor = r.ok ? "bg-success" : "bg-danger";
                                          const title = `${r.ok ? "OK" : "Failed"} — ${new Date(r.checkedAt).toLocaleString()}${r.latencyMs != null ? ` (${r.latencyMs}ms)` : ""}`;
                                          return (
                                            <div key={r.id} title={title} className="flex flex-col items-center gap-0.5 relative group/dot">
                                              <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                                              {r.latencyMs != null && (
                                                <span className="hidden group-hover/dot:block absolute bottom-full mb-1 bg-surface border border-border rounded px-1 py-0.5 text-[9px] text-text-muted font-mono z-10 whitespace-nowrap pointer-events-none">
                                                  {r.latencyMs}ms
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                        <span className="text-xs text-text-secondary ml-1.5 tabular-nums">
                                          {recentRuns.filter((r) => r.ok).length}/{recentRuns.length} OK
                                        </span>
                                      </div>
                                      {/* Latency sparkline */}
                                      {recentRuns.some((r) => r.latencyMs != null) && (
                                        <div>
                                          <p className="text-[10px] text-text-muted mb-1">Response time trend</p>
                                          <MiniSparkline
                                            data={[...recentRuns].reverse().filter((r) => r.latencyMs != null).map((r) => ({
                                              value: r.latencyMs as number,
                                              ok: r.ok,
                                            }))}
                                            height={36}
                                            color="#6366f1"
                                            className="w-full"
                                          />
                                          <div className="flex justify-between text-[9px] text-text-muted font-mono mt-0.5">
                                            <span>
                                              avg {Math.round(recentRuns.filter((r) => r.latencyMs != null).reduce((s, r) => s + (r.latencyMs as number), 0) / recentRuns.filter((r) => r.latencyMs != null).length)}ms
                                            </span>
                                            {lastRun && <span>last {relativeTime(lastRun.checkedAt)}</span>}
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                                {/* Tags */}
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1">
                                    <Tag className="w-3 h-3" /> Tags
                                  </p>
                                  {monitor.tags && monitor.tags.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                      {monitor.tags.map((tag) => (
                                        <span
                                          key={tag.id}
                                          className="px-2 py-0.5 rounded-full text-xs font-medium border"
                                          style={{ borderColor: tag.color + "80", color: tag.color, backgroundColor: tag.color + "22" }}
                                        >
                                          {tag.name}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-text-secondary">No tags</p>
                                  )}
                                </div>
                                {/* Interval & config info */}
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Schedule
                                  </p>
                                  <div className="space-y-1 text-xs text-text-secondary">
                                    <p>Every <span className="font-semibold text-text-primary">{intervalLabel}</span></p>
                                    <p>Confirmations: <span className="font-semibold text-text-primary">{monitor.confirmations ?? 1}</span></p>
                                    <p>Type: <span className="font-semibold text-text-primary">{monitor.type}</span></p>
                                    {monitor.folderId && (
                                      <p>Project: <span className="font-semibold text-text-primary">{folders.find((f) => f.id === monitor.folderId)?.name ?? "—"}</span></p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination controls */}
              {pageSize !== "all" && totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/60">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 7) {
                        page = i + 1;
                      } else if (safePage <= 4) {
                        page = i < 6 ? i + 1 : totalPages;
                      } else if (safePage >= totalPages - 3) {
                        page = i === 0 ? 1 : totalPages - 6 + i;
                      } else {
                        const pages = [1, safePage - 1, safePage, safePage + 1, totalPages];
                        page = pages[Math.min(i, pages.length - 1)];
                      }
                      const isEllipsis = i > 0 && page - (totalPages <= 7 ? i : [1, safePage <= 4 ? i : safePage - 1, safePage, safePage + 1, totalPages][Math.min(i - 1, 4)]) > 1;
                      return (
                        <button
                          key={i}
                          onClick={() => !isEllipsis && setCurrentPage(page)}
                          className={`min-w-[28px] h-7 rounded-md text-xs font-medium transition-colors ${
                            page === safePage
                              ? "bg-accent text-white"
                              : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </Card>
            )}
          </>
        )}

        {/* Recent runs */}
        
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

          {/* HTTP-specific: method, headers, body keyword, expected status */}
          {formData.type === "HTTP" && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  HTTP Method
                </label>
                <select
                  value={(formData as unknown as { httpMethod?: string }).httpMethod ?? "GET"}
                  onChange={(e) => setFormData({ ...formData, httpMethod: e.target.value } as typeof formData & { httpMethod?: string })}
                  className={inputClass}
                >
                  {["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Request Headers <span className="text-xs text-text-muted">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={(formData as unknown as { requestHeaders?: string }).requestHeaders ?? ""}
                  onChange={(e) => setFormData({ ...formData, requestHeaders: e.target.value } as typeof formData & { requestHeaders?: string })}
                  className={`${inputClass} font-mono text-xs resize-y`}
                  placeholder={"Authorization: Bearer <token>\nX-API-Key: your-key"}
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-text-secondary">One header per line: <code className="bg-surface-2 px-1 rounded">Name: Value</code>. Added to every request.</p>
              </div>
              {["POST", "PUT", "PATCH"].includes((formData as unknown as { httpMethod?: string }).httpMethod ?? "GET") && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Request Body <span className="text-xs text-text-muted">(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={(formData as unknown as { requestBody?: string }).requestBody ?? ""}
                    onChange={(e) => setFormData({ ...formData, requestBody: e.target.value } as typeof formData & { requestBody?: string })}
                    className={`${inputClass} font-mono text-xs resize-y`}
                    placeholder={'{"key": "value"}'}
                    spellCheck={false}
                  />
                  <p className="mt-1 text-xs text-text-secondary">Raw request body sent with POST/PUT/PATCH requests. Add <code className="bg-surface-2 px-1 rounded">Content-Type</code> header above if needed.</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Expected status code <span className="text-xs text-text-muted">(optional)</span>
                </label>
                <input
                  type="number"
                  min="100"
                  max="599"
                  value={(formData as unknown as { expectedStatus?: number }).expectedStatus ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? undefined : parseInt(e.target.value);
                    setFormData({ ...formData, expectedStatus: val } as typeof formData & { expectedStatus?: number });
                  }}
                  className={inputClass}
                  placeholder="Default: any 2xx"
                />
                <p className="mt-1 text-xs text-text-secondary">Leave blank to accept any 2xx response. Set to 200, 201, etc. to require an exact status.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Body must contain <span className="text-xs text-text-muted">(optional)</span>
                </label>
                <input
                  type="text"
                  value={(formData as unknown as { bodyContains?: string }).bodyContains ?? ""}
                  onChange={(e) => {
                    setFormData({ ...formData, bodyContains: e.target.value } as typeof formData & { bodyContains?: string });
                  }}
                  className={inputClass}
                  placeholder='e.g. "ok" or "status\":\"healthy"'
                  maxLength={500}
                />
                <p className="mt-1 text-xs text-text-secondary">If set, the response body must contain this string (case-insensitive). Leave blank to skip body check.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Response time threshold (ms) <span className="text-xs text-text-muted">(optional)</span>
                </label>
                <input
                  type="number"
                  min="50"
                  max="60000"
                  value={(formData as unknown as { responseTimeThresholdMs?: number }).responseTimeThresholdMs ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? undefined : parseInt(e.target.value);
                    setFormData({ ...formData, responseTimeThresholdMs: val } as typeof formData & { responseTimeThresholdMs?: number });
                  }}
                  className={inputClass}
                  placeholder="e.g. 2000"
                />
                <p className="mt-1 text-xs text-text-secondary">Mark as <span className="text-warning font-medium">degraded</span> if response takes longer than this many milliseconds. Leave blank to disable.</p>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Check Interval (seconds) <span className="text-danger" aria-hidden="true">*</span>
              <HelpTooltip content="How often PulseDock checks your monitor. Minimum 30s, maximum 3600s (1 hour). Lower intervals catch outages faster but use more resources." className="ml-1 align-middle" />
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
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Failure confirmations <span className="text-danger" aria-hidden="true">*</span>
              <HelpTooltip content="Number of consecutive failures before triggering an alert. Set to 1 for immediate alerts, or higher to reduce false positives from transient errors. Range: 1–10." className="ml-1 align-middle" />
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={formData.confirmations}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setFormData({ ...formData, confirmations: val });
                if (formTouched.confirmations) setFormErrors((prev) => ({ ...prev, confirmations: val < 1 ? "Min 1" : val > 10 ? "Max 10" : "" }));
              }}
              onBlur={() => setFormTouched((t) => ({ ...t, confirmations: true }))}
              className={`${inputClass} ${formTouched.confirmations && formErrors.confirmations ? "border-danger focus:ring-danger" : ""}`}
              aria-invalid={formTouched.confirmations && !!formErrors.confirmations}
            />
            {formTouched.confirmations && formErrors.confirmations ? (
              <p role="alert" className="mt-1 text-xs text-danger">{formErrors.confirmations}</p>
            ) : (
              <p className="mt-1 text-xs text-text-secondary">How many consecutive failures before sending an alert (1-10).</p>
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
                      style={{ borderColor: tag.color + "80", color: tag.color }}
                    >
                      + {tag.name}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {folders.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Project</label>
              <select
                value={formData.folderId}
                onChange={(e) => setFormData({ ...formData, folderId: e.target.value })}
                className={inputClass}
              >
                <option value="">(No project)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

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
                        {assignedChannels.map((channel) => {
                          const isVersion = alertPanelMonitor?.type === "GIT_RELEASE" || alertPanelMonitor?.type === "DOCKER_IMAGE";
                          const options = isVersion ? VERSION_NOTIFY_OPTIONS : UPTIME_NOTIFY_OPTIONS;
                          return (
                            <div key={channel.id} className="rounded-lg bg-surface-elevated border border-border/50 overflow-hidden">
                              <div className="flex items-center justify-between px-3 pt-3 pb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`text-[11px] font-bold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[channel.type] ?? "text-text-secondary"}`}>
                                    {channel.type}
                                  </span>
                                  <span className="text-sm text-text-primary truncate">{channel.name}</span>
                                </div>
                                <button
                                  onClick={() => unassignChannel(channel.id)}
                                  className="ml-2 p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors shrink-0"
                                  title="Remove"
                                  aria-label={`Remove ${channel.name}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="px-3 pb-3">
                                <label className="block text-[10px] text-text-secondary uppercase tracking-wide mb-1">Notify when</label>
                                <select
                                  value={channel.notifyOn ?? (isVersion ? "VERSION_ANY" : "ON_CHANGE")}
                                  onChange={(e) => updateNotifyOn(channel.id, e.target.value)}
                                  className="w-full text-xs bg-bg border border-border rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                                >
                                  {options.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
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
      {/* Badge Embed Modal */}
      {badgeMonitor && (() => {
        const badgeBase = typeof window !== "undefined" ? `${window.location.origin}/api/v1/public/badge` : "/api/v1/public/badge";
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="badge-modal-title">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="badge-modal-title" className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Shield className="w-5 h-5 text-accent" />
                Embed Badge — {badgeMonitor.name}
              </h2>
              <button onClick={() => setBadgeMonitor(null)} className="text-text-secondary hover:text-text-primary p-1 rounded" aria-label="Close badge modal">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <p className="text-sm text-text-secondary">
                Embed a live status badge anywhere — GitHub READMEs, documentation, or websites. Updates every 60 seconds.
              </p>
              {/* Preview */}
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Preview</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/v1/public/badge/${badgeMonitor.id}.svg`}
                  alt={`${badgeMonitor.name} status badge`}
                  className="h-6"
                />
              </div>
              {/* Markdown */}
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Markdown (GitHub README)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-surface-elevated border border-border rounded px-3 py-2 font-mono text-text-primary overflow-x-auto whitespace-nowrap">
                    {`![${badgeMonitor.name}](${badgeBase}/${badgeMonitor.id}.svg)`}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(`![${badgeMonitor.name}](${badgeBase}/${badgeMonitor.id}.svg)`);
                      success("Markdown copied!");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              {/* HTML */}
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">HTML</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-surface-elevated border border-border rounded px-3 py-2 font-mono text-text-primary overflow-x-auto whitespace-nowrap">
                    {`<img src="${badgeBase}/${badgeMonitor.id}.svg" alt="${badgeMonitor.name} status" />`}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(`<img src="${badgeBase}/${badgeMonitor.id}.svg" alt="${badgeMonitor.name} status" />`);
                      success("HTML copied!");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              {/* Direct URL */}
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">Direct URL</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-surface-elevated border border-border rounded px-3 py-2 font-mono text-text-primary overflow-x-auto whitespace-nowrap">
                    {`${badgeBase}/${badgeMonitor.id}.svg`}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(`${badgeBase}/${badgeMonitor.id}.svg`);
                      success("URL copied!");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              {/* Style variants */}
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Style variants</p>
                <div className="flex flex-wrap gap-3">
                  {(["flat", "flat-square", "for-the-badge"] as const).map((s) => (
                    <div key={s} className="flex flex-col items-center gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/v1/public/badge/${badgeMonitor.id}.svg?style=${s}`}
                        alt={s}
                        className={s === "for-the-badge" ? "h-7" : "h-5"}
                      />
                      <span className="text-xs text-text-secondary">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Floating widget embed */}
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                <p className="text-xs font-semibold text-text-primary mb-1">Floating Widget</p>
                <p className="text-xs text-text-secondary mb-3">Paste into any webpage to show a live floating badge in the bottom-right corner.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-surface-elevated border border-border rounded px-3 py-2 font-mono text-text-primary overflow-x-auto whitespace-nowrap">
                    {`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/public/embed/monitor/${badgeMonitor.id}.js"></script>`}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/public/embed/monitor/${badgeMonitor.id}.js"></script>`);
                      success("Script tag copied!");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end">
              <Button variant="secondary" onClick={() => setBadgeMonitor(null)}>Close</Button>
            </div>
          </div>
        </div>
        );
      })()}
    </AppFrame>
  );
}

export default function MonitorsPage() {
  return (
    <Suspense fallback={
      <AppFrame title="Uptime Checks">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      </AppFrame>
    }>
      <MonitorsPageInner />
    </Suspense>
  );
}
