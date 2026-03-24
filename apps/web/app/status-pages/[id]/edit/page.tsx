"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Save,
  Eye,
  ExternalLink,
  ChevronLeft,
  Globe,
  EyeOff,
  Activity,
  Grid,
  X,
  Settings,
  Image,
  Copy,
  Undo2,
  Redo2,
  Lock,
  Monitor,
  Tablet,
  Smartphone,
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutTemplate,
  Settings2,
  RefreshCw,
  History,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignCenterVertical,
  AlignCenterHorizontal,
} from "lucide-react";
import { api } from "../../../../lib/api";
import { getUser } from "../../../../components/auth";
import { useToast } from "../../../../components/ui/toast";
import { brand } from "../../../../lib/brand";

import type {
  Widget,
  ViewportMode,
  PageSettings,
  StatusPage,
  Monitor as MonitorType,
  TagOption,
  FolderOption,
  StatusTemplate,
  VersionEntry,
  ApiHistoryEntry,
} from "./components/types";
import {
  WIDGET_PALETTE,
  CATEGORIES,
  ROW_H,
  COL_COUNT,
  STATUS_TEMPLATES,
} from "./components/constants";
import {
  needsMonitorConfig,
  resolveCollisions,
} from "./components/utils";
import { PaletteWidget } from "./components/PaletteWidget";
import { CanvasDropZone } from "./components/CanvasDropZone";
import { ConfigPanel } from "./components/ConfigPanel";

// ── Main page ────────────────────────────────────────────────────────────

