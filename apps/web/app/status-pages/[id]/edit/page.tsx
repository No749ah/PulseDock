"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Save,
  Eye,
  ExternalLink,
  ChevronLeft,
  LayoutGrid,
  Globe,
  EyeOff,
  Activity,
  BarChart2,
  AlertTriangle,
  Zap,
  Type,
  Minus,
  Clock,
  TrendingUp,
  CheckCircle,
  Grid,
} from "lucide-react";
import { api } from "../../../../lib/api";
import { getUser } from "../../../../components/auth";
import { useToast } from "../../../../components/ui/toast";

interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

interface PageLayout {
  widgets: Widget[];
}

interface StatusPage {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  hasPassword: boolean;
  layout: PageLayout;
}

interface WidgetPaletteItem {
  type: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
}

const WIDGET_PALETTE: WidgetPaletteItem[] = [
  // Status
  { type: "overall-system-status", label: "Overall Status", description: "Hero operational / degraded / outage banner", icon: CheckCircle, category: "Status" },
  { type: "current-status-badge", label: "Status Badge", description: "Green/yellow/red pill for a single monitor", icon: Zap, category: "Status" },
  { type: "multi-monitor-status-grid", label: "Monitor Grid", description: "Grid of status badges for multiple monitors", icon: Grid, category: "Status" },
  { type: "active-incident-banner", label: "Incident Banner", description: "Full-width banner when something is down", icon: AlertTriangle, category: "Status" },
  // Uptime
  { type: "uptime-bar", label: "Uptime Bar", description: "Shows uptime % over a selectable period", icon: Activity, category: "Uptime" },
  { type: "uptime-timeline", label: "Uptime Timeline", description: "90-day bar chart (green/red per day)", icon: BarChart2, category: "Uptime" },
  { type: "sla-summary", label: "SLA Summary", description: "SLA target vs actual for a period", icon: TrendingUp, category: "Uptime" },
  // Performance
  { type: "response-time-chart", label: "Response Time", description: "Sparkline or area chart of latency", icon: TrendingUp, category: "Performance" },
  { type: "check-history-feed", label: "Check History", description: "Live-updating log of recent check results", icon: Clock, category: "Performance" },
  // Incidents
  { type: "incident-history", label: "Incident History", description: "Paginated list of past incidents", icon: AlertTriangle, category: "Incidents" },
  // Content
  { type: "text-block", label: "Text Block", description: "Free text / markdown for announcements", icon: Type, category: "Content" },
  { type: "scheduled-maintenance", label: "Maintenance", description: "Shows upcoming maintenance windows", icon: Clock, category: "Content" },
  { type: "divider", label: "Divider", description: "Visual separator or empty space", icon: Minus, category: "Content" },
];

const CATEGORIES = [...new Set(WIDGET_PALETTE.map((w) => w.category))];

export default function StatusPageEditorPage() {
  const params = useParams();
  const router = useRouter();
  const toastCtx = useToast();
  const id = params.id as string;

  const [page, setPage] = useState<StatusPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Status");

  useEffect(() => {
    const u = getUser();
    if (!u) router.replace("/login");
    fetchPage();
  }, [id]);

  async function fetchPage() {
    setLoading(true);
    try {
      const data = await api<StatusPage>(`/v1/status-pages/${id}`);
      setPage(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        toastCtx.error("Status page not found");
        router.push("/status-pages");
      } else if (msg.includes("403") || msg.toLowerCase().includes("forbidden") || msg.toLowerCase().includes("denied")) {
        toastCtx.error("Access denied");
        router.push("/status-pages");
      } else {
        toastCtx.error("Failed to load status page");
      }
    } finally {
      setLoading(false);
    }
  }

  const handleSave = useCallback(async () => {
    if (!page) return;
    setSaving(true);
    try {
      await api(`/v1/status-pages/${id}`, undefined, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: page.layout }),
      });
      toastCtx.success("Saved");
    } catch {
      toastCtx.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }, [page, id]);

  async function handleTogglePublish() {
    if (!page) return;
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

  function handleWidgetDrop(widget: WidgetPaletteItem) {
    toastCtx.info(`Drag & drop builder coming soon! ${widget.label} widget will be available shortly.`);
  }

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
            <code className="text-xs text-text-secondary font-mono">/status/{page.slug}</code>
            {page.isPublished && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                Live
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {page.isPublished && (
            <a
              href={`${publicBase}/status/${page.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Preview
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
              <><Globe className="h-3.5 w-3.5" /> Publish</>
            )}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
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
          {/* Category tabs */}
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
          {/* Widget list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {WIDGET_PALETTE.filter((w) => w.category === activeCategory).map((widget) => {
              const Icon = widget.icon;
              return (
                <button
                  key={widget.type}
                  onClick={() => handleWidgetDrop(widget)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("widgetType", widget.type);
                  }}
                  className="w-full rounded-xl border border-border bg-bg p-3 text-left transition hover:border-accent/50 hover:bg-accent/5 active:scale-95"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
                    <span className="text-xs font-semibold text-text-primary">{widget.label}</span>
                  </div>
                  <p className="text-[10px] leading-tight text-text-secondary">{widget.description}</p>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex-1 overflow-auto p-6">
          {page.layout.widgets.length === 0 ? (
            <div
              className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/50 bg-surface/30"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const type = e.dataTransfer.getData("widgetType");
                const paletteItem = WIDGET_PALETTE.find((w) => w.type === type);
                if (paletteItem) handleWidgetDrop(paletteItem);
              }}
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
                <LayoutGrid className="h-8 w-8 text-accent/60" />
              </div>
              <h3 className="text-base font-semibold text-text-primary">Drag widgets here</h3>
              <p className="mt-2 max-w-xs text-center text-sm text-text-secondary">
                Drag widgets from the left panel to build your status page. The drag &amp; drop canvas is coming in the next update.
              </p>
              <div className="mt-6 rounded-xl border border-border bg-bg px-5 py-3 text-xs text-text-secondary">
                💡 <strong>Tip:</strong> Click any widget on the left to add it, or use the API to programmatically set the layout.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {page.layout.widgets.map((widget) => (
                <div
                  key={widget.id}
                  className="rounded-xl border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">{widget.type}</span>
                    <span className="text-xs text-text-secondary">
                      {widget.w}×{widget.h} @ ({widget.x},{widget.y})
                    </span>
                  </div>
                  <pre className="mt-2 text-xs text-text-secondary overflow-auto">
                    {JSON.stringify(widget.config, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Right panel placeholder */}
        <aside className="hidden w-56 shrink-0 border-l border-border bg-surface xl:flex xl:flex-col">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Properties</p>
          </div>
          <div className="flex flex-1 items-center justify-center p-4 text-center">
            <p className="text-xs text-text-secondary">Select a widget to configure its properties</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
