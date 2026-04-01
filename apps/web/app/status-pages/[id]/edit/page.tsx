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
import { Settings, Tablet, Smartphone } from "lucide-react";
import { api } from "../../../../lib/api";
import { getUser } from "../../../../components/auth";
import { useToast } from "../../../../components/ui/toast";

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
} from "./components/constants";
import {
  needsMonitorConfig,
  resolveCollisions,
} from "./components/utils";
import { PaletteWidget } from "./components/PaletteWidget";
import { CanvasDropZone } from "./components/CanvasDropZone";
import { ConfigPanel } from "./components/ConfigPanel";
import { EditorToolbar } from "./components/EditorToolbar";
import { PageSettingsModal } from "./components/PageSettingsModal";
import { TemplateGalleryModal } from "./components/TemplateGalleryModal";
import { VersionHistoryModal } from "./components/VersionHistoryModal";

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
        <EditorToolbar
          page={page}
          widgets={widgets}
          publicBase={publicBase}
          selectedId={selectedId}
          selectedIds={selectedIds}
          publishing={publishing}
          saving={saving}
          isDirty={isDirty}
          autoSaveEnabled={autoSaveEnabled}
          showGrid={showGrid}
          zoom={zoom}
          viewportMode={viewportMode}
          liveDataMode={liveDataMode}
          loadingLiveData={loadingLiveData}
          versionHistoryLength={versionHistory.length}
          onBack={() => router.push("/status-pages")}
          onDeselect={() => { setSelectedId(null); setSelectedIds(new Set()); }}
          onAlignSelected={alignSelected}
          onTogglePublish={handleTogglePublish}
          onUndo={undo}
          onRedo={redo}
          onSetViewportMode={setViewportMode}
          onToggleGrid={() => setShowGrid((v) => !v)}
          onToggleLiveData={handleToggleLiveData}
          onZoomOut={zoomOut}
          onZoomIn={zoomIn}
          onZoomReset={zoomReset}
          onZoomFit={() => { zoomReset(); setViewportMode("desktop"); }}
          onOpenVersionHistory={() => { setShowVersionHistory(true); loadApiHistory(); }}
          onOpenTemplates={() => setShowTemplateGallery(true)}
          onOpenSettings={() => setShowPageSettings(true)}
          onToggleAutoSave={() => setAutoSaveEnabled((v) => !v)}
          onSave={() => handleSave()}
        />

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
        <PageSettingsModal
          page={page}
          pageSettings={pageSettings}
          setPageSettings={setPageSettings}
          setPage={setPage}
          id={id}
          onClose={() => setShowPageSettings(false)}
          onSave={() => handleSave()}
        />
      )}

      {/* Template Gallery Modal */}
      {showTemplateGallery && (
        <TemplateGalleryModal
          onClose={() => setShowTemplateGallery(false)}
          onApply={applyTemplate}
        />
      )}

      {/* Version History Modal */}
      {showVersionHistory && (
        <VersionHistoryModal
          apiHistory={apiHistory}
          apiHistoryLoading={apiHistoryLoading}
          restoringHistoryId={restoringHistoryId}
          onClose={() => setShowVersionHistory(false)}
          onRestore={restoreApiVersion}
        />
      )}
    </DndContext>
  );
}