export default function StatusPageEditorPage() {
  const params = useParams();
  const router = useRouter();
  const toastCtx = useToast();
  const id = params.id as string;

  const [page, setPage] = useState<StatusPage | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const autoSaveFailCountRef = useRef(0); // pause auto-save after repeated failures
  const [isDirty, setIsDirty] = useState(false);
  const savedWidgetsRef = useRef<string>('[]'); // JSON snapshot of last saved state
  const [activeCategory, setActiveCategory] = useState("Status");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [monitors, setMonitors] = useState<MonitorType[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [paletteDropPreview, setPaletteDropPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [liveDataMode, setLiveDataMode] = useState(false);
  const [liveWidgetData, setLiveWidgetData] = useState<Record<string, unknown>>({});
  const [loadingLiveData, setLoadingLiveData] = useState(false);
  const [alignGuides, setAlignGuides] = useState<{ type: "h" | "v"; pos: number }[]>([]);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("desktop");
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showPageSettings, setShowPageSettings] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [pageSettings, setPageSettings] = useState<PageSettings>({});
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [confirmRemovePassword, setConfirmRemovePassword] = useState(false);

  const versionHistoryKey = `sp-vhist-${id}`;
  const [versionHistory, setVersionHistory] = useState<VersionEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(`sp-vhist-${id}`) || "[]") as VersionEntry[]; } catch { return []; }
  });

  // Server-side version history
  const [apiHistory, setApiHistory] = useState<ApiHistoryEntry[]>([]);
  const [apiHistoryLoading, setApiHistoryLoading] = useState(false);
  const [restoringHistoryId, setRestoringHistoryId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Undo/Redo history
  const historyRef = useRef<Widget[][]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isUndoRedoRef = useRef<boolean>(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    const u = getUser();
    if (!u) router.replace("/login");
    fetchPage();
    fetchMonitors();
    fetchTags();
    fetchFolders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchPage() {
    setLoading(true);
    try {
      const data = await api<StatusPage>(`/v1/status-pages/${id}`);
      setPage(data);
      const loadedWidgets = data.layout?.widgets ?? [];
      setWidgets(loadedWidgets);
      // Merge layout settings with top-level page fields (like notifyWebhookUrl)
      setPageSettings({
        ...(data.layout?.settings ?? {}),
        ...(data.notifyWebhookUrl ? { notifyWebhookUrl: data.notifyWebhookUrl } : {}),
        ...(data.slackWebhookUrl ? { slackWebhookUrl: data.slackWebhookUrl } : {}),
        ...(data.discordWebhookUrl ? { discordWebhookUrl: data.discordWebhookUrl } : {}),
        ...(data.customCss ? { customCss: data.customCss } : {}),
      });
      savedWidgetsRef.current = JSON.stringify(loadedWidgets); // mark clean
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        toastCtx.error("Status page not found");
        router.push("/status-pages");
      } else if (msg.includes("403") || msg.toLowerCase().includes("forbidden")) {
        toastCtx.error("Access denied");
        router.push("/status-pages");
      } else {
        toastCtx.error("Failed to load status page");
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchMonitors() {
    try {
      const data = await api<MonitorType[]>("/v1/monitors");
      setMonitors(data);
    } catch {
      // Non-fatal
    }
  }

  async function fetchTags() {
    try {
      const data = await api<TagOption[]>("/v1/tags");
      setTags(data);
    } catch {
      // Non-fatal
    }
  }

  async function fetchFolders() {
    try {
      const data = await api<FolderOption[]>("/v1/folders");
      setFolders(data);
    } catch {
      // Non-fatal
    }
  }

  const handleSave = useCallback(async (opts?: { silent?: boolean }) => {
    if (!page) return;
    setSaving(true);
    try {
      // notifyWebhookUrl, slackWebhookUrl, discordWebhookUrl, customCss are top-level page fields (not inside layout)
      const { notifyWebhookUrl: _webhookInSettings, slackWebhookUrl: _slackInSettings, discordWebhookUrl: _discordInSettings, customCss: _cssInSettings, ...layoutSettings } = pageSettings;
      const patchBody: Record<string, unknown> = { layout: { widgets, settings: layoutSettings } };
      if (pageSettings.notifyWebhookUrl !== undefined) {
        patchBody.notifyWebhookUrl = pageSettings.notifyWebhookUrl;
      }
      if (pageSettings.slackWebhookUrl !== undefined) {
        patchBody.slackWebhookUrl = pageSettings.slackWebhookUrl;
      }
      if (pageSettings.discordWebhookUrl !== undefined) {
        patchBody.discordWebhookUrl = pageSettings.discordWebhookUrl;
      }
      if (pageSettings.customCss !== undefined) {
        patchBody.customCss = pageSettings.customCss;
      }
      await api(`/v1/status-pages/${id}`, undefined, {
        method: "PATCH",
        body: JSON.stringify(patchBody),
      });
      // Mark as clean after successful save
      savedWidgetsRef.current = JSON.stringify(widgets);
      setIsDirty(false);
      autoSaveFailCountRef.current = 0; // reset failure counter on success

      // Record version history (localStorage, keep last 10)
      if (!opts?.silent) {
        setVersionHistory((prev) => {
          const entry: VersionEntry = { ts: Date.now(), widgetCount: widgets.length, widgets, settings: pageSettings };
          const next = [entry, ...prev].slice(0, 10);
          try { localStorage.setItem(`sp-vhist-${id}`, JSON.stringify(next)); } catch {}
          return next;
        });
      }

      // Only show toast on manual save
      if (!opts?.silent) toastCtx.success("Saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      autoSaveFailCountRef.current += 1;
      // Always show error — even for auto-saves, so the user knows saves are failing
      toastCtx.error(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [page, id, widgets, pageSettings, toastCtx, versionHistoryKey]);

  // Track dirty state whenever widgets change
  const initialLoad = useRef(true);
  useEffect(() => {
    if (initialLoad.current) { initialLoad.current = false; return; }
    const current = JSON.stringify(widgets);
    setIsDirty(current !== savedWidgetsRef.current);
  }, [widgets]);

  // Auto-save 2 seconds after widget changes (silent — no toast).
  // Pauses after 3 consecutive failures to avoid hammering the API.
  useEffect(() => {
    if (!autoSaveEnabled) return;
    if (!isDirty || !page) return;
    if (autoSaveFailCountRef.current >= 3) return; // stop retrying after repeated failures
    const timer = setTimeout(() => { handleSave({ silent: true }); }, 2000);
    return () => clearTimeout(timer);
  }, [isDirty, widgets, page, handleSave, autoSaveEnabled]);

  async function fetchLiveData() {
    if (!page?.slug) return;
    setLoadingLiveData(true);
    try {
      const dataMap: Record<string, unknown> = {};
      await Promise.allSettled(
        widgets.map(async (w) => {
          try {
            const result = await fetch(
              `/api/v1/public/status/${page.slug}/widget/${w.id}`,
              { credentials: 'include' }
            );
            if (result.ok) {
              dataMap[w.id] = await result.json();
            }
          } catch {
            // widget data not available, keep empty
          }
        })
      );
      setLiveWidgetData(dataMap);
    } finally {
      setLoadingLiveData(false);
    }
  }

  async function handleToggleLiveData() {
    if (!liveDataMode) {
      setLiveDataMode(true);
      await fetchLiveData();
    } else {
      setLiveDataMode(false);
      setLiveWidgetData({});
    }
  }

  async function handleTogglePublish() {
    if (!page) return;

    // Pre-publish validation: warn if widgets are not configured.
    if (!page.isPublished) {
      const unconfigured = widgets.filter((w) => needsMonitorConfig(w));
      if (unconfigured.length > 0) {
        const names = unconfigured
          .slice(0, 5)
          .map((w) => WIDGET_PALETTE.find((p) => p.type === w.type)?.label ?? w.type)
          .join(', ');
        const remainder = unconfigured.length > 5 ? `, +${unconfigured.length - 5} more` : '';
        const proceed = confirm(
          `⚠️ ${unconfigured.length} widget${unconfigured.length === 1 ? '' : 's'} need configuration before publish (${names}${remainder}).\n\nPublish anyway?`,
        );
        if (!proceed) {
          toastCtx.info('Publish cancelled — configure widgets first.');
          return;
        }
      }
    }

    setPublishing(true);
    try {
      const updated = await api<{ isPublished: boolean }>(`/v1/status-pages/${id}/publish`, undefined, { method: "POST" });
      setPage((prev) => prev ? { ...prev, isPublished: updated.isPublished } : prev);
      toastCtx.success(updated.isPublished ? "Page published — it's now live!" : "Page unpublished");
    } catch {
      toastCtx.error("Failed to update publish state");
    } finally {
      setPublishing(false);
    }
  }

  function applyTemplate(tmpl: StatusTemplate) {
    if (widgets.length > 0) {
      if (!confirm(`Replace current ${widgets.length} widget(s) with the "${tmpl.name}" template?`)) return;
    }
    const newWidgets = tmpl.widgets.map((w) => ({
      ...w,
      id: `w-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }));
    setWidgets(newWidgets);
    setSelectedId(null);
    setSelectedIds(new Set());
    setShowTemplateGallery(false);
  }

  function autoPlace(w: number, h: number): { x: number; y: number } {
    if (widgets.length === 0) return { x: 0, y: 0 };
    // Stack below all existing widgets
    const maxY = Math.max(...widgets.map((wg) => wg.y + wg.h));
    return { x: 0, y: maxY };
  }

  function addWidget(type: string) {
    const paletteItem = WIDGET_PALETTE.find((p) => p.type === type);
    if (!paletteItem) return;
    const { x, y } = autoPlace(paletteItem.defaultW, paletteItem.defaultH);
    const newWidget: Widget = {
      id: `${type}-${Date.now()}`,
      type,
      x,
      y,
      w: paletteItem.defaultW,
      h: paletteItem.defaultH,
      config: {},
    };
    setWidgets((prev) => [...prev, newWidget]);
    setSelectedId(newWidget.id);
  }

  function restoreVersion(entry: VersionEntry) {
    if (!confirm(`Restore this version (${entry.widgetCount} widgets from ${new Date(entry.ts).toLocaleTimeString()})? Current unsaved changes will be lost.`)) return;
    setWidgets(entry.widgets);
    setPageSettings(entry.settings);
    setSelectedId(null);
    setSelectedIds(new Set());
    setShowVersionHistory(false);
    toastCtx.success("Version restored — save to apply");
  }

  async function loadApiHistory() {
    setApiHistoryLoading(true);
    try {
      const data = await api<ApiHistoryEntry[]>(`/v1/status-pages/${id}/history`);
      setApiHistory(data);
    } catch {
      // silently fail
    } finally {
      setApiHistoryLoading(false);
    }
  }

  async function restoreApiVersion(historyId: string) {
    if (!confirm("Restore this version from server? Your current unsaved changes will be lost.")) return;
    setRestoringHistoryId(historyId);
    try {
      const result = await api<{ layout: { widgets?: Widget[]; settings?: PageSettings } }>(`/v1/status-pages/${id}/history/${historyId}/restore`, undefined, { method: "POST" });
      const restoredLayout = result.layout as { widgets?: Widget[]; settings?: PageSettings };
      const restoredWidgets = (restoredLayout?.widgets ?? []) as Widget[];
      const restoredSettings = (restoredLayout?.settings ?? {}) as PageSettings;
      setWidgets(restoredWidgets);
      setPageSettings(restoredSettings);
      savedWidgetsRef.current = JSON.stringify(restoredWidgets);
      setIsDirty(false);
      setSelectedId(null);
      setSelectedIds(new Set());
      setShowVersionHistory(false);
      toastCtx.success("Version restored from server");
      // Reload API history after restore
      loadApiHistory();
    } catch {
      toastCtx.error("Failed to restore version");
    } finally {
      setRestoringHistoryId(null);
    }
  }

  function handleWidgetSelect(id: string | null, shiftKey?: boolean) {
    if (id === null) {
      setSelectedId(null);
      setSelectedIds(new Set());
      return;
    }
    if (shiftKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          // If we removed the primary selected, pick a different one
          if (selectedId === id) setSelectedId(next.size > 0 ? [...next][0] : null);
        } else {
          next.add(id);
          // Also include primary selectedId if it exists
          if (selectedId) next.add(selectedId);
        }
        return next;
      });
      // Don't change primary selectedId on shift-click unless it's empty
      setSelectedId((prev) => prev ?? id);
    } else {
      setSelectedId(id);
      setSelectedIds(new Set());
    }
  }

  function deleteWidget(widgetId: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
    if (selectedId === widgetId) setSelectedId(null);
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(widgetId); return next; });
  }

  function duplicateWidget(widgetId: string) {
    const src = widgets.find((w) => w.id === widgetId);
    if (!src) return;
    const { x, y } = autoPlace(src.w, src.h);
    const copy: Widget = { ...src, id: `w-${Date.now()}`, x, y, locked: false };
    setWidgets((prev) => [...prev, copy]);
    setSelectedId(copy.id);
    setSelectedIds(new Set());
  }

  function toggleWidgetLock(widgetId: string) {
    setWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, locked: !w.locked } : w))
    );
  }

  function zoomIn() { setZoom((z) => Math.min(2, parseFloat((z + 0.1).toFixed(1)))); }
  function zoomOut() { setZoom((z) => Math.max(0.3, parseFloat((z - 0.1).toFixed(1)))); }
  function zoomReset() { setZoom(1); }

  function pushHistory(newWidgets: Widget[]) {
    if (isUndoRedoRef.current) return;
    const hist = historyRef.current;
    const sliced = hist.slice(0, historyIndexRef.current + 1);
    sliced.push(newWidgets);
    if (sliced.length > 50) sliced.shift();
    historyRef.current = sliced;
    historyIndexRef.current = sliced.length - 1;
  }

  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    if (widgets.length === 0 && historyIndexRef.current === -1) return;
    pushHistory(widgets);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets]);

  function undo() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    isUndoRedoRef.current = true;
    setWidgets(historyRef.current[historyIndexRef.current]);
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    isUndoRedoRef.current = true;
    setWidgets(historyRef.current[historyIndexRef.current]);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      // Copy: Ctrl+C — copy selected widgets to clipboard (localStorage)
      if (meta && e.key === "c") {
        const allSelected = new Set(selectedIds);
        if (selectedId) allSelected.add(selectedId);
        if (allSelected.size > 0) {
          e.preventDefault();
          const copied = widgets.filter((w) => allSelected.has(w.id));
          localStorage.setItem("pulsedock:widget-clipboard", JSON.stringify(copied));
        }
      }
      // Paste: Ctrl+V — paste from clipboard with offset
      if (meta && e.key === "v") {
        e.preventDefault();
        const raw = localStorage.getItem("pulsedock:widget-clipboard");
        if (raw) {
          try {
            const copied: Widget[] = JSON.parse(raw);
            if (Array.isArray(copied) && copied.length > 0) {
              const maxY = Math.max(...widgets.map((w) => w.y + w.h), 0);
              const minY = Math.min(...copied.map((w) => w.y), 0);
              const pasted: Widget[] = copied.map((w) => ({
                ...w,
                id: `w-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                y: w.y - minY + maxY + 1,
                locked: false,
              }));
              setWidgets((prev) => [...prev, ...pasted]);
              setSelectedId(pasted[0]?.id ?? null);
              setSelectedIds(new Set(pasted.map((p) => p.id)));
            }
          } catch {
            // ignore malformed clipboard
          }
        }
      }
      if (meta && e.key === "d") {
        e.preventDefault();
        // Group duplicate: duplicate all selected, or single if only one
        const allSelected = new Set(selectedIds);
        if (selectedId) allSelected.add(selectedId);
        if (allSelected.size > 1) {
          const maxY = Math.max(...widgets.map((w) => w.y + w.h), 0);
          const copies: Widget[] = [];
          allSelected.forEach((sid) => {
            const src = widgets.find((w) => w.id === sid);
            if (src) copies.push({ ...src, id: `w-${Date.now()}-${Math.random().toString(36).slice(2)}`, y: maxY + src.y, locked: false });
          });
          setWidgets((prev) => [...prev, ...copies]);
          setSelectedIds(new Set(copies.map((c) => c.id)));
          setSelectedId(copies[0]?.id ?? null);
        } else if (selectedId) {
          duplicateWidget(selectedId);
        }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          // Group delete: delete all selectedIds if multiple, else single selectedId
          if (selectedIds.size > 0) {
            const toDelete = new Set(selectedIds);
            if (selectedId) toDelete.add(selectedId);
            setWidgets((prev) => prev.filter((w) => !toDelete.has(w.id)));
            setSelectedId(null);
            setSelectedIds(new Set());
          } else if (selectedId) {
            deleteWidget(selectedId);
          }
        }
      }
      if (e.key === "Escape") { setSelectedId(null); setSelectedIds(new Set()); }
    }
    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => {
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          return Math.max(0.3, Math.min(2, parseFloat((z + delta).toFixed(1))));
        });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedIds, widgets]);

  function updateWidgetConfig(config: Widget["config"]) {
    setWidgets((prev) =>
      prev.map((w) => (w.id === selectedId ? { ...w, config } : w))
    );
  }

  function updateWidgetSize(size: { w: number; h: number }) {
    const nextW = Math.max(1, Math.min(COL_COUNT, Number.isFinite(size.w) ? size.w : 1));
    const nextH = Math.max(1, Math.min(10, Number.isFinite(size.h) ? size.h : 1));
    setWidgets((prev) =>
      prev.map((w) => {
        if (w.id !== selectedId) return w;
        const boundedX = Math.max(0, Math.min(COL_COUNT - nextW, w.x));
        return { ...w, w: nextW, h: nextH, x: boundedX };
      })
    );
  }

  /** Align all multi-selected widgets (including primary selectedId) */
  function alignSelected(dir: "left" | "right" | "top" | "bottom" | "center-h" | "center-v") {
    const allSelected = new Set(selectedIds);
    if (selectedId) allSelected.add(selectedId);
    if (allSelected.size < 2) return;
    const sel = widgets.filter((w) => allSelected.has(w.id));
    const minX = Math.min(...sel.map((w) => w.x));
    const maxX = Math.max(...sel.map((w) => w.x + w.w));
    const minY = Math.min(...sel.map((w) => w.y));
    const maxY = Math.max(...sel.map((w) => w.y + w.h));
    setWidgets((prev) =>
      prev.map((w) => {
        if (!allSelected.has(w.id)) return w;
        switch (dir) {
          case "left": return { ...w, x: minX };
          case "right": return { ...w, x: Math.max(0, maxX - w.w) };
          case "top": return { ...w, y: minY };
          case "bottom": return { ...w, y: Math.max(0, maxY - w.h) };
          case "center-h": return { ...w, x: Math.round((minX + maxX) / 2 - w.w / 2) };
          case "center-v": return { ...w, y: Math.round((minY + maxY) / 2 - w.h / 2) };
          default: return w;
        }
      })
    );
  }

  function resizeWidgetById(widgetId: string, size: { w: number; h: number }) {
    const nextW = Math.max(1, Math.min(COL_COUNT, Number.isFinite(size.w) ? size.w : 1));
    const nextH = Math.max(1, Math.min(10, Number.isFinite(size.h) ? size.h : 1));
    setWidgets((prev) => {
      const resized = prev.map((w) => {
        if (w.id !== widgetId) return w;
        const boundedX = Math.max(0, Math.min(COL_COUNT - nextW, w.x));
        return { ...w, w: nextW, h: nextH, x: boundedX };
      });
      return resolveCollisions(resized);
    });
  }

  function handleZOrder(widgetId: string, action: "front" | "back" | "forward" | "backward") {
    setWidgets((prev) => {
      const sorted = [...prev].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0));
      const idx = sorted.findIndex((w) => w.id === widgetId);
      if (idx === -1) return prev;
      const newSorted = [...sorted];
      if (action === "front") {
        const [item] = newSorted.splice(idx, 1);
        newSorted.push(item);
      } else if (action === "back") {
        const [item] = newSorted.splice(idx, 1);
        newSorted.unshift(item);
      } else if (action === "forward" && idx < newSorted.length - 1) {
        const tmp = newSorted[idx + 1];
        newSorted[idx + 1] = newSorted[idx];
        newSorted[idx] = tmp;
      } else if (action === "backward" && idx > 0) {
        const tmp = newSorted[idx - 1];
        newSorted[idx - 1] = newSorted[idx];
        newSorted[idx] = tmp;
      }
      return newSorted.map((w, i) => ({ ...w, zOrder: i }));
    });
  }

  function handleDragMove(event: DragMoveEvent) {
    const { active, delta } = event;
    const activeId = active.id as string;

    if (activeId.startsWith("palette-")) {
      if (!canvasRef.current || !active.rect.current.translated) {
        setPaletteDropPreview(null);
        return;
      }
      const type = activeId.replace("palette-", "");
      const paletteItem = WIDGET_PALETTE.find((p) => p.type === type);
      if (!paletteItem) {
        setPaletteDropPreview(null);
        return;
      }
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const moved = active.rect.current.translated;
      const colWidth = canvasRect.width / COL_COUNT;
      const relX = moved.left + moved.width / 2 - canvasRect.left;
      const relY = moved.top - canvasRect.top;
      const inCanvas = relX >= 0 && relX <= canvasRect.width && relY >= 0;
      if (!inCanvas) {
        setPaletteDropPreview(null);
        return;
      }
      const x = Math.max(0, Math.min(COL_COUNT - paletteItem.defaultW, Math.floor(relX / colWidth)));
      const y = Math.max(0, Math.floor(relY / ROW_H));
      setPaletteDropPreview({ x, y, w: paletteItem.defaultW, h: paletteItem.defaultH });
      setAlignGuides([]);
      return;
    }

    if (!activeId.startsWith("canvas-") || !canvasRef.current) {
      setAlignGuides([]);
      setPaletteDropPreview(null);
      return;
    }
    const widgetId = activeId.replace("canvas-", "");
    const movingWidget = widgets.find((w) => w.id === widgetId);
    if (!movingWidget || !canvasRef.current) return;

    const containerWidth = canvasRef.current.getBoundingClientRect().width;
    const colWidth = containerWidth / COL_COUNT;
    const movedX = Math.max(0, Math.min(COL_COUNT - movingWidget.w, movingWidget.x + Math.round(delta.x / colWidth))) * colWidth;
    const movedY = Math.max(0, movingWidget.y + Math.round(delta.y / ROW_H)) * ROW_H;
    const movedRight = movedX + movingWidget.w * colWidth;
    const movedCenterH = movedX + (movingWidget.w * colWidth) / 2;
    const movedBottom = movedY + movingWidget.h * ROW_H;
    const movedCenterV = movedY + (movingWidget.h * ROW_H) / 2;

    const guides: { type: "h" | "v"; pos: number }[] = [];
    const SNAP_TOLERANCE = 8; // pixels

    for (const w of widgets) {
      if (w.id === widgetId) continue;
      const wx = w.x * colWidth;
      const wy = w.y * ROW_H;
      const wr = (w.x + w.w) * colWidth;
      const wb = (w.y + w.h) * ROW_H;
      const wcv = wy + (w.h * ROW_H) / 2;
      const wch = wx + (w.w * colWidth) / 2;

      // Vertical guides (left/right/center alignment)
      for (const [myEdge, theirEdge] of [[movedX, wx], [movedX, wr], [movedRight, wx], [movedRight, wr], [movedCenterH, wch]]) {
        if (Math.abs(myEdge - theirEdge) <= SNAP_TOLERANCE) {
          guides.push({ type: "v", pos: theirEdge });
        }
      }
      // Horizontal guides (top/bottom/center alignment)
      for (const [myEdge, theirEdge] of [[movedY, wy], [movedY, wb], [movedBottom, wy], [movedBottom, wb], [movedCenterV, wcv]]) {
        if (Math.abs(myEdge - theirEdge) <= SNAP_TOLERANCE) {
          guides.push({ type: "h", pos: theirEdge });
        }
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    const unique = guides.filter((g) => {
      const key = `${g.type}:${g.pos}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    setAlignGuides(unique);
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = event.active.id as string;
    setActiveDragId(activeId);
    if (!activeId.startsWith("palette-")) {
      setPaletteDropPreview(null);
    }
  }

    function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    setAlignGuides([]);
    setPaletteDropPreview(null);
    const { active, delta, over } = event;
    const activeId = active.id as string;

    if (activeId.startsWith("palette-")) {
      // Drop from palette onto canvas — place at cursor position
      if (over?.id === "canvas") {
        const type = activeId.replace("palette-", "");
        const paletteItem = WIDGET_PALETTE.find((p) => p.type === type);
        if (paletteItem && canvasRef.current && active.rect.current.translated) {
          const canvasRect = canvasRef.current.getBoundingClientRect();
          const droppedRect = active.rect.current.translated;
          const colWidth = canvasRect.width / COL_COUNT;
          // Compute grid position from drop center
          const relX = droppedRect.left + droppedRect.width / 2 - canvasRect.left;
          const relY = droppedRect.top - canvasRect.top;
          const dropCol = Math.max(0, Math.min(COL_COUNT - paletteItem.defaultW, Math.floor(relX / colWidth)));
          const dropRow = Math.max(0, Math.floor(relY / ROW_H));
          const newWidget: Widget = {
            id: `${type}-${Date.now()}`,
            type,
            x: dropCol,
            y: dropRow,
            w: paletteItem.defaultW,
            h: paletteItem.defaultH,
            config: {},
          };
          setWidgets((prev) => resolveCollisions([...prev, newWidget]));
          setSelectedId(newWidget.id);
        } else {
          addWidget(type);
        }
      }
    } else if (activeId.startsWith("canvas-")) {
      // Move existing widget (skip if locked)
      const widgetId = activeId.replace("canvas-", "");
      const movingWidget = widgets.find((w) => w.id === widgetId);
      if (movingWidget?.locked) return;
      if (!canvasRef.current) return;
      const containerWidth = canvasRef.current.getBoundingClientRect().width;
      const colWidth = containerWidth / COL_COUNT;
      const deltaCol = Math.round(delta.x / colWidth);
      const deltaRow = Math.round(delta.y / ROW_H);

      if (deltaCol === 0 && deltaRow === 0) return;

      // Collect all widget IDs to move (multi-select group or single)
      const allSelected = new Set(selectedIds);
      if (selectedId) allSelected.add(selectedId);
      const moveSet = allSelected.size > 1 ? allSelected : new Set([widgetId]);

      setWidgets((prev) => {
        const moved = prev.map((w) => {
          if (!moveSet.has(w.id) || w.locked) return w;
          const newX = Math.max(0, Math.min(COL_COUNT - w.w, w.x + deltaCol));
          const newY = Math.max(0, w.y + deltaRow);
          return { ...w, x: newX, y: newY };
        });
        return resolveCollisions(moved);
      });
    }
  }

  const selectedWidget = widgets.find((w) => w.id === selectedId) ?? null;
  const activeDragPaletteItem = activeDragId?.startsWith("palette-")
    ? WIDGET_PALETTE.find((p) => p.type === activeDragId.replace("palette-", ""))
    : null;
  const activeDragCanvasWidget = activeDragId?.startsWith("canvas-")
    ? widgets.find((w) => w.id === activeDragId.replace("canvas-", ""))
    : null;
  const isDraggingOverCanvas = !!activeDragId && activeDragId.startsWith("palette-");

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!page) return null;

  const publicBase = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
      <div className="flex h-screen flex-col bg-bg text-text-primary">
        {/* Toolbar */}
        <header className="flex items-center gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-sm">
          <button
            onClick={() => router.push("/status-pages")}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition hover:text-text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            Pages
          </button>
          <div className="mx-2 h-4 w-px bg-border" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-text-primary">{page.title}</h1>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs text-text-secondary">/status/{page.slug}</code>
              {page.isPublished && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  Live
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary/60">{widgets.length} widget{widgets.length !== 1 ? "s" : ""}</span>
            {selectedIds.size > 0 && (() => {
              const allSelected = new Set(selectedIds);
              if (selectedId) allSelected.add(selectedId);
              const count = allSelected.size;
              return (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                    {count} selected
                    <button
                      onClick={() => { setSelectedId(null); setSelectedIds(new Set()); }}
                      className="ml-1 hover:text-accent/70 transition"
                      title="Deselect all"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                  {count >= 2 && (
                    <div className="flex items-center rounded-lg border border-border bg-bg overflow-hidden" title="Align selected widgets">
                      {([
                        { icon: AlignStartVertical, dir: "left" as const, title: "Align left edges" },
                        { icon: AlignCenterVertical, dir: "center-h" as const, title: "Center horizontally" },
                        { icon: AlignEndVertical, dir: "right" as const, title: "Align right edges" },
                        { icon: AlignStartHorizontal, dir: "top" as const, title: "Align top edges" },
                        { icon: AlignCenterHorizontal, dir: "center-v" as const, title: "Center vertically" },
                        { icon: AlignEndHorizontal, dir: "bottom" as const, title: "Align bottom edges" },
                      ] as const).map(({ icon: Icon, dir, title }) => (
                        <button
                          key={dir}
                          onClick={() => alignSelected(dir)}
                          title={title}
                          className="flex items-center justify-center px-2 py-1.5 text-text-secondary/60 transition hover:bg-accent/10 hover:text-accent"
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            {/* Full Preview — always available, opens authenticated preview route */}
            <a
              href={`/status-pages/${page.id}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open full preview with live data (opens in new tab)"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Full Preview
            </a>
            {page.isPublished && (
              <a
                href={`${publicBase}/status/${page.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Public Page
              </a>
            )}
            <button
              onClick={handleTogglePublish}
              disabled={publishing}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                page.isPublished
                  ? "border-border bg-bg text-text-secondary hover:border-red-500/40 hover:text-red-400"
                  : "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
              }`}
            >
              {page.isPublished ? (
                <><EyeOff className="h-3.5 w-3.5" /> Unpublish</>
              ) : (
                <><Eye className="h-3.5 w-3.5" /> Publish</>
              )}
            </button>
            <button
              onClick={undo}
              title="Undo (Ctrl+Z)"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-text-secondary transition hover:text-text-primary disabled:opacity-30"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={redo}
              title="Redo (Ctrl+Y)"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-text-secondary transition hover:text-text-primary disabled:opacity-30"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            {/* Viewport mode (responsive preview) */}
            <div className="flex items-center rounded-lg border border-border bg-bg overflow-hidden">
              {([
                { mode: "desktop" as ViewportMode, icon: Monitor, title: "Desktop view" },
                { mode: "tablet" as ViewportMode, icon: Tablet, title: "Tablet view (768px)" },
                { mode: "mobile" as ViewportMode, icon: Smartphone, title: "Mobile view (375px)" },
              ] as const).map(({ mode, icon: Icon, title }) => (
                <button
                  key={mode}
                  onClick={() => setViewportMode(mode)}
                  title={title}
                  className={`flex items-center justify-center px-2.5 py-1.5 text-xs transition ${
                    viewportMode === mode
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>

            {/* Show/hide grid toggle */}
            <button
              onClick={() => setShowGrid((v) => !v)}
              title={showGrid ? "Hide grid" : "Show grid"}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition ${showGrid ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-bg text-text-secondary hover:text-text-primary"}`}
            >
              <Grid className="h-3.5 w-3.5" />
            </button>

            {/* Live data preview toggle */}
            <button
              onClick={handleToggleLiveData}
              disabled={loadingLiveData}
              title={liveDataMode ? "Showing live data — click to switch back to static preview" : "Preview with live data from your monitors"}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition disabled:opacity-50 ${liveDataMode ? "border-green-500/40 bg-green-500/10 text-green-400" : "border-border bg-bg text-text-secondary hover:text-text-primary"}`}
            >
              {loadingLiveData ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading…</>
              ) : (
                <><Activity className="h-3.5 w-3.5" /> {liveDataMode ? "Live" : "Preview"}</>
              )}
            </button>

            {/* Canvas zoom controls */}
            <div className="flex items-center rounded-lg border border-border bg-bg overflow-hidden">
              <button onClick={zoomOut} title="Zoom out (Ctrl+scroll)" className="flex items-center justify-center px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary transition">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button onClick={zoomReset} title="Reset zoom" className="px-2 py-1.5 text-xs font-mono text-text-secondary hover:text-text-primary transition min-w-[40px] text-center">
                {Math.round(zoom * 100)}%
              </button>
              <button onClick={zoomIn} title="Zoom in (Ctrl+scroll)" className="flex items-center justify-center px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary transition">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => { zoomReset(); setViewportMode("desktop"); }} title="Fit to screen" className="flex items-center justify-center px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary transition border-l border-border">
                <Maximize2 className="h-3 w-3" />
              </button>
            </div>

            {/* Version history button */}
            <button
              onClick={() => { setShowVersionHistory(true); loadApiHistory(); }}
              title={`Version history — ${versionHistory.length} save${versionHistory.length !== 1 ? "s" : ""} stored`}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
            >
              <History className="h-3.5 w-3.5" />
              History
              {versionHistory.length > 0 && (
                <span className="ml-0.5 rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{versionHistory.length}</span>
              )}
            </button>

            {/* Template gallery button */}
            <button
              onClick={() => setShowTemplateGallery(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              Templates
            </button>

            {/* Page settings button */}
            <button
              onClick={() => setShowPageSettings(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Settings
            </button>

            {/* Auto-save toggle */}
            <button
              onClick={() => setAutoSaveEnabled(v => !v)}
              title={autoSaveEnabled ? "Auto-save is ON — click to disable" : "Auto-save is OFF — click to enable"}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition ${autoSaveEnabled ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border bg-bg text-text-secondary hover:text-text-primary'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${autoSaveEnabled ? 'bg-accent animate-pulse' : 'bg-text-secondary/40'}`} />
              Auto
            </button>

            {/* Manual save button — greyed when no changes */}
            <button
              onClick={() => handleSave()}
              disabled={saving || !isDirty}
              title={isDirty ? "Save changes" : "No unsaved changes"}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90 disabled:opacity-40 disabled:cursor-default"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : isDirty ? "Save*" : "Saved"}
            </button>
          </div>
        </header>

        {/* Editor body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Widget Palette — left sidebar */}
          <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Widgets</p>
            </div>
            {/* Search input */}
            <div className="border-b border-border p-2">
              <input
                type="text"
                placeholder="Search widgets..."
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
              />
            </div>
            {/* Category tabs — hidden when searching */}
            {!paletteSearch && (
              <div className="flex flex-wrap gap-1 border-b border-border p-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                      activeCategory === cat
                        ? "bg-accent text-white"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
            {/* Widget list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {(() => {
                const filtered = paletteSearch
                  ? WIDGET_PALETTE.filter((w) => {
                      const q = paletteSearch.toLowerCase();
                      return (
                        w.label.toLowerCase().includes(q) ||
                        w.description.toLowerCase().includes(q) ||
                        w.type.toLowerCase().includes(q)
                      );
                    })
                  : WIDGET_PALETTE.filter((w) => w.category === activeCategory);
                if (filtered.length === 0) {
                  return (
                    <p className="py-4 text-center text-xs text-text-secondary/60">No widgets found</p>
                  );
                }
                return filtered.map((widget) => (
                  <PaletteWidget key={widget.type} item={widget} onQuickAdd={addWidget} />
                ));
              })()}
            </div>
          </aside>

          {/* Canvas */}
          <main className="flex-1 overflow-auto bg-bg/50 p-6">
            {viewportMode !== "desktop" && (
              <div className="mb-3 flex items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                  {viewportMode === "tablet" ? <Tablet className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                  {viewportMode === "tablet" ? "Tablet preview — 768px" : "Mobile preview — 375px"}
                </span>
              </div>
            )}
            <CanvasDropZone
              widgets={widgets}
              selectedId={selectedId}
              selectedIds={selectedIds}
              isDraggingOverCanvas={isDraggingOverCanvas}
              canvasRef={canvasRef}
              zoom={zoom}
              viewportMode={viewportMode}
              showGrid={showGrid}
              alignGuides={alignGuides}
              paletteDropPreview={paletteDropPreview}
              liveDataMode={liveDataMode}
              liveWidgetData={liveWidgetData}
              onSelect={handleWidgetSelect}
              onDelete={deleteWidget}
              onDuplicate={duplicateWidget}
              onResize={resizeWidgetById}
              onToggleLock={toggleWidgetLock}
            />
          </main>

          {/* Right panel — Properties */}
          <aside className="flex w-60 shrink-0 flex-col border-l border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Settings className="h-3.5 w-3.5 text-text-secondary" />
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Properties</p>
            </div>
            <ConfigPanel
              widget={selectedWidget}
              monitors={monitors}
              tags={tags}
              folders={folders}
              onChange={updateWidgetConfig}
              onResize={updateWidgetSize}
              onDelete={deleteWidget}
              onDuplicate={duplicateWidget}
              onToggleLock={toggleWidgetLock}
              onZOrder={handleZOrder}
              liveData={selectedWidget ? liveWidgetData[selectedWidget.id] : undefined}
              liveDataMode={liveDataMode}
            />
          </aside>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDragPaletteItem && (
          <div className="cursor-grabbing rounded-xl border border-accent/50 bg-surface px-3 py-2 shadow-xl shadow-black/30">
            <div className="flex items-center gap-2">
              <activeDragPaletteItem.icon className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-semibold text-text-primary">{activeDragPaletteItem.label}</span>
            </div>
          </div>
        )}
        {activeDragCanvasWidget && (
          <div className="cursor-grabbing rounded-xl border-2 border-accent/60 bg-surface shadow-xl shadow-black/30 px-4 py-3 opacity-90">
            <span className="text-xs font-medium text-text-primary">
              {WIDGET_PALETTE.find((p) => p.type === activeDragCanvasWidget.type)?.label ?? activeDragCanvasWidget.type}
            </span>
          </div>
        )}
      </DragOverlay>

      {/* Page Settings Modal */}
      {showPageSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50 flex flex-col" style={{ maxHeight: 'min(90vh, 760px)' }}>
            <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Page Settings</h2>
                <p className="text-xs text-text-muted mt-0.5">Configure theme, appearance, auto-refresh, and branding.</p>
              </div>
              <button onClick={() => setShowPageSettings(false)} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5 flex-1">
              {/* Logo URL */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Logo URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={pageSettings.logoUrl ?? ""}
                  onChange={(e) => setPageSettings((s) => ({ ...s, logoUrl: e.target.value || undefined }))}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-xs text-text-muted">Displayed above the page title. Leave empty to hide.</p>
              </div>

              {/* Favicon URL */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Favicon URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/favicon.ico"
                  value={pageSettings.faviconUrl ?? ""}
                  onChange={(e) => setPageSettings((s) => ({ ...s, faviconUrl: e.target.value || undefined }))}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-xs text-text-muted">Custom favicon for the public status page. Leave empty to use default.</p>
              </div>

              {/* Accent color */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={pageSettings.accentColor ?? "#6366f1"}
                    onChange={(e) => setPageSettings((s) => ({ ...s, accentColor: e.target.value }))}
                    className="h-8 w-10 rounded cursor-pointer border border-border bg-bg"
                  />
                  <input
                    type="text"
                    placeholder="#6366f1"
                    value={pageSettings.accentColor ?? ""}
                    onChange={(e) => setPageSettings((s) => ({ ...s, accentColor: e.target.value || undefined }))}
                    className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-xs text-text-muted">Override the default accent color on the public page.</p>
              </div>

              {/* Auto-refresh interval */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  <RefreshCw className="inline h-3 w-3 mr-1" />
                  Auto-Refresh Interval
                </label>
                <select
                  value={pageSettings.autoRefreshInterval ?? 60}
                  onChange={(e) => setPageSettings((s) => ({ ...s, autoRefreshInterval: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary focus:border-accent focus:outline-none"
                >
                  <option value={0}>Off (manual only)</option>
                  <option value={10}>Every 10 seconds</option>
                  <option value={30}>Every 30 seconds</option>
                  <option value={60}>Every 60 seconds (default)</option>
                  <option value={300}>Every 5 minutes</option>
                  <option value={600}>Every 10 minutes</option>
                </select>
              </div>

              {/* Theme selector */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Theme</label>
                <div className="flex rounded-lg border border-border bg-bg overflow-hidden">
                  {(["dark", "light", "system"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setPageSettings((s) => ({ ...s, theme: t }))}
                      className={`flex-1 py-1.5 text-xs font-medium capitalize transition ${(pageSettings.theme ?? "dark") === t ? "bg-accent/15 text-accent" : "text-text-secondary hover:text-text-primary"}`}
                    >{t}</button>
                  ))}
                </div>
              </div>

              {/* Font selector */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Font</label>
                <select
                  value={pageSettings.fontFamily ?? "inter"}
                  onChange={(e) => setPageSettings((s) => ({ ...s, fontFamily: e.target.value as PageSettings["fontFamily"] }))}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary focus:border-accent focus:outline-none"
                >
                  <option value="inter">Inter (default)</option>
                  <option value="roboto">Roboto</option>
                  <option value="system">System UI</option>
                  <option value="mono">Monospace</option>
                </select>
              </div>

              {/* Background style */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Background</label>
                <div className="flex rounded-lg border border-border bg-bg overflow-hidden mb-2">
                  {(["solid", "gradient", "grid-dots"] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => setPageSettings((s) => ({ ...s, backgroundStyle: style }))}
                      className={`flex-1 py-1.5 text-xs font-medium capitalize transition ${(pageSettings.backgroundStyle ?? "solid") === style ? "bg-accent/15 text-accent" : "text-text-secondary hover:text-text-primary"}`}
                    >{style === "grid-dots" ? "Grid Dots" : style}</button>
                  ))}
                </div>
                {(pageSettings.backgroundStyle ?? "solid") === "solid" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={pageSettings.backgroundColor ?? "#0f1117"}
                      onChange={(e) => setPageSettings((s) => ({ ...s, backgroundColor: e.target.value }))}
                      className="h-8 w-10 rounded cursor-pointer border border-border bg-bg"
                    />
                    <input
                      type="text"
                      placeholder="#0f1117"
                      value={pageSettings.backgroundColor ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, backgroundColor: e.target.value || undefined }))}
                      className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Branding toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-text-primary">Show &quot;Powered by {brand.name}&quot;</p>
                  <p className="text-xs text-text-muted mt-0.5">Displays the {brand.name} branding in the page footer.</p>
                </div>
                <button
                  onClick={() => setPageSettings((s) => ({ ...s, showBranding: !(s.showBranding !== false) }))}
                  className={`relative h-5 w-9 rounded-full transition-colors ${(pageSettings.showBranding !== false) ? 'bg-accent' : 'bg-surface-elevated border border-border'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${(pageSettings.showBranding !== false) ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Password Protection */}
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-text-primary mb-2">Password Protection</p>
                {page?.hasPassword ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-3">
                    {/* Status row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-text-primary">Password protected</p>
                          <p className="text-[10px] text-text-secondary">Viewers must enter the password to view this page.</p>
                        </div>
                      </div>
                    </div>

                    {/* Change password toggle */}
                    {!confirmRemovePassword && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => { setShowChangePassword((v) => !v); setPasswordInput(""); setPasswordConfirm(""); }}
                          className="text-xs text-accent hover:text-accent/80 transition-colors"
                        >{showChangePassword ? "↑ Cancel" : "Change password"}</button>

                        {showChangePassword && (
                          <div className="space-y-2">
                            <input
                              type="password"
                              placeholder="New password"
                              value={passwordInput}
                              onChange={(e) => setPasswordInput(e.target.value)}
                              className="w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                              autoFocus
                            />
                            <input
                              type="password"
                              placeholder="Confirm new password"
                              value={passwordConfirm}
                              onChange={(e) => setPasswordConfirm(e.target.value)}
                              className={`w-full rounded-lg border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none ${passwordConfirm && passwordInput !== passwordConfirm ? "border-danger focus:border-danger" : "border-border focus:border-accent"}`}
                            />
                            {passwordConfirm && passwordInput !== passwordConfirm && (
                              <p className="text-[10px] text-danger">Passwords don't match</p>
                            )}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => { setShowChangePassword(false); setPasswordInput(""); setPasswordConfirm(""); }}
                                className="flex-1 rounded-lg border border-border py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                              >Cancel</button>
                              <button
                                type="button"
                                disabled={changingPassword || !passwordInput || passwordInput !== passwordConfirm}
                                onClick={async () => {
                                  setChangingPassword(true);
                                  try {
                                    await api(`/v1/status-pages/${id}`, undefined, { method: "PATCH", body: JSON.stringify({ password: passwordInput }) });
                                    setPasswordInput(""); setPasswordConfirm(""); setShowChangePassword(false);
                                    toastCtx.success("Password updated");
                                  } catch { toastCtx.error("Failed to update password"); }
                                  finally { setChangingPassword(false); }
                                }}
                                className="flex-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                              >{changingPassword ? "Updating…" : "Update"}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Remove confirmation */}
                    {!showChangePassword && (
                      confirmRemovePassword ? (
                        <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 space-y-2">
                          <p className="text-xs font-medium text-danger">Remove password?</p>
                          <p className="text-[10px] text-text-secondary">The page will become publicly accessible to anyone with the link.</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setConfirmRemovePassword(false)} className="flex-1 rounded-lg border border-border py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
                            <button
                              type="button"
                              disabled={changingPassword}
                              onClick={async () => {
                                setChangingPassword(true);
                                try {
                                  await api(`/v1/status-pages/${id}`, undefined, { method: "PATCH", body: JSON.stringify({ removePassword: true }) });
                                  setPage((p) => p ? { ...p, hasPassword: false } : p);
                                  setConfirmRemovePassword(false);
                                  toastCtx.success("Password removed — page is now public");
                                } catch { toastCtx.error("Failed to remove password"); }
                                finally { setChangingPassword(false); }
                              }}
                              className="flex-1 rounded-lg bg-danger py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                            >{changingPassword ? "Removing…" : "Yes, remove"}</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmRemovePassword(true)} className="text-xs text-danger/70 hover:text-danger transition-colors">
                          Remove password protection
                        </button>
                      )
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-bg/60 px-4 py-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-text-secondary shrink-0" />
                      <p className="text-xs text-text-secondary">No password — page is publicly accessible to anyone.</p>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="password"
                        placeholder="Enter a password to restrict access"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                      />
                      <input
                        type="password"
                        placeholder="Confirm password"
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        className={`w-full rounded-lg border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none ${passwordConfirm && passwordInput !== passwordConfirm ? "border-danger focus:border-danger" : "border-border focus:border-accent"}`}
                      />
                      {passwordConfirm && passwordInput !== passwordConfirm && (
                        <p className="text-[10px] text-danger">Passwords don't match</p>
                      )}
                      <button
                        type="button"
                        disabled={changingPassword || !passwordInput || passwordInput !== passwordConfirm}
                        onClick={async () => {
                          setChangingPassword(true);
                          try {
                            await api(`/v1/status-pages/${id}`, undefined, { method: "PATCH", body: JSON.stringify({ password: passwordInput }) });
                            setPasswordInput(""); setPasswordConfirm("");
                            setPage((p) => p ? { ...p, hasPassword: true } : p);
                            toastCtx.success("Password set — viewers must enter it to access");
                          } catch { toastCtx.error("Failed to set password"); }
                          finally { setChangingPassword(false); }
                        }}
                        className="w-full rounded-lg bg-accent py-2 text-xs font-semibold text-white disabled:opacity-50 transition-colors hover:bg-accent/90"
                      >{changingPassword ? "Setting…" : "Set password"}</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Webhook Notifications */}
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-text-primary mb-1">Webhook Notifications</p>
                <p className="text-[11px] text-text-muted mb-3">Receive a POST request when the overall page status changes between <span className="text-green-400 font-medium">operational</span>, <span className="text-yellow-400 font-medium">degraded</span>, and <span className="text-red-400 font-medium">outage</span>.</p>
                <div className="rounded-xl border border-border bg-bg/60 px-4 py-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Webhook URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/webhook/status"
                      value={pageSettings.notifyWebhookUrl ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, notifyWebhookUrl: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                    <p className="text-[10px] text-text-secondary mt-1">Leave empty to disable. Save the page to apply changes.</p>
                  </div>
                  {pageSettings.notifyWebhookUrl && (
                    <div className="rounded-lg bg-surface-elevated/50 border border-border/50 p-2.5">
                      <p className="text-[10px] font-semibold text-text-secondary mb-1.5">Example payload</p>
                      <pre className="text-[10px] text-text-muted font-mono whitespace-pre-wrap leading-relaxed">{JSON.stringify({
                        event: "status_page.status_changed",
                        slug: page?.slug ?? "my-page",
                        status: "degraded",
                        previousStatus: "operational",
                        timestamp: new Date().toISOString(),
                        affectedMonitors: [{ id: "abc123", name: "API" }],
                      }, null, 2)}</pre>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Slack Webhook URL</label>
                    <input
                      type="url"
                      placeholder="https://hooks.slack.com/services/..."
                      value={pageSettings.slackWebhookUrl ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, slackWebhookUrl: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                    <p className="text-[10px] text-text-secondary mt-1">Optional. Posts a Slack message when the page status changes.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Discord Webhook URL</label>
                    <input
                      type="url"
                      placeholder="https://discord.com/api/webhooks/..."
                      value={pageSettings.discordWebhookUrl ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, discordWebhookUrl: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                    <p className="text-[10px] text-text-secondary mt-1">Optional. Posts a Discord embed when the page status changes.</p>
                  </div>
                </div>
              </div>

              {/* Advanced / Custom CSS */}
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-text-primary mb-3">Advanced</p>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Custom CSS <span className="text-text-muted">(advanced)</span>
                  </label>
                  <textarea
                    rows={6}
                    placeholder={"/* Add custom styles for your status page */\nbody { font-family: 'Inter', sans-serif; }\n.page-title { color: #6366f1; }"}
                    value={pageSettings.customCss ?? ""}
                    onChange={(e) => setPageSettings((s) => ({ ...s, customCss: e.target.value || undefined }))}
                    className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none font-mono resize-y min-h-[80px]"
                    spellCheck={false}
                  />
                  <p className="text-[10px] text-text-secondary mt-1">
                    CSS injected into the public page &lt;head&gt;. Use to override fonts, colors, or layout. Max 10,000 characters.
                  </p>
                </div>
              </div>

              {/* SEO Section */}
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-text-primary mb-3">SEO &amp; Social Sharing</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Meta Title</label>
                    <input
                      type="text"
                      placeholder="My Company Status"
                      maxLength={60}
                      value={pageSettings.metaTitle ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, metaTitle: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-text-muted">Overrides the page title in search results and browser tab (max 60 chars).</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Meta Description</label>
                    <textarea
                      rows={2}
                      placeholder="Live status and uptime for all our services."
                      maxLength={160}
                      value={pageSettings.metaDescription ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, metaDescription: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-text-muted">Shown in search engine snippets (max 160 chars).</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">OG Image URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/og-image.png"
                      value={pageSettings.ogImageUrl ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, ogImageUrl: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-text-muted">Image shown when sharing on Twitter, Discord, Slack, etc. (1200×630px recommended).</p>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-text-primary">Allow search engines to index</p>
                      <p className="text-xs text-text-muted mt-0.5">Adds robots meta tag (index, follow). Disable for private pages.</p>
                    </div>
                    <button
                      onClick={() => setPageSettings((s) => ({ ...s, robotsIndex: !(s.robotsIndex !== false) }))}
                      className={`relative h-5 w-9 rounded-full transition-colors ${(pageSettings.robotsIndex !== false) ? 'bg-accent' : 'bg-surface-elevated border border-border'}`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${(pageSettings.robotsIndex !== false) ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4 shrink-0">
              <button onClick={() => setShowPageSettings(false)} className="rounded-lg border border-border bg-bg px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition">
                Cancel
              </button>
              <button
                onClick={() => { setShowPageSettings(false); handleSave(); }}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent/90"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Gallery Modal */}
      {showTemplateGallery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50 mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Template Gallery</h2>
                <p className="text-xs text-text-muted mt-0.5">Start from a preset layout. This will replace your current canvas.</p>
              </div>
              <button
                onClick={() => setShowTemplateGallery(false)}
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 grid grid-cols-2 gap-4">
              {STATUS_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => applyTemplate(tmpl)}
                  className="text-left rounded-xl border border-border bg-bg/60 p-4 hover:border-accent/50 hover:bg-accent/5 transition-all group"
                >
                  <div className="text-2xl mb-2">{tmpl.preview}</div>
                  <p className="text-sm font-semibold text-text-primary group-hover:text-accent transition">{tmpl.name}</p>
                  <p className="text-xs text-text-muted mt-1">{tmpl.description}</p>
                  <p className="text-xs text-text-secondary/60 mt-2">{tmpl.widgets.length} widgets</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Version History Modal */}
      {showVersionHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50 mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Version History</h2>
                <p className="text-xs text-text-muted mt-0.5">Last 10 saves stored on server. One-click restore.</p>
              </div>
              <button onClick={() => setShowVersionHistory(false)} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {apiHistoryLoading ? (
                <div className="py-8 text-center text-sm text-text-secondary">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent mx-auto mb-2" />
                  <p>Loading history…</p>
                </div>
              ) : apiHistory.length === 0 ? (
                <div className="py-8 text-center text-sm text-text-secondary">
                  <History className="h-8 w-8 mx-auto mb-2 text-text-muted/40" />
                  <p>No server saves yet.</p>
                  <p className="text-xs text-text-muted mt-1">Save your page to start tracking history.</p>
                </div>
              ) : apiHistory.map((entry, i) => {
                const d = new Date(entry.savedAt);
                const dateLabel = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                const widgetCount = Array.isArray(entry.layout?.widgets) ? entry.layout.widgets.length : 0;
                const isRestoring = restoringHistoryId === entry.id;
                return (
                  <div key={entry.id} className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-4 py-3 group">
                    <div>
                      <p className="text-xs font-medium text-text-primary flex items-center gap-2">
                        {i === 0 && <span className="text-[10px] rounded-full bg-accent/15 text-accent px-1.5 py-0.5 font-semibold">Latest</span>}
                        {entry.label ? <span className="text-[10px] text-text-muted italic">{entry.label}</span> : null}
                        {dateLabel}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">{widgetCount} widget{widgetCount !== 1 ? "s" : ""}</p>
                    </div>
                    <button
                      onClick={() => restoreApiVersion(entry.id)}
                      disabled={isRestoring}
                      className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent/50 hover:text-accent transition opacity-0 group-hover:opacity-100 disabled:opacity-50"
                    >
                      {isRestoring ? "Restoring…" : "Restore"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}
