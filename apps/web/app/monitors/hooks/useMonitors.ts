"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { API_BASE, api } from "../../../lib/api";
import { createRealtimeSocket } from "../../../lib/realtime";
import { getUser } from "../../../components/auth";
import { useToast } from "../../../components/ui/toast";
import { useDebounce } from "../../../lib/useDebounce";
import type { MonitorItem, MonitorRun, AlertChannel, TagItem, MonitorPlugin, MonitorFormDataExtended, TransactionStep } from "../types";
import { buildEditFormData, buildFormDataFromTemplate } from "../utils";
import type { MonitorTemplate } from "../../components/MonitorTemplates";

const DEFAULT_FORM: MonitorFormDataExtended = {
  name: "",
  description: "",
  runbookUrl: "",
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
  flapWindow: 10,
  flapThreshold: 0.5,
  latencyAlertMs: null,
  latencyBudgetMs: null,
  anomalyDetection: false,
  anomalyMultiplier: 2.0,
  cronExpression: "",
  scheduleEnabled: false,
  scheduleDays: "1,2,3,4,5",
  scheduleStartHour: 8,
  scheduleEndHour: 18,
  sliLatencyTarget: "",
  sliLatencyWindow: 7,
  rtoMinutes: undefined,
  timeoutMs: null,
};

