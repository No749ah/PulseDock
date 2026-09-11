"use client";

import {
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  Copy,
  Image,
  Layers,
  Lock,
  Monitor,
  Type,
  Unlock,
  X,
} from "lucide-react";

import type { Widget, Monitor as MonitorType, TagOption, FolderOption } from "./types";
import { WIDGET_PALETTE } from "./constants";
import {
  getConfigWarnings,
  getMultiModeHelperText,
  getWidgetConfigHints,
  getDefaultMultiMonitorIds,
} from "./utils";
import { WidgetPreview } from "./WidgetPreview";
import { MultiMonitorPicker } from "../../../components/MultiMonitorPicker";

// ── Widget config panel ──────────────────────────────────────────────────

export interface ConfigPanelProps {
  widget: Widget | null;
  monitors: MonitorType[];
  tags: TagOption[];
  folders: FolderOption[];
  onChange: (config: Widget["config"]) => void;
  onResize: (size: { w: number; h: number }) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleLock: (id: string) => void;
  onZOrder: (id: string, action: "front" | "back" | "forward" | "backward") => void;
  liveData?: unknown;
  liveDataMode?: boolean;
}

export function ConfigPanel({ widget, monitors, tags, folders, onChange, onResize, onDelete, onDuplicate, onToggleLock, onZOrder, liveData, liveDataMode }: ConfigPanelProps) {
  if (!widget) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center">
        <p className="text-xs text-text-secondary">Click a widget on the canvas to configure it</p>
      </div>
    );
  }

  const paletteItem = WIDGET_PALETTE.find((p) => p.type === widget.type);
  const w = widget;

  function update(key: string, value: unknown) {
    onChange({ ...w.config, [key]: value });
  }

  const monitorMode = (w.config.monitorMode as string) ?? "single";
  const supportsLabel = w.type !== "divider";
  const noScopeWidgets = ["divider", "text-block", "scheduled-maintenance", "incident-history", "check-history-feed", "collapsible-section", "tab-container", "code-block", "video-embed", "image-banner", "faq-accordion", "social-links", "link-list", "subscriber-form", "rss-feed-widget", "announcement-bar", "third-party-dependencies", "security-advisory", "column-layout", "sticky-header", "table-of-contents", "page-navigation", "offline-banner"];
  const supportsMonitorScope = !noScopeWidgets.includes(w.type);
  const supportsFilters = !noScopeWidgets.includes(w.type);
  const supportsVisibility = w.type !== "divider";
  const supportsClickAction = w.type !== "divider";
  const supportsStyle = w.type !== "divider";
  const supportsResponsive = w.type !== "divider";
  const configWarnings = getConfigWarnings(w, monitorMode);
  const configHints = getWidgetConfigHints(w.type);
  const hasLiveData = liveDataMode && liveData != null;
  const isMissingSingleMonitor = supportsMonitorScope && monitorMode === "single" && !String(w.config.monitorId ?? "").trim();
  const isMissingPackageName = w.type === "security-advisory" && !String(w.config.packageName ?? "").trim();
  const isMissingEmbedUrl = w.type === "embed-iframe" && !String(w.config.url ?? "").trim();

  function handleMonitorModeChange(nextMode: "single" | "multiple" | "all") {
    if (nextMode === "multiple") {
      onChange({
        ...w.config,
        monitorMode: "multiple",
        monitorId: undefined,
        monitorIds: getDefaultMultiMonitorIds(w, monitors),
      });
      return;
    }

    if (nextMode === "single") {
      const firstSelected = Array.isArray(w.config.monitorIds) ? w.config.monitorIds[0] : undefined;
      onChange({
        ...w.config,
        monitorMode: "single",
        monitorId: (w.config.monitorId as string | undefined) ?? firstSelected,
        monitorIds: undefined,
      });
      return;
    }

    onChange({
      ...w.config,
      monitorMode: "all",
      monitorId: undefined,
      monitorIds: undefined,
    });
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <div>
        <p className="mb-1 text-xs font-semibold text-text-primary">{paletteItem?.label ?? w.type}</p>
        <p className="text-[10px] text-text-secondary">{paletteItem?.description}</p>
      </div>

      {/* Live data preview when Live mode is on */}
      {hasLiveData && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-green-400 flex items-center gap-1 mb-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            Live data
          </p>
          <div className="pointer-events-none">
            <WidgetPreview type={w.type} config={w.config} w={w.w} liveData={liveData} />
          </div>
        </div>
      )}

      {configWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">Configuration needed</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-amber-200/90">
            {configWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {configHints.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-surface-elevated/30 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Setup tips</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-text-muted">
            {configHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </div>
      )}

      {supportsLabel && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Label override</label>
          <input
            type="text"
            value={(w.config.label as string) ?? ""}
            onChange={(e) => update("label", e.target.value || undefined)}
            placeholder="Optional custom label"
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
          />
        </div>
      )}

      {supportsMonitorScope && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Monitor scope</label>
          <select
            value={monitorMode}
            onChange={(e) => handleMonitorModeChange(e.target.value as "single" | "multiple" | "all")}
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="single">Single monitor</option>
            <option value="multiple">Multiple monitors</option>
            <option value="all">All monitors</option>
          </select>
          <p className="mt-1 text-[10px] text-text-muted">
            {monitorMode === "single"
              ? "Single: one explicit monitor drives this widget."
              : monitorMode === "multiple"
                ? "Multiple: choose a monitor set for comparison/aggregation."
                : "All: automatically includes every monitor that matches filters."}
          </p>
        </div>
      )}

      {supportsMonitorScope && monitorMode === "single" && (
        <div>
          <label className={`mb-1 block text-xs font-medium ${isMissingSingleMonitor ? "text-danger" : "text-text-secondary"}`}>
            Monitor <span className="text-danger">*</span>
          </label>
          <select
            value={(w.config.monitorId as string) ?? ""}
            onChange={(e) => update("monitorId", e.target.value || undefined)}
            className={`w-full rounded-lg border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none ${isMissingSingleMonitor ? "border-danger/60 focus:border-danger" : "border-border focus:border-accent"}`}
            aria-invalid={isMissingSingleMonitor}
          >
            <option value="">— Select monitor —</option>
            {monitors.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {isMissingSingleMonitor && (
            <p className="mt-1 text-[10px] text-danger">Required: choose a monitor, or switch scope to Multiple/All.</p>
          )}
        </div>
      )}

      {supportsMonitorScope && monitorMode === "multiple" && (
        <div className="space-y-2">
          <p className="text-[10px] text-text-secondary">
            {getMultiModeHelperText(w.type)}
          </p>
          <MultiMonitorPicker
            monitors={monitors}
            selectedIds={(w.config.monitorIds as string[]) ?? []}
            onChange={(values) => update("monitorIds", values)}
            tags={tags}
            folders={folders}
          />
        </div>
      )}

      {supportsFilters && (
        <div className="rounded-lg border border-border/50 bg-bg/50 p-2.5 space-y-2">
          <p className="text-[10px] font-medium text-text-secondary">Filters</p>
        <label className="block text-[10px] text-text-secondary">
          Tag filter
          <select
            value={(w.config.tag as string) ?? ""}
            onChange={(e) => update("tag", e.target.value || undefined)}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name}>{tag.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] text-text-secondary">
          Folder filter
          <select
            value={(w.config.folderId as string) ?? ""}
            onChange={(e) => update("folderId", e.target.value || undefined)}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">All folders</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] text-text-secondary">
          Monitor type filter
          <select
            value={(w.config.monitorType as string) ?? ""}
            onChange={(e) => update("monitorType", e.target.value || undefined)}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">All types</option>
            <option value="HTTP">HTTP</option>
            <option value="GIT_RELEASE">Version</option>
            <option value="DOCKER_IMAGE">Docker Image</option>
            <option value="TCP">TCP</option>
            <option value="SSL_CERT">SSL Cert</option>
            <option value="HEARTBEAT">Heartbeat</option>
          </select>
        </label>
        </div>
      )}

      {supportsVisibility && (
        <div className="rounded-lg border border-border/50 bg-bg/50 p-2.5 space-y-2">
          <p className="text-[10px] font-medium text-text-secondary">Visibility</p>
        <label className="block text-[10px] text-text-secondary">
          Show widget when
          <select
            value={(w.config.visibility as string) ?? "always"}
            onChange={(e) => update("visibility", e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="always">Always visible</option>
            <option value="operational">Only when operational</option>
            <option value="degraded">Only when degraded</option>
            <option value="outage">Only during outage</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[10px] text-text-secondary">
          <input
            type="checkbox"
            checked={Boolean(w.config.hideWhenNoData)}
            onChange={(e) => update("hideWhenNoData", e.target.checked || undefined)}
            className="h-3.5 w-3.5 rounded border-border bg-bg text-accent focus:ring-accent"
          />
          Hide when no monitor data is available
        </label>
        </div>
      )}

      {supportsClickAction && (
        <div className="rounded-lg border border-border/50 bg-bg/50 p-2.5 space-y-2">
          <p className="text-[10px] font-medium text-text-secondary">Click action</p>
        <label className="block text-[10px] text-text-secondary">
          On click
          <select
            value={(w.config.clickAction as string) ?? "none"}
            onChange={(e) => update("clickAction", e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="none">Do nothing</option>
            <option value="monitor-detail">Open monitor detail page</option>
            <option value="external-url">Open external URL</option>
          </select>
        </label>
        {(w.config.clickAction as string) === "external-url" && (
          <label className="block text-[10px] text-text-secondary">
            External URL
            <input
              type="url"
              value={(w.config.clickUrl as string) ?? ""}
              onChange={(e) => update("clickUrl", e.target.value || undefined)}
              placeholder="https://status.example.com/details"
              className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </label>
        )}
        </div>
      )}

      {supportsStyle && (
        <div className="rounded-lg border border-border/50 bg-bg/50 p-2.5 space-y-2">
          <p className="text-[10px] font-medium text-text-secondary">Style</p>
        <label className="flex items-center gap-2 text-[10px] text-text-secondary">
          <input
            type="checkbox"
            checked={Boolean(w.config.showBorder)}
            onChange={(e) => update("showBorder", e.target.checked || undefined)}
            className="h-3.5 w-3.5 rounded border-border bg-bg text-accent focus:ring-accent"
          />
          Show border
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-text-secondary">
            Border radius
            <input
              type="number"
              min={0}
              max={32}
              value={(w.config.borderRadius as number) ?? 12}
              onChange={(e) => update("borderRadius", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="text-[10px] text-text-secondary">
            Padding
            <input
              type="number"
              min={0}
              max={48}
              value={(w.config.padding as number) ?? 8}
              onChange={(e) => update("padding", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
        </div>
        </div>
      )}

      {supportsResponsive && (
        <div className="rounded-lg border border-border/50 bg-bg/50 p-2.5 space-y-2">
          <p className="text-[10px] font-medium text-text-secondary">Responsive</p>
        <label className="block text-[10px] text-text-secondary">
          Mobile behavior
          <select
            value={(w.config.mobileBehavior as string) ?? "normal"}
            onChange={(e) => update("mobileBehavior", e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="normal">Normal</option>
            <option value="full-width">Force full-width</option>
            <option value="collapsed">Collapsed (compact)</option>
            <option value="hidden">Hide on mobile</option>
          </select>
        </label>
        </div>
      )}

      {["uptime-bar", "uptime-timeline", "sla-summary"].includes(w.type) && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Time range</label>
          <select
            value={(w.config.periodDays as number) ?? 30}
            onChange={(e) => update("periodDays", Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      )}

      {["text-block", "scheduled-maintenance"].includes(w.type) && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Content</label>
          <textarea
            value={(w.config.text as string) ?? ""}
            onChange={(e) => update("text", e.target.value || undefined)}
            placeholder="Enter text or markdown…"
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
          />
        </div>
      )}

      {w.type === "collapsible-section" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Section Title</label>
            <input
              type="text"
              value={(w.config.title as string) ?? ""}
              onChange={(e) => update("title", e.target.value || undefined)}
              placeholder="Section title…"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Content</label>
            <textarea
              value={(w.config.description as string) ?? ""}
              onChange={(e) => update("description", e.target.value || undefined)}
              placeholder="Content text (supports newlines)…"
              rows={4}
              className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-3 py-2">
            <p className="text-xs font-medium text-text-primary">Open by default</p>
            <button
              onClick={() => update("defaultOpen", !(w.config.defaultOpen !== false))}
              className={`relative h-5 w-9 rounded-full transition-colors ${(w.config.defaultOpen !== false) ? "bg-accent" : "bg-surface-elevated border border-border"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${(w.config.defaultOpen !== false) ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>
        </>
      )}

      {w.type === "tab-container" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Tabs (JSON)</label>
          <textarea
            value={JSON.stringify(
              (w.config.tabs as unknown[] | undefined) ?? [{ title: "Tab 1", content: "" }, { title: "Tab 2", content: "" }],
              null, 2
            )}
            onChange={(e) => {
              try { update("tabs", JSON.parse(e.target.value)); } catch {}
            }}
            rows={6}
            className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-text-muted">Array of {`{title, content}`} — content supports newlines</p>
        </div>
      )}

      {w.type === "dependency-map" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Edges (JSON)</label>
          <textarea
            value={JSON.stringify((w.config.edges as unknown[] | undefined) ?? [], null, 2)}
            onChange={(e) => {
              try { update("edges", JSON.parse(e.target.value)); } catch {}
            }}
            placeholder='[{"source":"id1","target":"id2","label":"calls"}]'
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-text-muted">Array of {`{source, target, label?}`} using monitor IDs</p>
        </div>
      )}

      {w.type === "multi-environment-status" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Environment → Monitor IDs (JSON)</label>
            <textarea
              value={JSON.stringify((w.config.envMonitors as Record<string, string[]> | undefined) ?? { prod: [], staging: [], dev: [] }, null, 2)}
              onChange={(e) => {
                try { update("envMonitors", JSON.parse(e.target.value)); } catch {}
              }}
              rows={6}
              className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-3 py-2">
            <p className="text-xs font-medium text-text-primary">Show monitor list</p>
            <button
              onClick={() => update("showMonitors", !w.config.showMonitors)}
              className={`relative h-5 w-9 rounded-full transition-colors ${w.config.showMonitors ? "bg-accent" : "bg-surface-elevated border border-border"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${w.config.showMonitors ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>
        </>
      )}

      {w.type === "region-status-map" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Region → Monitor IDs (JSON)</label>
          <textarea
            value={JSON.stringify((w.config.regionMonitors as Record<string, string[]> | undefined) ?? { "EU-West": [], "US-East": [], "APAC": [] }, null, 2)}
            onChange={(e) => {
              try { update("regionMonitors", JSON.parse(e.target.value)); } catch {}
            }}
            rows={6}
            className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-text-muted">Map region names to arrays of monitor IDs</p>
        </div>
      )}

      {w.type === "third-party-dependencies" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Services (JSON)</label>
          <textarea
            value={JSON.stringify((w.config.services as unknown[] | undefined) ?? [{ name: "GitHub", url: "https://api.github.com" }, { name: "Cloudflare", url: "https://cloudflare.com" }], null, 2)}
            onChange={(e) => {
              try { update("services", JSON.parse(e.target.value)); } catch {}
            }}
            rows={6}
            className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-text-muted">Array of {`{name, url}`} — each is HEAD-checked</p>
        </div>
      )}

      {w.type === "security-advisory" && (
        <>
          <div>
            <label className={`mb-1 block text-xs font-medium ${isMissingPackageName ? "text-danger" : "text-text-secondary"}`}>
              Package Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={(w.config.packageName as string) ?? ""}
              onChange={(e) => update("packageName", e.target.value)}
              placeholder="e.g. express"
              className={`w-full rounded-lg border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none ${isMissingPackageName ? "border-danger/60 focus:border-danger" : "border-border focus:border-accent"}`}
              aria-invalid={isMissingPackageName}
            />
            <p className={`mt-1 text-[10px] ${isMissingPackageName ? "text-danger" : "text-text-muted"}`}>
              {isMissingPackageName ? "Required for advisory lookup." : "Package name to look up in GitHub Security Advisories"}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Ecosystem (optional)</label>
            <input
              type="text"
              value={(w.config.ecosystem as string) ?? ""}
              onChange={(e) => update("ecosystem", e.target.value)}
              placeholder="e.g. npm, pip, cargo, go"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
        </>
      )}

      {w.type === "column-layout" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Number of Columns</label>
            <select
              value={(w.config.columns as number) ?? 2}
              onChange={(e) => update("columns", Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value={2}>2 columns</option>
              <option value={3}>3 columns</option>
              <option value={4}>4 columns</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Column Items (JSON)</label>
            <textarea
              rows={4}
              value={JSON.stringify((w.config.items as unknown[] | undefined) ?? [{ heading: "Column 1", body: "Content here" }, { heading: "Column 2", body: "Content here" }], null, 2)}
              onChange={(e) => {
                try {
                  update("items", JSON.parse(e.target.value));
                } catch {
                  // keep previous valid value until JSON is valid
                }
              }}
              placeholder='[{"heading":"Col 1","body":"..."},{"heading":"Col 2","body":"..."}]'
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-text-muted">Array of {`{heading?, body}`} objects, one per column</p>
          </div>
        </>
      )}

      {w.type === "sticky-header" && (
        <div>
          <p className="text-[10px] text-text-muted">Shows the overall system status as a fixed-position banner. Place it at the top of your page (y=0) for best effect. Status is computed from all monitors in real-time.</p>
        </div>
      )}

      {w.type === "table-of-contents" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Items (JSON)</label>
          <textarea
            rows={5}
            value={JSON.stringify((w.config.items as unknown[] | undefined) ?? [{ label: "System Status", anchor: "status" }, { label: "Incidents", anchor: "incidents" }], null, 2)}
            onChange={(e) => {
              try {
                update("items", JSON.parse(e.target.value));
              } catch {
                // keep previous valid value until JSON is valid
              }
            }}
            placeholder='[{"label":"Section Title","anchor":"section-id"}]'
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-text-muted">Array of {"{label, anchor}"} where anchor matches an id on the page element.</p>
        </div>
      )}

      {w.type === "page-navigation" && (
        <div>
          <p className="text-[10px] text-text-muted">Automatically lists all other published status pages in your account. No configuration needed — links update in real-time as pages are published or unpublished.</p>
        </div>
      )}

      {w.type === "offline-banner" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Message</label>
            <input
              type="text"
              value={(w.config.message as string) ?? ""}
              onChange={(e) => update("message", e.target.value || undefined)}
              placeholder="Service monitoring is temporarily unavailable"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-text-secondary">
              Background color
              <input
                type="text"
                value={(w.config.bgColor as string) ?? ""}
                onChange={(e) => update("bgColor", e.target.value || undefined)}
                placeholder="#fef08a or amber-500"
                className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
              />
            </label>
            <label className="text-[10px] text-text-secondary">
              Text color
              <input
                type="text"
                value={(w.config.textColor as string) ?? ""}
                onChange={(e) => update("textColor", e.target.value || undefined)}
                placeholder="#78350f"
                className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
              />
            </label>
          </div>
          <p className="text-[10px] text-text-muted">This banner appears automatically when the visitor&apos;s browser goes offline. Leave colors empty to use the default amber/yellow style.</p>
        </>
      )}

      {w.type === "custom-metric-chart" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Title</label>
            <input
              type="text"
              value={(w.config.title as string) ?? ""}
              onChange={(e) => update("title", e.target.value || undefined)}
              placeholder="e.g. API Latency (24h)"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Monitor</label>
            <select
              value={(w.config.monitorId as string) ?? ""}
              onChange={(e) => update("monitorId", e.target.value || undefined)}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">— Select monitor —</option>
              {monitors.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Metric</label>
            <select
              value={(w.config.metric as string) ?? "latency"}
              onChange={(e) => update("metric", e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="latency">Latency (ms)</option>
              <option value="uptime">Uptime (%)</option>
              <option value="checks">Check count</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Chart type</label>
            <select
              value={(w.config.chartType as string) ?? "line"}
              onChange={(e) => update("chartType", e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="line">Line</option>
              <option value="bar">Bar</option>
              <option value="area">Area</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Time range</label>
            <select
              value={(w.config.timeRange as number) ?? 24}
              onChange={(e) => update("timeRange", Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value={6}>Last 6 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={168}>Last 7 days</option>
              <option value={720}>Last 30 days</option>
            </select>
          </div>
        </>
      )}

      {/* ── Announcement Bar ────────────────────────────────────────────── */}
      {w.type === "announcement-bar" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Message</label>
            <textarea
              value={(w.config.message as string) ?? ""}
              onChange={(e) => update("message", e.target.value || undefined)}
              placeholder="Important announcement text…"
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Type</label>
            <select
              value={(w.config.type as string) ?? "info"}
              onChange={(e) => update("type", e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="info">Info (blue)</option>
              <option value="warning">Warning (amber)</option>
              <option value="danger">Danger (red)</option>
              <option value="success">Success (green)</option>
            </select>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-3 py-2">
            <div>
              <p className="text-xs font-medium text-text-primary">Dismissable</p>
              <p className="text-[10px] text-text-muted">Show × button for visitors to close</p>
            </div>
            <button
              onClick={() => update("dismissable", !w.config.dismissable)}
              className={`relative h-5 w-9 rounded-full transition-colors ${w.config.dismissable ? "bg-accent" : "bg-surface-elevated border border-border"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${w.config.dismissable ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Expiry (optional)</label>
            <input
              type="datetime-local"
              value={(w.config.expiresAt as string) ?? ""}
              onChange={(e) => update("expiresAt", e.target.value || undefined)}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-text-muted">Hide banner automatically after this date/time</p>
          </div>
        </>
      )}

      {/* ── Image / Banner ────────────────────────────────────────────────── */}
      {w.type === "image-banner" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Image URL</label>
            <input
              type="url"
              value={(w.config.imageUrl as string) ?? ""}
              onChange={(e) => update("imageUrl", e.target.value || undefined)}
              placeholder="https://example.com/banner.png"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Alt text</label>
            <input
              type="text"
              value={(w.config.altText as string) ?? ""}
              onChange={(e) => update("altText", e.target.value || undefined)}
              placeholder="Descriptive alt text for accessibility"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Link URL (optional)</label>
            <input
              type="url"
              value={(w.config.linkUrl as string) ?? ""}
              onChange={(e) => update("linkUrl", e.target.value || undefined)}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Max height (px)</label>
            <input
              type="number"
              min={40}
              max={800}
              value={(w.config.maxHeight as number) ?? 200}
              onChange={(e) => update("maxHeight", Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Caption (optional)</label>
            <input
              type="text"
              value={(w.config.caption as string) ?? ""}
              onChange={(e) => update("caption", e.target.value || undefined)}
              placeholder="Optional caption text"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
        </>
      )}

      {/* ── Code Block ───────────────────────────────────────────────────── */}
      {w.type === "code-block" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Code</label>
            <textarea
              value={(w.config.code as string) ?? ""}
              onChange={(e) => update("code", e.target.value || undefined)}
              placeholder="curl https://api.example.com/health"
              rows={5}
              className="w-full resize-y rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Language label</label>
            <input
              type="text"
              value={(w.config.language as string) ?? ""}
              onChange={(e) => update("language", e.target.value || undefined)}
              placeholder="bash, curl, json, yaml…"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-3 py-2">
            <p className="text-xs font-medium text-text-primary">Show copy button</p>
            <button
              onClick={() => update("showCopy", w.config.showCopy !== false ? false : true)}
              className={`relative h-5 w-9 rounded-full transition-colors ${w.config.showCopy !== false ? "bg-accent" : "bg-surface-elevated border border-border"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${w.config.showCopy !== false ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>
        </>
      )}

      {/* ── Video Embed ──────────────────────────────────────────────────── */}
      {w.type === "video-embed" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Video URL</label>
            <input
              type="url"
              value={(w.config.videoUrl as string) ?? ""}
              onChange={(e) => update("videoUrl", e.target.value || undefined)}
              placeholder="https://www.youtube.com/watch?v=… or https://vimeo.com/…"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-text-muted">YouTube and Vimeo URLs are auto-converted to embeds</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Caption (optional)</label>
            <input
              type="text"
              value={(w.config.caption as string) ?? ""}
              onChange={(e) => update("caption", e.target.value || undefined)}
              placeholder="Video caption or description"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
        </>
      )}

      {/* ── Embed iFrame ─────────────────────────────────────────────────── */}
      {w.type === "embed-iframe" && (
        <>
          <div>
            <label className={`mb-1 block text-xs font-medium ${isMissingEmbedUrl ? "text-danger" : "text-text-secondary"}`}>
              URL <span className="text-danger">*</span>
            </label>
            <input
              type="url"
              value={(w.config.url as string) ?? ""}
              onChange={(e) => update("url", e.target.value || undefined)}
              placeholder="https://grafana.example.com/d/…?kiosk=1"
              className={`w-full rounded-lg border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none ${isMissingEmbedUrl ? "border-danger/60 focus:border-danger" : "border-border focus:border-accent"}`}
              aria-invalid={isMissingEmbedUrl}
            />
            {isMissingEmbedUrl && <p className="mt-1 text-[10px] text-danger">Required: add an embeddable URL.</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Title (accessibility)</label>
            <input
              type="text"
              value={(w.config.title as string) ?? ""}
              onChange={(e) => update("title", e.target.value || undefined)}
              placeholder="Grafana dashboard"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Height (px)</label>
            <input
              type="number"
              min={100}
              max={2000}
              value={(w.config.height as number) ?? 400}
              onChange={(e) => update("height", Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </div>
          <p className="text-[10px] text-text-muted">⚠️ The embedded URL must allow iframe embedding (no X-Frame-Options: DENY)</p>
        </>
      )}

      {/* ── Countdown ────────────────────────────────────────────────────── */}
      {w.type === "countdown" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Target date & time</label>
            <input
              type="datetime-local"
              value={(w.config.targetDate as string) ?? ""}
              onChange={(e) => update("targetDate", e.target.value || undefined)}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Event label</label>
            <input
              type="text"
              value={(w.config.eventLabel as string) ?? ""}
              onChange={(e) => update("eventLabel", e.target.value || undefined)}
              placeholder="e.g. Maintenance ends, Feature launch…"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-3 py-2">
            <div>
              <p className="text-xs font-medium text-text-primary">Hide after expiry</p>
              <p className="text-[10px] text-text-muted">Remove widget when countdown reaches 0</p>
            </div>
            <button
              onClick={() => update("hideAfterExpiry", !w.config.hideAfterExpiry)}
              className={`relative h-5 w-9 rounded-full transition-colors ${w.config.hideAfterExpiry ? "bg-accent" : "bg-surface-elevated border border-border"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${w.config.hideAfterExpiry ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>
          <p className="text-[10px] text-text-muted">Countdown runs in visitor's local timezone</p>
        </>
      )}

      {/* ── FAQ / Accordion ──────────────────────────────────────────────── */}
      {w.type === "faq-accordion" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Questions & Answers</label>
          <div className="space-y-2">
            {((w.config.items as Array<{ question: string; answer: string }>) ?? []).map((item, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-bg/60 p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-text-muted w-3">{idx + 1}</span>
                  <input
                    type="text"
                    value={item.question}
                    onChange={(e) => {
                      const items = [...((w.config.items as Array<{ question: string; answer: string }>) ?? [])];
                      items[idx] = { ...items[idx], question: e.target.value };
                      update("items", items);
                    }}
                    placeholder="Question"
                    className="flex-1 rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      const items = ((w.config.items as Array<{ question: string; answer: string }>) ?? []).filter((_, i) => i !== idx);
                      update("items", items);
                    }}
                    className="text-red-400/60 hover:text-red-400 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <textarea
                  value={item.answer}
                  onChange={(e) => {
                    const items = [...((w.config.items as Array<{ question: string; answer: string }>) ?? [])];
                    items[idx] = { ...items[idx], answer: e.target.value };
                    update("items", items);
                  }}
                  placeholder="Answer"
                  rows={2}
                  className="w-full resize-none rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const items = [...((w.config.items as Array<{ question: string; answer: string }>) ?? []), { question: "", answer: "" }];
              update("items", items);
            }}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-xs text-text-muted hover:border-accent hover:text-accent transition"
          >
            + Add Question
          </button>
        </div>
      )}

      {/* ── Link List ────────────────────────────────────────────────────── */}
      {w.type === "link-list" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Links</label>
          <div className="space-y-1.5">
            {((w.config.links as Array<{ label: string; url: string; icon?: string }>) ?? []).map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={item.label}
                  onChange={(e) => {
                    const links = [...((w.config.links as Array<{ label: string; url: string; icon?: string }>) ?? [])];
                    links[idx] = { ...links[idx], label: e.target.value };
                    update("links", links);
                  }}
                  placeholder="Label"
                  className="w-24 rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <input
                  type="url"
                  value={item.url}
                  onChange={(e) => {
                    const links = [...((w.config.links as Array<{ label: string; url: string; icon?: string }>) ?? [])];
                    links[idx] = { ...links[idx], url: e.target.value };
                    update("links", links);
                  }}
                  placeholder="https://…"
                  className="flex-1 rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <button
                  onClick={() => {
                    const links = ((w.config.links as Array<{ label: string; url: string }>) ?? []).filter((_, i) => i !== idx);
                    update("links", links);
                  }}
                  className="text-red-400/60 hover:text-red-400 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const links = [...((w.config.links as Array<{ label: string; url: string }>) ?? []), { label: "", url: "" }];
              update("links", links);
            }}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-xs text-text-muted hover:border-accent hover:text-accent transition"
          >
            + Add Link
          </button>
        </div>
      )}

      {/* ── Social Links ─────────────────────────────────────────────────── */}
      {w.type === "social-links" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Social profiles</label>
          <div className="space-y-1.5">
            {((w.config.socials as Array<{ icon: string; url: string; label?: string }>) ?? []).map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <select
                  value={item.icon}
                  onChange={(e) => {
                    const socials = [...((w.config.socials as Array<{ icon: string; url: string }>) ?? [])];
                    socials[idx] = { ...socials[idx], icon: e.target.value };
                    update("socials", socials);
                  }}
                  className="w-28 rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                >
                  <option value="github">GitHub</option>
                  <option value="twitter">Twitter/X</option>
                  <option value="discord">Discord</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="youtube">YouTube</option>
                  <option value="mastodon">Mastodon</option>
                  <option value="bluesky">Bluesky</option>
                  <option value="reddit">Reddit</option>
                  <option value="slack">Slack</option>
                  <option value="email">Email</option>
                  <option value="website">Website</option>
                </select>
                <input
                  type="url"
                  value={item.url}
                  onChange={(e) => {
                    const socials = [...((w.config.socials as Array<{ icon: string; url: string }>) ?? [])];
                    socials[idx] = { ...socials[idx], url: e.target.value };
                    update("socials", socials);
                  }}
                  placeholder="https://…"
                  className="flex-1 rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <button
                  onClick={() => {
                    const socials = ((w.config.socials as Array<{ icon: string; url: string }>) ?? []).filter((_, i) => i !== idx);
                    update("socials", socials);
                  }}
                  className="text-red-400/60 hover:text-red-400 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const socials = [...((w.config.socials as Array<{ icon: string; url: string }>) ?? []), { icon: "github", url: "" }];
              update("socials", socials);
            }}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-xs text-text-muted hover:border-accent hover:text-accent transition"
          >
            + Add Profile
          </button>
        </div>
      )}

      {/* ── SLA Summary ──────────────────────────────────────────────────── */}
      {w.type === "sla-summary" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">SLA target (%)</label>
          <select
            value={(w.config.slaTarget as number) ?? 99.9}
            onChange={(e) => update("slaTarget", Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value={99}>99% (3.65 days/year)</option>
            <option value={99.5}>99.5% (1.83 days/year)</option>
            <option value={99.9}>99.9% (8.76 hours/year)</option>
            <option value={99.95}>99.95% (4.38 hours/year)</option>
            <option value={99.99}>99.99% (52.6 min/year)</option>
          </select>
        </div>
      )}

      {/* ── Response Time Chart ───────────────────────────────────────────── */}
      {w.type === "response-time-chart" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Data points</label>
            <select
              value={(w.config.points as number) ?? 60}
              onChange={(e) => update("points", Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value={30}>30 data points</option>
              <option value={60}>60 data points</option>
              <option value={120}>120 data points</option>
              <option value={240}>240 data points</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Time window</label>
            <select
              value={(w.config.periodHours as number) ?? 24}
              onChange={(e) => update("periodHours", Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value={1}>Last 1 hour</option>
              <option value={6}>Last 6 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={72}>Last 3 days</option>
              <option value={168}>Last 7 days</option>
            </select>
          </div>
        </>
      )}

      {/* ── Uptime Heatmap ───────────────────────────────────────────────── */}
      {w.type === "uptime-heatmap" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Days to show</label>
          <select
            value={(w.config.days as number) ?? 7}
            onChange={(e) => update("days", Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
      )}

      {/* ── Response Time Heatmap ─────────────────────────────────────────── */}
      {w.type === "response-time-heatmap" && (
        <div>
          <p className="text-[10px] text-text-muted">Shows hour-of-day × day-of-week latency heatmap (GitHub contributions style). Darker = slower. Select a monitor above to populate the heatmap with real check data.</p>
        </div>
      )}

      {/* ── Version Check Badge / Update Status Badge ─────────────────────── */}
      {["version-check-badge", "update-summary"].includes(w.type) && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-3 py-2">
          <div>
            <p className="text-xs font-medium text-text-primary">Show changelog link</p>
            <p className="text-[10px] text-text-muted">Link to GitHub releases when update available</p>
          </div>
          <button
            onClick={() => update("showChangelog", !w.config.showChangelog)}
            className={`relative h-5 w-9 rounded-full transition-colors ${w.config.showChangelog ? "bg-accent" : "bg-surface-elevated border border-border"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${w.config.showChangelog ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
      )}

      {/* ── Aggregate Health Score ────────────────────────────────────────── */}
      {w.type === "aggregate-health-score" && (
        <div>
          <p className="text-[10px] text-text-muted">Computes a weighted 0–100 health score across all selected monitors. Use monitor scope controls above to choose which monitors contribute to the score.</p>
        </div>
      )}

      {/* ── Subscriber Form ───────────────────────────────────────────────── */}
      {w.type === "subscriber-form" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Button label</label>
            <input
              type="text"
              value={(w.config.buttonLabel as string) ?? ""}
              onChange={(e) => update("buttonLabel", e.target.value || undefined)}
              placeholder="Subscribe to updates"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Placeholder text</label>
            <input
              type="text"
              value={(w.config.placeholder as string) ?? ""}
              onChange={(e) => update("placeholder", e.target.value || undefined)}
              placeholder="Enter your email address"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
        </>
      )}

      <div className="rounded-lg border border-border/50 bg-bg/50 p-2.5 space-y-2">
        <p className="text-[10px] font-medium text-text-secondary">Size & placement</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-text-secondary">
            Width (cols)
            <input
              type="number"
              min={1}
              max={12}
              value={w.w}
              onChange={(e) => onResize({ w: Number(e.target.value), h: w.h })}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="text-[10px] text-text-secondary">
            Height (rows)
            <input
              type="number"
              min={1}
              max={10}
              value={w.h}
              onChange={(e) => onResize({ w: w.w, h: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
        </div>
        <p className="text-[10px] text-text-primary">Position: ({w.x}, {w.y})</p>
      </div>

      <div className="space-y-1.5 pt-2">
        <button
          onClick={() => onToggleLock(w.id)}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            w.locked
              ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
              : "border-border bg-bg text-text-secondary hover:text-text-primary"
          }`}
          title={w.locked ? "Unlock this widget to allow moving and resizing" : "Lock this widget to prevent accidental moves"}
        >
          {w.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          {w.locked ? "Unlock Widget" : "Lock Widget"}
        </button>

        {/* Layer order */}
        <div className="rounded-lg border border-border bg-bg overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
            <Layers className="h-3 w-3 text-text-secondary/60" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/60">Layer</span>
          </div>
          <div className="grid grid-cols-4">
            {([
              { action: "front" as const, icon: ChevronsUp, title: "Bring to front" },
              { action: "forward" as const, icon: ChevronUp, title: "Bring forward" },
              { action: "backward" as const, icon: ChevronDown, title: "Send backward" },
              { action: "back" as const, icon: ChevronsDown, title: "Send to back" },
            ]).map(({ action, icon: Icon, title }) => (
              <button
                key={action}
                onClick={() => onZOrder(w.id, action)}
                title={title}
                className="flex items-center justify-center py-1.5 text-text-secondary/60 transition hover:bg-accent/10 hover:text-accent"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => onDuplicate(w.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/10"
        >
          <Copy className="h-3.5 w-3.5" />
          Duplicate Widget
        </button>
        <button
          onClick={() => onDelete(w.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
        >
          <X className="h-3.5 w-3.5" />
          Delete Widget
        </button>
      </div>
    </div>
  );
}
