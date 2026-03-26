"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, AlertCircle, CheckCircle2, Monitor, Bell, BellOff, X, Download, Upload, Eye, Square, CheckSquare, PlayCircle, Power, PowerOff, Printer, Shield, Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, LayoutGrid, List, Layers, Filter, Clock, Tag, Copy } from "lucide-react";
import { API_BASE, api } from "../../lib/api";
import { createRealtimeSocket } from "../../lib/realtime";
import { getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../components/Table";
import type { MonitorTemplate } from "../components/MonitorTemplates";
import { relativeTime, formatMonitorType, targetPlaceholder, targetHelperText } from "../components/timeUtils";
import { useToast } from "../../components/ui/toast";
import { useDebounce } from "../../lib/useDebounce";
import Link from "next/link";
import { MonitorStatusCell } from "../components/MonitorStatusCell";
import { MiniSparkline } from "../../components/charts";
import { brand } from "../../lib/brand";
import type { MonitorTag, TagItem, AlertChannelSummary, MonitorItem, MonitorRun, AlertChannel, PluginField, MonitorPlugin } from "./types";
import { CHANNEL_TYPE_COLORS, NOTIFY_ON_LABELS } from "./constants";
import { buildEditFormData, buildFormDataFromTemplate } from "./utils";
import { AlertPanel } from "./components/AlertPanel";
import { ExternalImportModal } from "./components/ExternalImportModal";
import { BadgeModal } from "./components/BadgeModal";
import { MonitorFormModal } from "./components/MonitorFormModal";
import { MonitorGridView, MonitorGroupedView } from "./components/MonitorGridView";
import { AdvancedFiltersPanel } from "./components/AdvancedFiltersPanel";

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

  const [healthScores, setHealthScores] = useState<Record<string, { score: number; grade: string }>>({});
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 250);
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  // Advanced filter panel state
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set(["up", "down", "degraded", "paused"]));
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set(["HTTP", "TCP", "SSL_CERT", "HEARTBEAT", "DNS", "PING", "SMTP", "GIT_RELEASE", "DOCKER_IMAGE", "BROWSER", "WHOIS"]));
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set());
  const [savedPresets, setSavedPresets] = useState<Array<{ name: string; filters: Record<string, string> }>>(() => {
    try { return JSON.parse(localStorage.getItem("monitor-filter-presets") || "[]"); } catch { return []; }
  });
  const [sortBy, setSortBy] = useState<"name" | "status" | "latency" | "uptime" | "lastChecked" | "type" | "interval">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"table" | "grid" | "grouped">("table");
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
    description: string;
    runbookUrl: string;
    type: "HTTP" | "TCP" | "SSL_CERT" | "HEARTBEAT" | "DNS" | "PING" | "SMTP" | "BROWSER" | "WHOIS";
    target: string;
    intervalSec: number;
    confirmations: number;
    retryCount: number;
    enabled: boolean;
    pluginId: string;
    expectedText: string;
    heartbeatTimeoutMin: number;
    heartbeatToken: string;
    folderId: string;
    slaTarget: number | "";
    slaPeriodDays: number;
    autoIncident: boolean;
    autoIncidentSeverity: string;
    flapDetectionEnabled: boolean;
    latencyAlertMs: number | null;
    anomalyDetection: boolean;
    anomalyMultiplier: number;
    sliLatencyTarget: number | "";
    sliLatencyWindow: number;
    scheduleEnabled: boolean;
    scheduleDays: string;
    scheduleStartHour: number;
    scheduleEndHour: number;
  }>({
    name: "",
    description: "", runbookUrl: "",
    type: "HTTP",
    target: "",
    intervalSec: 60,
    confirmations: 1,
    retryCount: 0,
    enabled: true,
    pluginId: "",
    expectedText: "",
    heartbeatTimeoutMin: 5,
    heartbeatToken: "",
    folderId: "",
    slaTarget: "",
    slaPeriodDays: 30,
    autoIncident: false,
    autoIncidentSeverity: "MEDIUM",
    flapDetectionEnabled: true,
    latencyAlertMs: null,
    anomalyDetection: false,
    anomalyMultiplier: 2.0,
    scheduleEnabled: false,
    scheduleDays: "1,2,3,4,5",
    scheduleStartHour: 8,
    scheduleEndHour: 18,
    sliLatencyTarget: "",
    sliLatencyWindow: 7,
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
  const [showExternalImport, setShowExternalImport] = useState(false);
  const [externalImportSource, setExternalImportSource] = useState<"uptime-robot" | "better-uptime" | "uptime-kuma" | "csv">("uptime-robot");
  const [externalImporting, setExternalImporting] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [externalImportResult, setExternalImportResult] = useState<{ imported: number; skipped: number; errors: Array<{ index: number; name: string; error: string }>; message: string } | null>(null);

  // bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIndexRef = useRef<number>(-1);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkTagId, setBulkTagId] = useState<string>("");
  const [bulkValue, setBulkValue] = useState<string>("");
  const [checkingNowId, setCheckingNowId] = useState<string | null>(null);
  const [snoozeMenuId, setSnoozeMenuId] = useState<string | null>(null);

  // badge modal
  const [badgeMonitor, setBadgeMonitor] = useState<MonitorItem | null>(null);

  // row expansion
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [monitorDeps, setMonitorDeps] = useState<Map<string, { id: string; name: string; type: string }[]>>(new Map());
  const [depsLoading, setDepsLoading] = useState<Set<string>>(new Set());
  const [depSelection, setDepSelection] = useState<Map<string, string>>(new Map());
  const [depsSaving, setDepsSaving] = useState<Set<string>>(new Set());
  async function loadDependencies(id: string) {
    const userId = getUser()?.id;
    setDepsLoading((s) => new Set(s).add(id));
    try {
      const deps = await api<{ id: string; name: string; type: string }[]>(`/v1/monitors/${id}/dependencies`, userId);
      setMonitorDeps((m) => new Map(m).set(id, deps));
    } catch {
      setMonitorDeps((m) => new Map(m).set(id, []));
    } finally {
      setDepsLoading((s) => { const ns = new Set(s); ns.delete(id); return ns; });
    }
  }

  async function addDependency(monitorId: string) {
    const dependsOnId = depSelection.get(monitorId);
    if (!dependsOnId) return;
    const userId = getUser()?.id;
    setDepsSaving((s) => new Set(s).add(monitorId));
    try {
      await api(`/v1/monitors/${monitorId}/dependencies/${dependsOnId}`, userId, { method: 'POST' });
      success('Dependency added');
      await loadDependencies(monitorId);
      setDepSelection((m) => { const nm = new Map(m); nm.delete(monitorId); return nm; });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to add dependency');
    } finally {
      setDepsSaving((s) => { const ns = new Set(s); ns.delete(monitorId); return ns; });
    }
  }

  async function removeDependency(monitorId: string, dependsOnId: string) {
    const userId = getUser()?.id;
    setDepsSaving((s) => new Set(s).add(monitorId));
    try {
      await api(`/v1/monitors/${monitorId}/dependencies/${dependsOnId}`, userId, { method: 'DELETE' });
      success('Dependency removed');
      await loadDependencies(monitorId);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to remove dependency');
    } finally {
      setDepsSaving((s) => { const ns = new Set(s); ns.delete(monitorId); return ns; });
    }
  }

  const toggleRowExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!monitorDeps.has(id)) void loadDependencies(id);
      }
      return next;
    });
  };

  // alert assignment panel
  const [alertPanelMonitor, setAlertPanelMonitor] = useState<MonitorItem | null>(null);
  const [assignedChannels, setAssignedChannels] = useState<AlertChannel[]>([]);
  const [alertPanelLoading, setAlertPanelLoading] = useState(false);
  const [alertPanelError, setAlertPanelError] = useState("");

  // Reset to page 1 when filters/sort change
  useEffect(() => { setCurrentPage(1); }, [debouncedSearchQuery, statusFilter, typeFilter, activeTagFilter, folderFilter, sortBy, sortDir, filterStatuses, filterTypes, filterTags]);

  // Close snooze dropdown on Escape
  useEffect(() => {
    if (!snoozeMenuId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSnoozeMenuId(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [snoozeMenuId]);

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
        const [monitorsData, runsData, channelsData, pluginsData, tagsData, foldersData, healthSummaryData] = await Promise.all([
          api<MonitorItem[]>("/v1/monitors", userId),
          api<MonitorRun[]>("/v1/monitors/runs?limit=20", userId),
          api<AlertChannel[]>("/v1/alert-channels", userId),
          api<MonitorPlugin[]>("/v1/monitors/plugins", userId),
          api<TagItem[]>("/v1/tags", userId),
          api<{ id: string; name: string }[]>("/v1/folders", userId),
          api<{ scores: Array<{ monitorId: string; name: string; score: number; grade: string }>; overall: { avg: number } }>("/v1/monitors/health-summary", userId).catch(() => null),
        ]);
        setMonitors(monitorsData);
        setRuns(runsData);
        setAllChannels(channelsData);
        setPlugins(pluginsData);
        setAllTags(tagsData);
        setFolders(foldersData);

        if (healthSummaryData?.scores) {
          const scoreMap: Record<string, { score: number; grade: string }> = {};
          for (const s of healthSummaryData.scores) {
            scoreMap[s.monitorId] = { score: s.score, grade: s.grade };
          }
          setHealthScores(scoreMap);
        }
        const folderParam = searchParams.get("folder");
        if (folderParam) {
          setFolderFilter(folderParam);
        }
        // Support #edit-{id} anchor from monitor detail page
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const editMatch = hash.match(/^#edit-(.+)$/);
        if (editMatch) {
          const editId = editMatch[1];
          const target = monitorsData.find((m) => m.id === editId);
          if (target) {
            setModalMode("edit");
            setEditingMonitor(target);
            setFormData(buildEditFormData(target));
            setSelectedTags(target.tags?.map((t) => t.name) ?? []);
            setTagInput("");
            setFormErrors({});
            setFormTouched({});
            setShowModal(true);
            setShowTemplates(false);
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
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
    } else if (formData.type === "SMTP" && !/^[^:\s]+:\d+$/.test(target)) {
      errors.target = "Must be host:port (e.g. mail.example.com:25)";
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

  const buildMonitorConfig = (isCreate: boolean): Record<string, unknown> => {
    const config: Record<string, unknown> = {};
    if (formData.pluginId) config.pluginId = formData.pluginId;
    if (formData.expectedText.trim()) config.expectedText = formData.expectedText.trim();
    if (formData.type === "HEARTBEAT") {
      config.token = isCreate ? (formData.heartbeatToken || crypto.randomUUID()) : formData.heartbeatToken;
      config.timeoutMin = formData.heartbeatTimeoutMin;
    }
    if (formData.type === "SMTP") {
      const f = formData as typeof formData & { ehlo?: string; checkTls?: boolean };
      if (f.ehlo?.trim()) config.ehlo = f.ehlo.trim();
      if (f.checkTls) config.checkTls = f.checkTls;
    }
    if (formData.type === "DNS") {
      const f = formData as typeof formData & { dnsRecordType?: string; dnsExpectedValue?: string; dnsTimeoutMs?: number };
      config.recordType = f.dnsRecordType ?? "A";
      if (f.dnsExpectedValue?.trim()) config.expectedValue = f.dnsExpectedValue.trim();
      if (f.dnsTimeoutMs && f.dnsTimeoutMs !== 10000) config.timeoutMs = f.dnsTimeoutMs;
    }
    if (formData.type === "PING") {
      const f = formData as typeof formData & { pingCount?: number; pingMaxLossPct?: number };
      config.pingCount = f.pingCount ?? 3;
      if (f.pingMaxLossPct !== undefined) config.maxPacketLossPct = f.pingMaxLossPct;
    }
    if (formData.type === "BROWSER") {
      const f2 = formData as typeof formData & { browserExpectedText?: string; browserSelector?: string; browserStatusCodesRaw?: string };
      if (f2.browserExpectedText?.trim()) config.browserExpectedText = f2.browserExpectedText.trim();
      if (f2.browserSelector?.trim()) config.browserSelector = f2.browserSelector.trim();
      if (f2.browserStatusCodesRaw?.trim()) {
        const codes = f2.browserStatusCodesRaw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
        if (codes.length > 0) config.browserStatusCodes = codes;
      }
    }
    if (formData.type === "WHOIS") {
      const fw = formData as typeof formData & { whoisWarnDays?: number; whoisCriticalDays?: number };
      if (fw.whoisWarnDays !== undefined) config.warnDays = fw.whoisWarnDays;
      if (fw.whoisCriticalDays !== undefined) config.criticalDays = fw.whoisCriticalDays;
    }
    if (formData.type === "HTTP") {
      const f = formData as typeof formData & { expectedStatus?: number; bodyContains?: string; bodyJsonPath?: string; bodyJsonPathExpected?: string; httpMethod?: string; requestHeaders?: string; requestBody?: string; responseTimeThresholdMs?: number };
      if (f.expectedStatus) config.expectedStatus = f.expectedStatus;
      if (f.bodyContains?.trim()) config.bodyContains = f.bodyContains.trim();
      if (f.bodyJsonPath?.trim()) config.bodyJsonPath = f.bodyJsonPath.trim();
      if (f.bodyJsonPathExpected?.trim()) config.bodyJsonPathExpected = f.bodyJsonPathExpected.trim();
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
    return config;
  };

  const handleCreate = async () => {
    if (!validateMonitorForm()) return;
    try {
      const config = buildMonitorConfig(true);

      await api("/v1/monitors", user?.id, {
        method: "POST",
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          runbookUrl: formData.runbookUrl || null,
          type: formData.type,
          target: formData.target,
          intervalSec: formData.intervalSec,
          confirmations: formData.confirmations,
          retryCount: formData.retryCount ?? 0,
          enabled: formData.enabled,
          config,
          tags: selectedTags,
          folderId: formData.folderId || null,
          ...(formData.slaTarget !== "" ? { slaTarget: formData.slaTarget } : {}),
          slaPeriodDays: formData.slaPeriodDays,
          autoIncident: formData.autoIncident,
          autoIncidentSeverity: formData.autoIncidentSeverity,
          flapDetectionEnabled: formData.flapDetectionEnabled,
          latencyAlertMs: formData.latencyAlertMs ?? null,
          anomalyDetection: formData.anomalyDetection,
          anomalyMultiplier: formData.anomalyMultiplier,
          scheduleEnabled: formData.scheduleEnabled,
          scheduleDays: formData.scheduleDays,
          scheduleStartHour: formData.scheduleStartHour,
          scheduleEndHour: formData.scheduleEndHour,
          ...(formData.sliLatencyTarget !== "" ? { sliLatencyTarget: formData.sliLatencyTarget } : {}),
          sliLatencyWindow: formData.sliLatencyWindow,
        }),
      });
      setShowModal(false);
      setFormData({ name: "", description: "", runbookUrl: "", type: "HTTP", target: "", intervalSec: 60, confirmations: 1, retryCount: 0, enabled: true, pluginId: "", expectedText: "", heartbeatTimeoutMin: 5, heartbeatToken: "", folderId: "", slaTarget: "", slaPeriodDays: 30, autoIncident: false, autoIncidentSeverity: "MEDIUM", flapDetectionEnabled: true, latencyAlertMs: null, anomalyDetection: false, anomalyMultiplier: 2.0,
    scheduleEnabled: false,
    scheduleDays: "1,2,3,4,5",
    scheduleStartHour: 8,
    scheduleEndHour: 18, sliLatencyTarget: "", sliLatencyWindow: 7 });
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
      const config = buildMonitorConfig(false);

      await api(`/v1/monitors/${editingMonitor.id}`, user?.id, {
        method: "PATCH",
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          runbookUrl: formData.runbookUrl || null,
          type: formData.type,
          target: formData.target,
          intervalSec: formData.intervalSec,
          confirmations: formData.confirmations,
          retryCount: formData.retryCount ?? 0,
          enabled: formData.enabled,
          config,
          tags: selectedTags,
          folderId: formData.folderId || null,
          slaTarget: formData.slaTarget !== "" ? formData.slaTarget : null,
          slaPeriodDays: formData.slaPeriodDays,
          autoIncident: formData.autoIncident,
          autoIncidentSeverity: formData.autoIncidentSeverity,
          flapDetectionEnabled: formData.flapDetectionEnabled,
          latencyAlertMs: formData.latencyAlertMs ?? null,
          anomalyDetection: formData.anomalyDetection,
          anomalyMultiplier: formData.anomalyMultiplier,
          scheduleEnabled: formData.scheduleEnabled,
          scheduleDays: formData.scheduleDays,
          scheduleStartHour: formData.scheduleStartHour,
          scheduleEndHour: formData.scheduleEndHour,
          sliLatencyTarget: formData.sliLatencyTarget !== "" ? formData.sliLatencyTarget : null,
          sliLatencyWindow: formData.sliLatencyWindow,
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

  const handleBulkAction = async (action: "enable" | "disable" | "delete" | "run" | "add-tag" | "remove-tag" | "update-interval" | "update-timeout" | "update-confirmations") => {
    if (!selectedIds.size) return;
    if (action === "delete" && !window.confirm(`Delete ${selectedIds.size} monitor${selectedIds.size > 1 ? "s" : ""}?`)) return;
    if ((action === "add-tag" || action === "remove-tag") && !bulkTagId) {
      toastError("Please select a tag first");
      return;
    }
    if ((action === "update-interval" || action === "update-timeout" || action === "update-confirmations") && !bulkValue) {
      toastError("Please enter a value first");
      return;
    }
    setBulkLoading(true);
    try {
      const body: Record<string, unknown> = { ids: Array.from(selectedIds), action };
      if (action === "add-tag" || action === "remove-tag") body.tagId = bulkTagId;
      if (action === "update-interval" || action === "update-timeout" || action === "update-confirmations") {
        body.value = Number(bulkValue);
      }
      const result = await api<{ ok: boolean; affected: number }>("/v1/monitors/bulk", user?.id, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (action === "delete") {
        setMonitors((prev) => prev.filter((m) => !selectedIds.has(m.id)));
        setRuns((prev) => prev.filter((r) => !selectedIds.has(r.monitorId)));
      } else if (action === "enable" || action === "disable") {
        setMonitors((prev) => prev.map((m) => selectedIds.has(m.id) ? { ...m, enabled: action === "enable" } : m));
      } else if (action === "add-tag" || action === "remove-tag") {
        // Refresh monitors to reflect tag changes
        const tag = allTags.find((t) => t.id === bulkTagId);
        if (tag) {
          setMonitors((prev) => prev.map((m) => {
            if (!selectedIds.has(m.id)) return m;
            const tags = m.tags ?? [];
            if (action === "add-tag" && !tags.some((t) => t.id === tag.id)) {
              return { ...m, tags: [...tags, tag] };
            }
            if (action === "remove-tag") {
              return { ...m, tags: tags.filter((t) => t.id !== tag.id) };
            }
            return m;
          }));
        }
      }
      setSelectedIds(new Set());
      const tagName = allTags.find((t) => t.id === bulkTagId)?.name;
      const actionLabel = action === "delete" ? "deleted" : action === "enable" ? "enabled" : action === "disable" ? "disabled" : action === "run" ? "queued for check" : action === "add-tag" ? `tagged "${tagName}"` : `tag "${tagName}" removed`;
      success(`${result.affected} monitor${result.affected !== 1 ? "s" : ""} ${actionLabel}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleClone = async (monitorId: string) => {
    try {
      const cloned = await api<MonitorItem>(`/v1/monitors/${monitorId}/clone`, user?.id, { method: "POST" });
      setMonitors((prev) => [cloned, ...prev]);
      success(`Cloned as "${cloned.name}"`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to clone monitor");
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

  const handleSnooze = async (monitorId: string, hours: number) => {
    setSnoozeMenuId(null);
    try {
      await api<{ ok: boolean; endsAt: string }>(`/v1/monitors/${monitorId}/snooze`, user?.id, {
        method: "POST",
        body: JSON.stringify({ hours }),
      });
      const label = hours === 168 ? "7 days" : hours === 1 ? "1 hour" : `${hours} hours`;
      success(`Monitor snoozed for ${label}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to snooze monitor");
    }
  };

  const handleApplyTemplate = (t: MonitorTemplate) => {
    if (t.type === "GIT_RELEASE" || t.type === "DOCKER_IMAGE") {
      router.push(`/versions?template=${encodeURIComponent(t.target)}&type=${t.type}`);
      setShowModal(false);
      return;
    }
    setFormData(buildFormDataFromTemplate(t) as typeof formData);
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
      // File input ref reset handled by ExternalImportModal component
    }
  };

  const unassignedChannels = allChannels.filter(
    (c) => !assignedChannels.some((a) => a.id === c.id)
  );

  const availablePlugins = plugins.filter((p) => p.supportedMonitorTypes.includes(formData.type));
  const selectedPlugin = availablePlugins.find((p) => p.id === formData.pluginId) ?? null;

  // Compute active filter count for badge
  const defaultStatuses = new Set(["up", "down", "degraded", "paused"]);
  const defaultTypes = new Set(["HTTP", "TCP", "SSL_CERT", "HEARTBEAT", "DNS", "PING", "SMTP", "GIT_RELEASE", "DOCKER_IMAGE", "BROWSER", "WHOIS"]);
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
    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !m.target.toLowerCase().includes(q)) return false;
    }
    return true;
  });

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
                <button
                  onClick={() => setViewMode("grouped")}
                  className={`p-1.5 transition-colors ${viewMode === "grouped" ? "bg-accent/20 text-accent" : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"}`}
                  title="Group by tag"
                >
                  <Layers className="w-3.5 h-3.5" />
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
                <div className="w-px h-4 bg-border" />
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                  title="Print monitor list"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Print</span>
                </button>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2"
                title={`Import monitors from ${brand.name} JSON`}
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
                  setFormData({ name: "", description: "", runbookUrl: "", type: "HTTP", target: "", intervalSec: 60, confirmations: 1, retryCount: 0, enabled: true, pluginId: "", expectedText: "", heartbeatTimeoutMin: 5, heartbeatToken: "", folderId: "", slaTarget: "", slaPeriodDays: 30, autoIncident: false, autoIncidentSeverity: "MEDIUM", flapDetectionEnabled: true, latencyAlertMs: null, anomalyDetection: false, anomalyMultiplier: 2.0,
    scheduleEnabled: false,
    scheduleDays: "1,2,3,4,5",
    scheduleStartHour: 8,
    scheduleEndHour: 18, sliLatencyTarget: "", sliLatencyWindow: 7 });
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
          <AdvancedFiltersPanel
            filterStatuses={filterStatuses}
            filterTypes={filterTypes}
            filterTags={filterTags}
            allTags={allTags}
            savedPresets={savedPresets}
            activeFilterCount={activeFilterCount}
            onSetFilterStatuses={setFilterStatuses}
            onSetFilterTypes={setFilterTypes}
            onSetFilterTags={setFilterTags}
            onSavePreset={saveCurrentPreset}
            onApplyPreset={applyPreset}
            onDeletePreset={deletePreset}
            onClearFilters={() => {
              setFilterStatuses(new Set(["up", "down", "degraded", "paused"]));
              setFilterTypes(new Set(["HTTP", "TCP", "SSL_CERT", "HEARTBEAT", "DNS", "PING", "SMTP", "GIT_RELEASE", "DOCKER_IMAGE", "BROWSER", "WHOIS"]));
              setFilterTags(new Set());
              setTypeFilter("all");
              setStatusFilter("all");
              setActiveTagFilter(null);
              setFolderFilter(null);
            }}
          />
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
                      setFormData({ name: "", description: "", runbookUrl: "", type: "HTTP", target: "", intervalSec: 60, confirmations: 1, retryCount: 0, enabled: true, pluginId: "", expectedText: "", heartbeatTimeoutMin: 5, heartbeatToken: "", folderId: "", slaTarget: "", slaPeriodDays: 30, autoIncident: false, autoIncidentSeverity: "MEDIUM", flapDetectionEnabled: true, latencyAlertMs: null, anomalyDetection: false, anomalyMultiplier: 2.0,
    scheduleEnabled: false,
    scheduleDays: "1,2,3,4,5",
    scheduleStartHour: 8,
    scheduleEndHour: 18, sliLatencyTarget: "", sliLatencyWindow: 7 });
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
                {allTags.length > 0 && (
                  <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-border">
                    <Tag className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <select
                      value={bulkTagId}
                      onChange={(e) => setBulkTagId(e.target.value)}
                      className="text-xs px-2 py-1 bg-bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
                      aria-label="Select tag for bulk action"
                    >
                      <option value="">Select tag…</option>
                      {allTags.map((tag) => (
                        <option key={tag.id} value={tag.id}>{tag.name}</option>
                      ))}
                    </select>
                    <Button size="sm" variant="secondary" onClick={() => handleBulkAction("add-tag")} disabled={bulkLoading || !bulkTagId} className="flex items-center gap-1 text-xs">
                      + Tag
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleBulkAction("remove-tag")} disabled={bulkLoading || !bulkTagId} className="flex items-center gap-1 text-xs">
                      − Tag
                    </Button>
                  </div>
                )}
                <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-border">
                    <input
                      type="number"
                      value={bulkValue}
                      onChange={(e) => setBulkValue(e.target.value)}
                      placeholder="value"
                      className="w-16 text-xs px-2 py-1 bg-bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
                      aria-label="Bulk update value"
                    />
                    <Button size="sm" variant="secondary" onClick={() => handleBulkAction("update-interval")} disabled={bulkLoading || !bulkValue} className="text-xs" title="Set check interval (seconds)">
                      Set interval
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleBulkAction("update-confirmations")} disabled={bulkLoading || !bulkValue} className="text-xs" title="Set required confirmations (1-10)">
                      Set confirms
                    </Button>
                  </div>
                <Button size="sm" variant="ghost" onClick={() => handleBulkAction("delete")} disabled={bulkLoading} className="flex items-center gap-1.5 text-danger hover:text-danger ml-auto">
                  <Trash2 className="w-3.5 h-3.5" />Delete
                </Button>
                <button onClick={() => setSelectedIds(new Set())} className="ml-1 p-1 rounded hover:bg-surface-elevated text-text-secondary hover:text-text-primary" aria-label="Clear selection">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {viewMode === "grid" ? (
              <MonitorGridView
                monitors={paginatedMonitors}
                runs={runs}
                onEdit={(monitor) => { setModalMode("edit"); setEditingMonitor(monitor); setFormData(buildEditFormData(monitor)); setSelectedTags(monitor.tags?.map((t) => t.name) ?? []); setTagInput(""); setFormErrors({}); setFormTouched({}); setShowModal(true); setShowTemplates(false); }}
                onDelete={handleDelete}
              />
            ) : viewMode === "grouped" ? (
              <MonitorGroupedView monitors={filteredMonitors} runs={runs} />
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
                      <TableHeader className="hidden md:table-cell">Health</TableHeader>
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
                            <div className="flex items-center gap-1.5">
                              <Link href={"/monitors/" + monitor.id} className="hover:text-accent transition-colors truncate max-w-[120px] sm:max-w-none">{monitor.name}</Link>
                              {monitor.isFlapping && (
                                <span title="This monitor is flapping — rapidly alternating between up and down. Alerts are suppressed while flapping." className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-warning/15 text-warning border border-warning/30 animate-pulse cursor-help whitespace-nowrap">
                                  ⚡ Flapping
                                </span>
                              )}
                              {(monitor as typeof monitor & { mutedUntil?: string | null }).mutedUntil && new Date((monitor as typeof monitor & { mutedUntil?: string | null }).mutedUntil!) > new Date() && (
                                <span title="Alerts muted" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">
                                  🔇
                                </span>
                              )}
                              {(monitor as typeof monitor & { isAcknowledged?: boolean }).isAcknowledged && (
                                <span title="Alert acknowledged" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 whitespace-nowrap">
                                  🔔
                                </span>
                              )}
                              {(monitor as typeof monitor & { scheduleEnabled?: boolean }).scheduleEnabled && (
                                <span title="Business hours schedule active" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 whitespace-nowrap">
                                  📅
                                </span>
                              )}
                            </div>
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
                          {/* Health score badge */}
                          <TableCell className="hidden md:table-cell">
                            {(() => {
                              const hs = healthScores[monitor.id];
                              if (!hs) return <span className="text-text-muted text-xs">—</span>;
                              const gradeColor =
                                hs.grade === "A" ? "bg-success/15 text-success border-success/30" :
                                hs.grade === "B" ? "bg-success/10 text-success/80 border-success/20" :
                                hs.grade === "C" ? "bg-warning/15 text-warning border-warning/30" :
                                hs.grade === "D" ? "bg-orange-500/15 text-orange-400 border-orange-500/30" :
                                "bg-danger/15 text-danger border-danger/30";
                              return (
                                <span
                                  className={`inline-flex items-center justify-center w-9 h-9 rounded-full border text-xs font-bold tabular-nums ${gradeColor}`}
                                  title={`Health score: ${hs.score}/100 (${hs.grade})`}
                                >
                                  {hs.score}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 group-hover/row:opacity-0 group-hover/row:pointer-events-none transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setModalMode("edit");
                                  setEditingMonitor(monitor);
                                  setFormData(buildEditFormData(monitor));
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
                              <Button variant="ghost" size="sm" onClick={() => handleClone(monitor.id)} className="text-text-secondary hover:text-accent" aria-label={`Clone monitor ${monitor.name}`} title="Clone monitor">
                                <Copy className="w-4 h-4" />
                              </Button>
                              <div className="relative">
                                <Button variant="ghost" size="sm" onClick={() => setSnoozeMenuId(snoozeMenuId === monitor.id ? null : monitor.id)} className="text-text-secondary hover:text-warning" aria-label={`Snooze alerts for ${monitor.name}`} title="Snooze alerts">
                                  <BellOff className="w-4 h-4" />
                                </Button>
                                {snoozeMenuId === monitor.id && (
                                  <div className="absolute right-0 top-full mt-1 z-50 bg-bg-card border border-border rounded-xl shadow-lg min-w-[140px] py-1" role="menu">
                                    {[1, 4, 8, 24, 168].map((h) => (
                                      <button key={h} onClick={() => handleSnooze(monitor.id, h)} className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-bg-surface transition-colors" role="menuitem">
                                        {h === 168 ? "7 days" : h === 1 ? "1 hour" : `${h} hours`}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => setBadgeMonitor(monitor)} className="text-text-secondary hover:text-text-primary" aria-label={`Get embed badge for ${monitor.name}`} title="Embed badge">
                                <Shield className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(monitor.id)} className="text-danger hover:text-danger" aria-label={`Delete monitor ${monitor.name}`} title="Delete monitor">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                          {/* Hover quick-action overlay */}
                          <td className="absolute right-0 top-0 bottom-0 z-10 hidden group-hover/row:flex items-center gap-1 px-3 bg-gradient-to-l from-surface via-surface/95 to-transparent pointer-events-none">
                            <div className="flex items-center gap-1 pointer-events-auto">
                              <button
                                onClick={() => {
                                  setModalMode("edit");
                                  setEditingMonitor(monitor);
                                  setFormData(buildEditFormData(monitor));
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
                            <td colSpan={totalCols} className="px-6 py-4 overflow-hidden max-w-0 w-full">
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm min-w-0">
                                {/* Recent check history + sparkline */}
                                <div className="space-y-2 min-w-0 overflow-hidden">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Recent Checks</p>
                                    <Link href={`/monitors/${monitor.id}`} className="text-xs text-accent hover:underline">View detail →</Link>
                                  </div>
                                  {recentRuns.length === 0 ? (
                                    <p className="text-xs text-text-secondary">No checks yet</p>
                                  ) : (
                                    <>
                                      {/* Status dots row */}
                                      <div className="flex items-center gap-1.5 flex-wrap overflow-hidden">
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
                                <div className="space-y-2 min-w-0">
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
                                <div className="space-y-2 min-w-0">
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
                                {/* Dependencies */}
                                <div className="space-y-2 min-w-0">
                                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> Dependencies
                                  </p>
                                  {depsLoading.has(monitor.id) ? (
                                    <p className="text-xs text-text-secondary">Loading…</p>
                                  ) : (
                                    <>
                                      {(monitorDeps.get(monitor.id) ?? []).length === 0 ? (
                                        <p className="text-xs text-text-secondary">No dependencies</p>
                                      ) : (
                                        <div className="space-y-1">
                                          {(monitorDeps.get(monitor.id) ?? []).map((dep) => {
                                            const depLastRun = runs.find((r) => r.monitorId === dep.id);
                                            const depOk = depLastRun?.ok;
                                            return (
                                              <div key={dep.id} className="flex items-center justify-between gap-2 text-xs">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                  <div className={`w-2 h-2 rounded-full shrink-0 ${depOk === true ? "bg-success" : depOk === false ? "bg-danger" : "bg-border"}`} />
                                                  <span className="text-text-primary truncate">{dep.name}</span>
                                                </div>
                                                <button
                                                  type="button"
                                                  className="text-text-secondary hover:text-danger transition-colors"
                                                  disabled={depsSaving.has(monitor.id)}
                                                  onClick={() => void removeDependency(monitor.id, dep.id)}
                                                  title="Remove dependency"
                                                >
                                                  <X className="w-3 h-3" />
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}

                                      <div className="pt-2 border-t border-border/40 space-y-1.5">
                                        {(() => {
                                          const deps = monitorDeps.get(monitor.id) ?? [];
                                          const existing = new Set(deps.map((d) => d.id));
                                          const candidates = monitors.filter((m) => m.id !== monitor.id && !existing.has(m.id));
                                          return (
                                            <>
                                              <select
                                                value={depSelection.get(monitor.id) ?? ''}
                                                onChange={(e) => setDepSelection((m) => new Map(m).set(monitor.id, e.target.value))}
                                                className="w-full px-2 py-1.5 rounded-md bg-surface border border-border text-xs text-text-primary"
                                                disabled={depsSaving.has(monitor.id) || candidates.length === 0}
                                              >
                                                <option value="">Add dependency…</option>
                                                {candidates.map((c) => (
                                                  <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                              </select>
                                              <button
                                                type="button"
                                                className="w-full px-2 py-1.5 rounded-md bg-accent/15 text-accent text-xs font-medium hover:bg-accent/25 disabled:opacity-50"
                                                disabled={!depSelection.get(monitor.id) || depsSaving.has(monitor.id)}
                                                onClick={() => void addDependency(monitor.id)}
                                              >
                                                Add dependency
                                              </button>
                                            </>
                                          );
                                        })()}
                                      </div>
                                    </>
                                  )}
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
      <MonitorFormModal
        isOpen={showModal}
        mode={modalMode}
        showTemplates={showTemplates}
        formData={formData}
        formErrors={formErrors}
        formTouched={formTouched}
        tagInput={tagInput}
        selectedTags={selectedTags}
        allTags={allTags}
        folders={folders}
        availablePlugins={availablePlugins}
        selectedPlugin={selectedPlugin}
        onClose={() => { setShowModal(false); setEditingMonitor(null); setFormErrors({}); setFormTouched({}); setSelectedTags([]); setTagInput(""); }}
        onCancel={() => { setShowModal(false); setEditingMonitor(null); }}
        onSubmit={modalMode === "create" ? handleCreate : handleUpdate}
        onSetShowTemplates={setShowTemplates}
        onSetFormData={setFormData}
        onSetFormErrors={setFormErrors}
        onSetFormTouched={setFormTouched}
        onSetTagInput={setTagInput}
        onSetSelectedTags={setSelectedTags}
        onApplyTemplate={handleApplyTemplate}
        onCopySuccess={success}
      />

      {alertPanelMonitor && (
        <AlertPanel
          monitor={alertPanelMonitor}
          assignedChannels={assignedChannels}
          unassignedChannels={unassignedChannels}
          allChannels={allChannels}
          loading={alertPanelLoading}
          error={alertPanelError}
          onClose={() => setAlertPanelMonitor(null)}
          onAssign={assignChannel}
          onUnassign={unassignChannel}
          onUpdateNotifyOn={updateNotifyOn}
        />
      )}
      {showExternalImport && (
        <ExternalImportModal
          source={externalImportSource}
          onSourceChange={setExternalImportSource}
          importing={externalImporting}
          result={externalImportResult}
          onClose={() => setShowExternalImport(false)}
          onImportFile={handleExternalImportFile}
        />
      )}
      {badgeMonitor && (
        <BadgeModal
          monitor={badgeMonitor}
          onClose={() => setBadgeMonitor(null)}
          onCopySuccess={success}
        />
      )}
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