export function useMonitors() {
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

  // Filter state
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 250);
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set(["up", "down", "degraded", "paused"]));
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set(["HTTP", "TCP", "SSL_CERT", "HEARTBEAT", "DNS", "PING", "SMTP", "GIT_RELEASE", "DOCKER_IMAGE", "BROWSER", "WHOIS", "FTP", "IMAP", "POP3", "CT_LOG", "GRAPHQL", "TRANSACTION"]));
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set());
  const [savedPresets, setSavedPresets] = useState<Array<{ name: string; filters: Record<string, string> }>>(() => {
    try { return JSON.parse(localStorage.getItem("monitor-filter-presets") || "[]"); } catch { return []; }
  });

  // Sort/view state
  const [sortBy, setSortBy] = useState<"name" | "status" | "latency" | "uptime" | "lastChecked" | "type" | "interval" | "health">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"table" | "grid" | "grouped">("table");
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("monitor-col-visibility");
      return stored ? JSON.parse(stored) : { type: true, target: true, interval: true, trend: true, alerts: true, latency: true, health: true };
    } catch {
      return { type: true, target: true, interval: true, trend: true, alerts: true, latency: true, health: true };
    }
  });
  const [showColPicker, setShowColPicker] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(() => {
    try { const s = localStorage.getItem("monitor-page-size"); return s ? (s === "all" ? "all" : Number(s)) : 25; } catch { return 25; }
  });

  // Loading/error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [realtimeAlert, setRealtimeAlert] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [showTemplates, setShowTemplates] = useState(true);
  const [editingMonitor, setEditingMonitor] = useState<MonitorItem | null>(null);
  const [formData, setFormData] = useState<MonitorFormDataExtended>(DEFAULT_FORM);
  const [tagInput, setTagInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formTouched, setFormTouched] = useState<Record<string, boolean>>({});

  // Import/export
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: Array<{ index: number; name: string; error: string }> } | null>(null);

  // External import
  const [showExternalImport, setShowExternalImport] = useState(false);
  const [externalImportSource, setExternalImportSource] = useState<"uptime-robot" | "better-uptime" | "uptime-kuma" | "csv">("uptime-robot");
  const [externalImporting, setExternalImporting] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [externalImportResult, setExternalImportResult] = useState<{ imported: number; skipped: number; errors: Array<{ index: number; name: string; error: string }>; message: string } | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIndexRef = useRef<number>(-1);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkTagId, setBulkTagId] = useState<string>("");
  const [bulkValue, setBulkValue] = useState<string>("");
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState<{
    intervalSec: string; confirmations: string; retryCount: string;
    latencyAlertMs: string; slaTarget: string; flapDetectionEnabled: string; enabled: string;
    alertChannelIds: string[];
  }>({ intervalSec: "", confirmations: "", retryCount: "", latencyAlertMs: "", slaTarget: "", flapDetectionEnabled: "", enabled: "", alertChannelIds: [] });

  const [checkingNowId, setCheckingNowId] = useState<string | null>(null);
  const [snoozeMenuId, setSnoozeMenuId] = useState<string | null>(null);
  const [pauseMenuId, setPauseMenuId] = useState<string | null>(null);

  // Badge modal
  const [badgeMonitor, setBadgeMonitor] = useState<MonitorItem | null>(null);

  // Import/compose/openapi/playground modals
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showComposeImport, setShowComposeImport] = useState(false);
  const [showOpenApiImport, setShowOpenApiImport] = useState(false);
  const [showPlayground, setShowPlayground] = useState(false);

  // Config export/import modals
  const [showConfigExport, setShowConfigExport] = useState(false);
  const [configExportFormat, setConfigExportFormat] = useState<"json" | "yaml">("json");
  const [configExportIncludeAlerts, setConfigExportIncludeAlerts] = useState(false);
  const [configExporting, setConfigExporting] = useState(false);
  const [showConfigImport, setShowConfigImport] = useState(false);
  const [configImportContent, setConfigImportContent] = useState("");
  const [configImportFormat, setConfigImportFormat] = useState<"json" | "yaml">("json");
  const [configImportDryRun, setConfigImportDryRun] = useState(false);
  const [configImportOverwrite, setConfigImportOverwrite] = useState(false);
  const [configImporting, setConfigImporting] = useState(false);
  const configImportFileRef = useRef<HTMLInputElement>(null);
  const [configImportResult, setConfigImportResult] = useState<{
    created: number; updated: number; skipped: number; errors: string[];
    monitors: { name: string; id?: string; action: string; error?: string }[];
  } | null>(null);

  // Row expansion
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [monitorDeps, setMonitorDeps] = useState<Map<string, { id: string; name: string; type: string }[]>>(new Map());
  const [depsLoading, setDepsLoading] = useState<Set<string>>(new Set());
  const [depSelection, setDepSelection] = useState<Map<string, string>>(new Map());
  const [depsSaving, setDepsSaving] = useState<Set<string>>(new Set());

  // Alert assignment panel
  const [alertPanelMonitor, setAlertPanelMonitor] = useState<MonitorItem | null>(null);
  const [assignedChannels, setAssignedChannels] = useState<AlertChannel[]>([]);
  const [alertPanelLoading, setAlertPanelLoading] = useState(false);
  const [alertPanelError, setAlertPanelError] = useState("");

  // ── Effects ──────────────────────────────────────────────────────────────

  // Reset to page 1 when filters/sort change
  useEffect(() => { setCurrentPage(1); }, [debouncedSearchQuery, statusFilter, typeFilter, activeTagFilter, folderFilter, sortBy, sortDir, filterStatuses, filterTypes, filterTags]);

  useEffect(() => {
    if (!snoozeMenuId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSnoozeMenuId(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [snoozeMenuId]);

  useEffect(() => {
    if (!pauseMenuId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setPauseMenuId(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [pauseMenuId]);

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
        const [monitorsData, runsData, channelsData, pluginsData, tagsData, foldersData, healthSummaryData, batchHealthData] = await Promise.all([
          api<MonitorItem[]>("/v1/monitors", userId),
          api<MonitorRun[]>("/v1/monitors/runs?limit=20", userId),
          api<AlertChannel[]>("/v1/alert-channels", userId),
          api<MonitorPlugin[]>("/v1/monitors/plugins", userId).catch((error) => {
            console.error('Failed to load monitor plugins', error);
            return [] as MonitorPlugin[];
          }),
          api<TagItem[]>("/v1/tags", userId),
          api<{ id: string; name: string }[]>("/v1/folders", userId),
          api<{ scores: Array<{ monitorId: string; name: string; score: number; grade: string }>; overall: { avg: number } }>("/v1/monitors/health-summary", userId).catch(() => null),
          api<Array<{ monitorId: string; score: number | null }>>("/v1/monitors/health-scores", userId).catch(() => null),
        ]);
        setMonitors(monitorsData);
        setRuns(runsData);
        setAllChannels(channelsData);
        setPlugins(pluginsData);
        setAllTags(tagsData);
        setFolders(foldersData);

        const scoreMap: Record<string, { score: number; grade: string }> = {};
        if (healthSummaryData?.scores) {
          for (const s of healthSummaryData.scores) {
            scoreMap[s.monitorId] = { score: s.score, grade: s.grade };
          }
        }
        if (batchHealthData) {
          for (const s of batchHealthData) {
            if (s.score !== null) {
              const grade = s.score >= 90 ? "A" : s.score >= 70 ? "B" : s.score >= 50 ? "C" : s.score >= 25 ? "D" : "F";
              scoreMap[s.monitorId] = { score: s.score, grade };
            }
          }
        }
        setHealthScores(scoreMap);

        const folderParam = searchParams.get("folder");
        if (folderParam) setFolderFilter(folderParam);

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

    void loadData();

    const socket = createRealtimeSocket(userId);
    socket.on("connect", () => { socket.emit("subscribe", { userId }); });
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
    socket.on("monitor.checked", (payload: { run: MonitorRun }) => {
      if (!payload?.run) return;
      setRuns((prev) => [payload.run, ...prev.filter((r) => r.id !== payload.run.id)].slice(0, 20));
    });
    socket.on("alert.triggered", (payload: { monitor?: { name?: string }; run?: { level?: string; message?: string } }) => {
      const name = payload?.monitor?.name ?? "Monitor";
      const level = payload?.run?.level?.toUpperCase() ?? "ALERT";
      const message = payload?.run?.message ?? "Notification sent";
      setRealtimeAlert(`${name}: ${level} — ${message}`);
      setTimeout(() => setRealtimeAlert(""), 6000);
    });
    return () => { socket.disconnect(); };
  }, [router, searchParams]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const toggleCol = (col: string) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [col]: !prev[col] };
      try { localStorage.setItem("monitor-col-visibility", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ── Dependency management ──────────────────────────────────────────────

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
      await api(`/v1/monitors/${monitorId}/dependencies/${dependsOnId}`, userId, { method: "POST" });
      success("Dependency added");
      await loadDependencies(monitorId);
      setDepSelection((m) => { const nm = new Map(m); nm.delete(monitorId); return nm; });
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to add dependency");
    } finally {
      setDepsSaving((s) => { const ns = new Set(s); ns.delete(monitorId); return ns; });
    }
  }

  async function removeDependency(monitorId: string, dependsOnId: string) {
    const userId = getUser()?.id;
    setDepsSaving((s) => new Set(s).add(monitorId));
    try {
      await api(`/v1/monitors/${monitorId}/dependencies/${dependsOnId}`, userId, { method: "DELETE" });
      success("Dependency removed");
      await loadDependencies(monitorId);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to remove dependency");
    } finally {
      setDepsSaving((s) => { const ns = new Set(s); ns.delete(monitorId); return ns; });
    }
  }

  const toggleRowExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else { next.add(id); if (!monitorDeps.has(id)) void loadDependencies(id); }
      return next;
    });
  };

  // ── Alert panel ──────────────────────────────────────────────────────────

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

  const updateNotifyOn = async (channelId: string, notifyOn: string, repeatIntervalMin?: number | null) => {
    if (!alertPanelMonitor) return;
    try {
      const body: Record<string, unknown> = { notifyOn };
      if (notifyOn === "REPEAT_EVERY_N" && repeatIntervalMin != null) { body.repeatIntervalMin = repeatIntervalMin; }
      else if (notifyOn !== "REPEAT_EVERY_N") { body.repeatIntervalMin = null; }
      await api(`/v1/monitors/${alertPanelMonitor.id}/alerts/${channelId}`, user?.id, { method: "PATCH", body: JSON.stringify(body) });
      setAssignedChannels((prev) => prev.map((c) =>
        c.id === channelId ? { ...c, notifyOn, ...(repeatIntervalMin != null ? { repeatIntervalMin } : {}) } : c
      ));
      const updatedMonitors = await api<MonitorItem[]>("/v1/monitors", user?.id);
      setMonitors(updatedMonitors);
    } catch (e) {
      setAlertPanelError(e instanceof Error ? e.message : "Failed to update notification setting");
    }
  };

  // ── Form validation ───────────────────────────────────────────────────────

  const validateMonitorForm = (): boolean => {
    const errors: Record<string, string> = {};
    const name = formData.name.trim();
    const target = formData.target.trim();
    if (!name) { errors.name = "Name is required"; }
    else if (name.length < 2) { errors.name = "Name must be at least 2 characters"; }
    else if (name.length > 100) { errors.name = "Name must be 100 characters or less"; }
    if (!target) { errors.target = "Target is required"; }
    else if (formData.type === "HTTP") {
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
      const f = formData as typeof formData & { dnsRecordType?: string; dnsExpectedValue?: string; dnsTimeoutMs?: number; dnsDetectChanges?: boolean };
      config.recordType = f.dnsRecordType ?? "A";
      if (f.dnsExpectedValue?.trim()) config.expectedValue = f.dnsExpectedValue.trim();
      if (f.dnsTimeoutMs && f.dnsTimeoutMs !== 10000) config.timeoutMs = f.dnsTimeoutMs;
      if (f.dnsDetectChanges) config.detectChanges = true;
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
        const codes = f2.browserStatusCodesRaw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
        if (codes.length > 0) config.browserStatusCodes = codes;
      }
    }
    if (formData.type === "WHOIS") {
      const fw = formData as typeof formData & { whoisWarnDays?: number; whoisCriticalDays?: number };
      if (fw.whoisWarnDays !== undefined) config.warnDays = fw.whoisWarnDays;
      if (fw.whoisCriticalDays !== undefined) config.criticalDays = fw.whoisCriticalDays;
    }
    if (formData.type === "HTTP") {
      const f = formData as typeof formData & {
        expectedStatus?: number; bodyContains?: string; bodyJsonPath?: string; bodyJsonPathExpected?: string;
        httpMethod?: string; requestHeaders?: string; requestBody?: string; responseTimeThresholdMs?: number;
        minResponseBodyBytes?: number; maxResponseBodyBytes?: number; assertResponseHeader?: string;
        assertResponseHeaderValue?: string; checkSecurityHeaders?: boolean; authType?: string; authUser?: string;
        authPassword?: string; authToken?: string; authApiKeyName?: string; authApiKeyValue?: string;
        authApiKeyIn?: string; followRedirects?: boolean; maxRedirects?: number; preAuthUrl?: string;
        preAuthBody?: string; preAuthExtractCookie?: string; preAuthExtractToken?: string;
      };
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
      if (f.minResponseBodyBytes && f.minResponseBodyBytes > 0) config.minResponseBodyBytes = f.minResponseBodyBytes;
      if (f.maxResponseBodyBytes && f.maxResponseBodyBytes > 0) config.maxResponseBodyBytes = f.maxResponseBodyBytes;
      if (f.assertResponseHeader?.trim()) config.assertResponseHeader = f.assertResponseHeader.trim();
      if (f.assertResponseHeaderValue?.trim()) config.assertResponseHeaderValue = f.assertResponseHeaderValue.trim();
      if (f.checkSecurityHeaders) config.checkSecurityHeaders = true;
      if (f.followRedirects === false) config.followRedirects = false;
      if (f.followRedirects !== false && f.maxRedirects !== undefined && f.maxRedirects !== 10) config.maxRedirects = f.maxRedirects;
      if (f.authType && f.authType !== "none") {
        config.authType = f.authType;
        if (f.authType === "basic") {
          if (f.authUser) config.authUser = f.authUser;
          if (f.authPassword) config.authPassword = f.authPassword;
        } else if (f.authType === "bearer") {
          if (f.authToken) config.authToken = f.authToken;
        } else if (f.authType === "api-key") {
          if (f.authApiKeyName) config.authApiKeyName = f.authApiKeyName;
          if (f.authApiKeyValue) config.authApiKeyValue = f.authApiKeyValue;
          config.authApiKeyIn = f.authApiKeyIn ?? "header";
        }
      }
      if (f.preAuthUrl?.trim()) {
        config.preAuthUrl = f.preAuthUrl.trim();
        if (f.preAuthBody?.trim()) config.preAuthBody = f.preAuthBody.trim();
        if (f.preAuthExtractCookie?.trim()) config.preAuthExtractCookie = f.preAuthExtractCookie.trim();
        if (f.preAuthExtractToken?.trim()) config.preAuthExtractToken = f.preAuthExtractToken.trim();
      }
    }
    if (formData.type === "TRANSACTION") {
      const f = formData as typeof formData & { transactionSteps?: TransactionStep[]; transactionContinueOnFailure?: boolean };
      config.transactionSteps = f.transactionSteps ?? [];
      if (f.transactionContinueOnFailure) config.continueOnFailure = true;
    }
    return config;
  };

  const buildCommonBody = () => ({
    name: formData.name,
    description: formData.description || null,
    runbookUrl: formData.runbookUrl || null,
    type: formData.type,
    target: formData.target,
    intervalSec: formData.intervalSec,
    confirmations: formData.confirmations,
    retryCount: formData.retryCount ?? 0,
    enabled: formData.enabled,
    tags: selectedTags,
    folderId: formData.folderId || null,
    autoIncident: formData.autoIncident,
    autoIncidentSeverity: formData.autoIncidentSeverity,
    flapDetectionEnabled: formData.flapDetectionEnabled,
    flapWindow: formData.flapWindow,
    flapThreshold: formData.flapThreshold,
    latencyAlertMs: formData.latencyAlertMs ?? null,
    anomalyDetection: formData.anomalyDetection,
    anomalyMultiplier: formData.anomalyMultiplier,
    cronExpression: formData.cronExpression || null,
    scheduleEnabled: formData.scheduleEnabled,
    scheduleDays: formData.scheduleDays,
    scheduleStartHour: formData.scheduleStartHour,
    scheduleEndHour: formData.scheduleEndHour,
    slaPeriodDays: formData.slaPeriodDays,
    sliLatencyWindow: formData.sliLatencyWindow,
    trackedHeaders: (formData as typeof formData & { trackedHeaders?: string }).trackedHeaders?.trim() || null,
    ...(formData.timeoutMs !== null ? { timeoutMs: formData.timeoutMs } : {}),
    statusWebhookUrl: (formData as typeof formData & { statusWebhookUrl?: string }).statusWebhookUrl?.trim() || null,
    statusWebhookSecret: (formData as typeof formData & { statusWebhookSecret?: string }).statusWebhookSecret?.trim() || null,
    ...((formData as typeof formData & { throttleMs?: number | null }).throttleMs != null ? { throttleMs: (formData as typeof formData & { throttleMs?: number | null }).throttleMs } : {}),
    ...((formData as typeof formData & { maxChecksPerHour?: number | null }).maxChecksPerHour != null ? { maxChecksPerHour: (formData as typeof formData & { maxChecksPerHour?: number | null }).maxChecksPerHour } : {}),
    ...((formData as typeof formData & { metricPath?: string | null }).metricPath ? { metricPath: (formData as typeof formData & { metricPath?: string | null }).metricPath } : {}),
    ...((formData as typeof formData & { metricName?: string | null }).metricName ? { metricName: (formData as typeof formData & { metricName?: string | null }).metricName } : {}),
    ...((formData as typeof formData & { metricUnit?: string | null }).metricUnit ? { metricUnit: (formData as typeof formData & { metricUnit?: string | null }).metricUnit } : {}),
    ...((formData as typeof formData & { metricAlertMin?: number | null }).metricAlertMin !== null && (formData as typeof formData & { metricAlertMin?: number | null }).metricAlertMin !== undefined ? { metricAlertMin: (formData as typeof formData & { metricAlertMin?: number | null }).metricAlertMin } : {}),
    ...((formData as typeof formData & { metricAlertMax?: number | null }).metricAlertMax !== null && (formData as typeof formData & { metricAlertMax?: number | null }).metricAlertMax !== undefined ? { metricAlertMax: (formData as typeof formData & { metricAlertMax?: number | null }).metricAlertMax } : {}),
    ...((formData as typeof formData & { graphqlQuery?: string | null }).graphqlQuery ? { graphqlQuery: (formData as typeof formData & { graphqlQuery?: string | null }).graphqlQuery } : {}),
    ...((formData as typeof formData & { graphqlVariables?: string | null }).graphqlVariables ? { graphqlVariables: (formData as typeof formData & { graphqlVariables?: string | null }).graphqlVariables } : {}),
    ...((formData as typeof formData & { graphqlDataPath?: string | null }).graphqlDataPath ? { graphqlDataPath: (formData as typeof formData & { graphqlDataPath?: string | null }).graphqlDataPath } : {}),
    ...((formData as typeof formData & { graphqlExpectedValue?: string | null }).graphqlExpectedValue ? { graphqlExpectedValue: (formData as typeof formData & { graphqlExpectedValue?: string | null }).graphqlExpectedValue } : {}),
    ...((formData as typeof formData & { downtimeCostPerHour?: number | null }).downtimeCostPerHour != null ? { downtimeCostPerHour: (formData as typeof formData & { downtimeCostPerHour?: number | null }).downtimeCostPerHour } : {}),
  });

  const resetForm = () => {
    setFormData(DEFAULT_FORM);
    setSelectedTags([]);
    setTagInput("");
    setFormErrors({});
    setFormTouched({});
  };

  const handleCreate = async () => {
    if (!validateMonitorForm()) return;
    try {
      const config = buildMonitorConfig(true);
      await api("/v1/monitors", user?.id, {
        method: "POST",
        body: JSON.stringify({
          ...buildCommonBody(),
          config,
          ...(formData.slaTarget !== "" ? { slaTarget: formData.slaTarget } : {}),
          ...(formData.sliLatencyTarget !== "" ? { sliLatencyTarget: formData.sliLatencyTarget } : {}),
          ...(formData.rtoMinutes !== undefined ? { rtoMinutes: formData.rtoMinutes } : {}),
        }),
      });
      setShowModal(false);
      resetForm();
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
          ...buildCommonBody(),
          config,
          slaTarget: formData.slaTarget !== "" ? formData.slaTarget : null,
          sliLatencyTarget: formData.sliLatencyTarget !== "" ? formData.sliLatencyTarget : null,
          rtoMinutes: formData.rtoMinutes ?? null,
          ...(formData.timeoutMs !== null ? { timeoutMs: formData.timeoutMs } : { timeoutMs: null }),
          throttleMs: (formData as typeof formData & { throttleMs?: number | null }).throttleMs ?? null,
          maxChecksPerHour: (formData as typeof formData & { maxChecksPerHour?: number | null }).maxChecksPerHour ?? null,
          metricPath: (formData as typeof formData & { metricPath?: string | null }).metricPath ?? null,
          metricName: (formData as typeof formData & { metricName?: string | null }).metricName ?? null,
          metricUnit: (formData as typeof formData & { metricUnit?: string | null }).metricUnit ?? null,
          metricAlertMin: (formData as typeof formData & { metricAlertMin?: number | null }).metricAlertMin ?? null,
          metricAlertMax: (formData as typeof formData & { metricAlertMax?: number | null }).metricAlertMax ?? null,
          graphqlQuery: (formData as typeof formData & { graphqlQuery?: string | null }).graphqlQuery ?? null,
          graphqlVariables: (formData as typeof formData & { graphqlVariables?: string | null }).graphqlVariables ?? null,
          graphqlDataPath: (formData as typeof formData & { graphqlDataPath?: string | null }).graphqlDataPath ?? null,
          graphqlExpectedValue: (formData as typeof formData & { graphqlExpectedValue?: string | null }).graphqlExpectedValue ?? null,
          downtimeCostPerHour: (formData as typeof formData & { downtimeCostPerHour?: number | null }).downtimeCostPerHour ?? null,
        }),
      });
      setShowModal(false);
      setEditingMonitor(null);
      resetForm();
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
      const lo = Math.min(lastSelectedIndexRef.current, currentIndex);
      const hi = Math.max(lastSelectedIndexRef.current, currentIndex);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(monitors[i].id);
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
    if (selectedIds.size === monitors.length) { setSelectedIds(new Set()); }
    else { setSelectedIds(new Set(monitors.map((m) => m.id))); }
  };

  const handleBulkAction = async (action: "enable" | "disable" | "delete" | "run" | "add-tag" | "remove-tag" | "update-interval" | "update-timeout" | "update-confirmations" | "pause") => {
    if (!selectedIds.size) return;
    if (action === "delete" && !window.confirm(`Delete ${selectedIds.size} monitor${selectedIds.size > 1 ? "s" : ""}?`)) return;
    if ((action === "add-tag" || action === "remove-tag") && !bulkTagId) { toastError("Please select a tag first"); return; }
    if ((action === "update-interval" || action === "update-timeout" || action === "update-confirmations") && !bulkValue) { toastError("Please enter a value first"); return; }
    setBulkLoading(true);
    try {
      const body: Record<string, unknown> = { ids: Array.from(selectedIds), action };
      if (action === "add-tag" || action === "remove-tag") body.tagId = bulkTagId;
      if (action === "update-interval" || action === "update-timeout" || action === "update-confirmations" || action === "pause") {
        body.value = Number(bulkValue) || (action === "pause" ? 60 : undefined);
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
        const tag = allTags.find((t) => t.id === bulkTagId);
        if (tag) {
          setMonitors((prev) => prev.map((m) => {
            if (!selectedIds.has(m.id)) return m;
            const tags = m.tags ?? [];
            if (action === "add-tag" && !tags.some((t) => t.id === tag.id)) return { ...m, tags: [...tags, tag] };
            if (action === "remove-tag") return { ...m, tags: tags.filter((t) => t.id !== tag.id) };
            return m;
          }));
        }
      }
      setSelectedIds(new Set());
      const tagName = allTags.find((t) => t.id === bulkTagId)?.name;
      const pauseMin = action === "pause" ? (bulkValue ? Number(bulkValue) : 60) : 0;
      const actionLabel = action === "delete" ? "deleted" : action === "enable" ? "enabled" : action === "disable" ? "disabled" : action === "run" ? "queued for check" : action === "pause" ? `paused for ${pauseMin}m` : action === "add-tag" ? `tagged "${tagName}"` : `tag "${tagName}" removed`;
      success(`${result.affected} monitor${result.affected !== 1 ? "s" : ""} ${actionLabel}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkEdit = async () => {
    if (!selectedIds.size) return;
    setBulkLoading(true);
    try {
      const body: Record<string, unknown> = { ids: Array.from(selectedIds) };
      if (bulkEditForm.intervalSec) body.intervalSec = parseInt(bulkEditForm.intervalSec, 10);
      if (bulkEditForm.confirmations) body.confirmations = parseInt(bulkEditForm.confirmations, 10);
      if (bulkEditForm.retryCount !== "") body.retryCount = parseInt(bulkEditForm.retryCount, 10);
      if (bulkEditForm.latencyAlertMs) body.latencyAlertMs = parseInt(bulkEditForm.latencyAlertMs, 10);
      if (bulkEditForm.slaTarget) body.slaTarget = parseFloat(bulkEditForm.slaTarget);
      if (bulkEditForm.flapDetectionEnabled !== "") body.flapDetectionEnabled = bulkEditForm.flapDetectionEnabled === "true";
      if (bulkEditForm.enabled !== "") body.enabled = bulkEditForm.enabled === "true";
      if (bulkEditForm.alertChannelIds.length > 0) body.alertChannelIds = bulkEditForm.alertChannelIds;
      const result = await api<{ ok: boolean; affected: number; errors: Array<{ id: string; error: string }> }>("/v1/monitors/bulk-edit", user?.id, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (body.enabled !== undefined) {
        setMonitors((prev) => prev.map((m) => selectedIds.has(m.id) ? { ...m, enabled: body.enabled as boolean } : m));
      }
      if (body.intervalSec !== undefined) {
        setMonitors((prev) => prev.map((m) => selectedIds.has(m.id) ? { ...m, intervalSec: body.intervalSec as number } : m));
      }
      setShowBulkEditModal(false);
      setBulkEditForm({ intervalSec: "", confirmations: "", retryCount: "", latencyAlertMs: "", slaTarget: "", flapDetectionEnabled: "", enabled: "", alertChannelIds: [] });
      setSelectedIds(new Set());
      success(`${result.affected} monitor${result.affected !== 1 ? "s" : ""} updated`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Bulk edit failed");
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

  const handleQuickAdd = async (payload: { urls: string[]; folderId?: string; alertChannelIds?: string[]; intervalSec?: number }) => {
    const res = await api<{ created: number; skipped: number; errors: Array<{ url: string; error: string }> }>(
      "/v1/monitors/bulk-create-from-urls",
      user?.id,
      { method: "POST", body: JSON.stringify(payload) }
    );
    if (res.created > 0) {
      const updated = await api<MonitorItem[]>("/v1/monitors", user?.id);
      setMonitors(updated);
      success(`${res.created} monitor${res.created !== 1 ? "s" : ""} created`);
    }
    return res;
  };

  const handleCheckNow = async (monitorId: string) => {
    if (checkingNowId) return;
    setCheckingNowId(monitorId);
    try {
      await api("/v1/monitors/bulk", user?.id, { method: "POST", body: JSON.stringify({ ids: [monitorId], action: "run" }) });
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
      await api<{ ok: boolean; endsAt: string }>(`/v1/monitors/${monitorId}/snooze`, user?.id, { method: "POST", body: JSON.stringify({ hours }) });
      const label = hours === 168 ? "7 days" : hours === 1 ? "1 hour" : `${hours} hours`;
      success(`Monitor snoozed for ${label}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to snooze monitor");
    }
  };

  const handlePause = async (monitorId: string, minutes: number) => {
    setPauseMenuId(null);
    try {
      const res = await api<{ pausedUntil: string }>(`/v1/monitors/${monitorId}/pause`, user?.id, { method: "POST", body: JSON.stringify({ minutes }) });
      const label = minutes >= 1440 ? `${Math.round(minutes / 1440)}d` : minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`;
      setMonitors((prev) => prev.map((m) => m.id === monitorId ? { ...m, pausedUntil: res.pausedUntil } : m));
      success(`Monitor checks paused for ${label}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to pause monitor");
    }
  };

  const handleResumePause = async (monitorId: string) => {
    try {
      await api(`/v1/monitors/${monitorId}/pause`, user?.id, { method: "DELETE" });
      setMonitors((prev) => prev.map((m) => m.id === monitorId ? { ...m, pausedUntil: null } : m));
      success("Monitor checks resumed");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to resume monitor");
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
      a.href = url; a.download = filename; a.click();
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
      if (externalImportSource === "csv") { payload = text; }
      else { payload = JSON.parse(text); }
      const result = await api<{ imported: number; skipped: number; errors: Array<{ index: number; name: string; error: string }>; message: string }>(
        "/v1/monitors/import-external",
        user?.id,
        { method: "POST", body: JSON.stringify({ source: externalImportSource, payload }) },
      );
      setExternalImportResult(result);
      const monitorsData = await api<MonitorItem[]>("/v1/monitors", user?.id);
      setMonitors(monitorsData);
    } catch (e) {
      setExternalImportResult({ imported: 0, skipped: 0, errors: [], message: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setExternalImporting(false);
    }
  };

  const handleConfigExport = async () => {
    if (configExporting) return;
    setConfigExporting(true);
    try {
      const selectedList = Array.from(selectedIds);
      const params = new URLSearchParams({ format: configExportFormat });
      if (configExportIncludeAlerts) params.set("includeAlertChannels", "true");
      if (selectedList.length > 0) params.set("ids", selectedList.join(","));
      const resp = await fetch(`${API_BASE}/v1/monitors/export?${params.toString()}`, { credentials: "include" });
      if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pulsedock-monitors-${new Date().toISOString().slice(0, 10)}.${configExportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      setShowConfigExport(false);
      success(`Monitors exported as ${configExportFormat.toUpperCase()}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setConfigExporting(false);
    }
  };

  const handleConfigImport = async () => {
    if (configImporting || !configImportContent.trim()) return;
    setConfigImporting(true);
    setConfigImportResult(null);
    try {
      const result = await api<{
        created: number; updated: number; skipped: number; errors: string[];
        monitors: { name: string; id?: string; action: string; error?: string }[];
      }>("/v1/monitors/import-config", user?.id, {
        method: "POST",
        body: JSON.stringify({ format: configImportFormat, content: configImportContent, dryRun: configImportDryRun, overwriteExisting: configImportOverwrite }),
      });
      setConfigImportResult(result);
      if (!configImportDryRun) {
        const monitorsData = await api<MonitorItem[]>("/v1/monitors", user?.id);
        setMonitors(monitorsData);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setConfigImporting(false);
    }
  };

  const handleConfigImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setConfigImportContent(text);
    if (file.name.endsWith(".yaml") || file.name.endsWith(".yml")) { setConfigImportFormat("yaml"); }
    else { setConfigImportFormat("json"); }
  };

  // ── Derived state ────────────────────────────────────────────────────────

  const defaultStatuses = new Set(["up", "down", "degraded", "paused"]);
  const defaultTypes = new Set(["HTTP", "TCP", "SSL_CERT", "HEARTBEAT", "DNS", "PING", "SMTP", "GIT_RELEASE", "DOCKER_IMAGE", "BROWSER", "WHOIS", "FTP", "IMAP", "POP3", "CT_LOG", "GRAPHQL"]);
  const activeFilterCount =
    (filterStatuses.size < defaultStatuses.size ? 1 : 0) +
    (filterTypes.size < defaultTypes.size ? 1 : 0) +
    (filterTags.size > 0 ? 1 : 0);

  const filteredMonitors = monitors.filter((m) => {
    if (m.type === "GIT_RELEASE" || m.type === "DOCKER_IMAGE") return false;
    if (activeTagFilter && !m.tags?.some((t) => t.name === activeTagFilter)) return false;
    if (statusFilter === "enabled" && !m.enabled) return false;
    if (statusFilter === "disabled" && m.enabled) return false;
    if (folderFilter && m.folderId !== folderFilter) return false;
    if (filterTypes.size < defaultTypes.size && !filterTypes.has(m.type)) return false;
    if (typeFilter !== "all" && m.type !== typeFilter) return false;
    if (filterTags.size > 0 && !m.tags?.some((t) => filterTags.has(t.name))) return false;
    if (filterStatuses.size < defaultStatuses.size) {
      const lastRun = runs.find((r) => r.monitorId === m.id);
      if (!m.enabled) { if (!filterStatuses.has("paused")) return false; }
      else if (!lastRun) { if (!filterStatuses.has("up")) return false; }
      else {
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

  function handleSort(col: typeof sortBy) {
    if (sortBy === col) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); }
    else { setSortBy(col); setSortDir("asc"); }
  }

  const sortedMonitors = [...filteredMonitors].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const runA = runs.find((r) => r.monitorId === a.id);
    const runB = runs.find((r) => r.monitorId === b.id);
    switch (sortBy) {
      case "name": return dir * a.name.localeCompare(b.name);
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
      case "type": return dir * a.type.localeCompare(b.type);
      case "interval": return dir * (a.intervalSec - b.intervalSec);
      case "health": {
        const ha = healthScores[a.id]?.score ?? -1;
        const hb = healthScores[b.id]?.score ?? -1;
        return dir * (ha - hb);
      }
      default: return 0;
    }
  });

  const sortedWithPins = [...sortedMonitors].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  const totalFiltered = sortedWithPins.length;
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(totalFiltered / (pageSize as number)));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedMonitors = pageSize === "all"
    ? sortedWithPins
    : sortedWithPins.slice((safePage - 1) * (pageSize as number), safePage * (pageSize as number));

  const uptimeMonitors = monitors.filter((m) => m.type !== "GIT_RELEASE" && m.type !== "DOCKER_IMAGE");
  const monitorSummary = uptimeMonitors.reduce(
    (acc, m) => {
      if (!m.enabled) { acc.paused++; return acc; }
      const lastRun = runs.find((r) => r.monitorId === m.id);
      if (!lastRun || lastRun.level === "green") { acc.up++; return acc; }
      if (lastRun.level === "yellow") { acc.degraded++; return acc; }
      if (lastRun.level === "red") { acc.down++; return acc; }
      acc.up++;
      return acc;
    },
    { up: 0, degraded: 0, down: 0, paused: 0 },
  );

  const availablePlugins = plugins.filter((p) => p.supportedMonitorTypes.includes(formData.type));
  const selectedPlugin = availablePlugins.find((p) => p.id === formData.pluginId) ?? null;
  const unassignedChannels = allChannels.filter((c) => !assignedChannels.some((a) => a.id === c.id));

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

  const openCreateModal = () => {
    setModalMode("create");
    setEditingMonitor(null);
    setFormData(DEFAULT_FORM);
    setFormErrors({});
    setFormTouched({});
    setSelectedTags([]);
    setTagInput("");
    setShowModal(true);
    setShowTemplates(true);
  };

  const openEditModal = (monitor: MonitorItem) => {
    setModalMode("edit");
    setEditingMonitor(monitor);
    setFormData(buildEditFormData(monitor));
    setSelectedTags(monitor.tags?.map((t) => t.name) ?? []);
    setTagInput("");
    setFormErrors({});
    setFormTouched({});
    setShowModal(true);
    setShowTemplates(false);
  };

  const handleToggleEnabled = async (monitor: MonitorItem) => {
    try {
      await api(`/v1/monitors/${monitor.id}`, user?.id, { method: "PATCH", body: JSON.stringify({ enabled: !monitor.enabled }) });
      setMonitors((prev) => prev.map((m) => m.id === monitor.id ? { ...m, enabled: !monitor.enabled } : m));
      success(monitor.enabled ? "Monitor disabled" : "Monitor enabled");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to update monitor");
    }
  };

  const handlePin = async (monitor: MonitorItem) => {
    try {
      await api(`/v1/monitors/${monitor.id}/pin`, user?.id, { method: "POST" });
      setMonitors((prev) => prev.map((m) => m.id === monitor.id ? { ...m, pinned: !m.pinned } : m));
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to pin monitor");
    }
  };

  return {
    // Data
    user, monitors, runs, allChannels, plugins, allTags, folders, healthScores,
    // Filter state
    activeTagFilter, setActiveTagFilter,
    folderFilter, setFolderFilter,
    searchQuery, setSearchQuery,
    statusFilter, setStatusFilter,
    typeFilter, setTypeFilter,
    showAdvancedFilters, setShowAdvancedFilters,
    filterStatuses, setFilterStatuses,
    filterTypes, setFilterTypes,
    filterTags, setFilterTags,
    savedPresets, activeFilterCount,
    saveCurrentPreset, applyPreset, deletePreset,
    // Sort/view
    sortBy, sortDir, handleSort,
    viewMode, setViewMode,
    visibleCols, toggleCol,
    showColPicker, setShowColPicker,
    // Pagination
    currentPage, setCurrentPage,
    pageSize, setPageSize,
    totalFiltered, totalPages, safePage,
    paginatedMonitors,
    // Loading
    loading, error, realtimeAlert,
    // Summary
    uptimeMonitors, monitorSummary,
    // Derived
    filteredMonitors, sortedWithPins,
    // Modal state
    showModal, setShowModal,
    modalMode,
    showTemplates, setShowTemplates,
    editingMonitor,
    formData, setFormData,
    tagInput, setTagInput,
    selectedTags, setSelectedTags,
    formErrors, setFormErrors,
    formTouched, setFormTouched,
    availablePlugins, selectedPlugin,
    openCreateModal, openEditModal,
    // Import/export
    fileInputRef, importing, importResult, setImportResult,
    showExternalImport, setShowExternalImport,
    externalImportSource, setExternalImportSource,
    externalImporting, externalImportResult,
    seedingDemo, setSeedingDemo,
    // Bulk
    selectedIds, setSelectedIds,
    bulkLoading,
    bulkTagId, setBulkTagId,
    bulkValue, setBulkValue,
    showBulkEditModal, setShowBulkEditModal,
    bulkEditForm, setBulkEditForm,
    checkingNowId,
    snoozeMenuId, setSnoozeMenuId,
    pauseMenuId, setPauseMenuId,
    // Badge
    badgeMonitor, setBadgeMonitor,
    // Modals
    showQuickAdd, setShowQuickAdd,
    showComposeImport, setShowComposeImport,
    showOpenApiImport, setShowOpenApiImport,
    showPlayground, setShowPlayground,
    // Config export/import
    showConfigExport, setShowConfigExport,
    configExportFormat, setConfigExportFormat,
    configExportIncludeAlerts, setConfigExportIncludeAlerts,
    configExporting,
    showConfigImport, setShowConfigImport,
    configImportContent, setConfigImportContent,
    configImportFormat, setConfigImportFormat,
    configImportDryRun, setConfigImportDryRun,
    configImportOverwrite, setConfigImportOverwrite,
    configImporting, configImportResult,
    configImportFileRef,
    // Row expansion
    expandedRows, toggleRowExpand,
    monitorDeps, depsLoading, depSelection, setDepSelection, depsSaving,
    addDependency, removeDependency,
    // Alert panel
    alertPanelMonitor, setAlertPanelMonitor,
    assignedChannels, alertPanelLoading, alertPanelError,
    unassignedChannels,
    openAlertPanel, assignChannel, unassignChannel, updateNotifyOn,
    // Handlers
    handleCreate, handleUpdate, handleDelete,
    handleApplyTemplate,
    handleExport,
    handleImportFile,
    handleExternalImportFile,
    handleConfigExport,
    handleConfigImport,
    handleConfigImportFile,
    handleBulkAction,
    handleBulkEdit,
    handleClone,
    handleQuickAdd,
    handleCheckNow,
    handleSnooze,
    handlePause,
    handleResumePause,
    toggleSelect,
    toggleSelectAll,
    handleToggleEnabled,
    handlePin,
  };
}
