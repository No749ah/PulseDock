import type { Widget, Monitor } from "./types";
import { NO_MONITOR_NEEDED_TYPES, MULTI_MODE_PRIMARY_WIDGETS } from "./constants";

/** Returns true if a canvas widget is missing required monitor config and should show the "⚠️ Configure" badge. */
export function needsMonitorConfig(widget: Widget): boolean {
  if (NO_MONITOR_NEEDED_TYPES.has(widget.type)) return false;
  const { monitorId, monitorIds, monitorMode } = widget.config;
  if (monitorMode === 'all') return false;
  const hasMonitor = Boolean(monitorId);
  const hasMonitors = Array.isArray(monitorIds) && monitorIds.length > 0;
  return !hasMonitor && !hasMonitors;
}

export function hasMappedMonitorRecord(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some(
    (entry) => Array.isArray(entry) && entry.length > 0,
  );
}

export function getConfigWarnings(widget: Widget, monitorMode: string): string[] {
  const warnings: string[] = [];

  if (monitorMode === "single" && !NO_MONITOR_NEEDED_TYPES.has(widget.type) && !widget.config.monitorId) {
    warnings.push("Select a monitor (or switch monitor scope to Multiple/All).");
  }

  if (monitorMode === "multiple" && (!Array.isArray(widget.config.monitorIds) || widget.config.monitorIds.length === 0)) {
    warnings.push("Select at least one monitor in multi-monitor mode.");
  }

  if (widget.type === "custom-metric-chart" && !widget.config.monitorId) {
    warnings.push("Custom Metric Chart requires a monitor selection.");
  }

  if (widget.type === "security-advisory" && !String(widget.config.packageName ?? "").trim()) {
    warnings.push("Package name is required for Security Advisory.");
  }

  if (widget.type === "tab-container" && (!Array.isArray(widget.config.tabs) || widget.config.tabs.length === 0)) {
    warnings.push("Add at least one tab entry ({ title, content }).");
  }

  if (widget.type === "dependency-map" && (!Array.isArray(widget.config.edges) || widget.config.edges.length === 0)) {
    warnings.push("Add at least one dependency edge ({ source, target }).");
  }

  if (widget.type === "multi-environment-status" && !hasMappedMonitorRecord(widget.config.envMonitors)) {
    warnings.push("Define envMonitors with at least one monitor ID per environment.");
  }

  if (widget.type === "region-status-map" && !hasMappedMonitorRecord(widget.config.regionMonitors)) {
    warnings.push("Define regionMonitors with at least one monitor ID per region.");
  }

  if (widget.type === "third-party-dependencies" && (!Array.isArray(widget.config.services) || widget.config.services.length === 0)) {
    warnings.push("Add at least one external service ({ name, url }).");
  }

  if (widget.type === "embed-iframe" && !String(widget.config.url ?? "").trim()) {
    warnings.push("Embed URL is required for iFrame widgets.");
  }

  if ((widget.type === "version-comparison-table" || widget.type === "outdated-components-alert" || widget.type === "metric-comparison-row")
    && (!Array.isArray(widget.config.monitorIds) || widget.config.monitorIds.length === 0)) {
    warnings.push("Select at least one monitor for this comparison widget.");
  }

  if ((widget.type === "table-of-contents" || widget.type === "column-layout") && (!Array.isArray(widget.config.items) || widget.config.items.length === 0)) {
    warnings.push("Add at least one item entry in JSON configuration.");
  }

  return warnings;
}

export function getMultiModeHelperText(widgetType: string): string {
  if (MULTI_MODE_PRIMARY_WIDGETS.has(widgetType)) {
    return "This widget uses the first selected monitor as its primary series in multi-monitor mode.";
  }

  return "This widget will render data for all selected monitors.";
}

export function getWidgetConfigHints(widgetType: string): string[] {
  switch (widgetType) {
    case "embed-iframe":
      return [
        "Use a full HTTPS URL and a source that allows iFrame embedding.",
        "If the widget stays blank on public pages, check X-Frame-Options/CSP on the target site.",
      ];
    case "security-advisory":
      return [
        "Use the real package name from your ecosystem (for example: express, requests, serde).",
        "Set ecosystem when names overlap across package managers.",
      ];
    case "dependency-map":
      return [
        "Edges use monitor IDs, not names.",
        "Format: { source, target, label? }.",
      ];
    case "multi-environment-status":
    case "region-status-map":
      return [
        "Use monitor IDs in each group list.",
        "Groups with empty arrays render as no-data until monitors are added.",
      ];
    case "third-party-dependencies":
      return [
        "Each service runs a lightweight HEAD request.",
        "Use stable health/status endpoints for best results.",
      ];
    case "table-of-contents":
      return [
        "Anchors must match element IDs on your page.",
        "Use short, lowercase IDs like 'incidents' or 'uptime'.",
      ];
    case "tab-container":
      return [
        "Use a tabs array with { title, content } items.",
        "Keep content concise for mobile readability.",
      ];
    case "column-layout":
      return [
        "Use items as an array of { heading?, body }.",
        "For readability, keep body text short per column.",
      ];
    case "custom-metric-chart":
      return [
        "Select a monitor first, then tune metric + chart type.",
        "Use line/area for trends and bar for discrete comparisons.",
      ];
    default:
      return [];
  }
}

export function getDefaultMultiMonitorIds(widget: Widget, monitors: Monitor[]): string[] {
  const configured = Array.isArray(widget.config.monitorIds)
    ? widget.config.monitorIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (configured.length > 0) return configured;

  const singleId = typeof widget.config.monitorId === "string" ? widget.config.monitorId : undefined;
  const ordered = [singleId, ...monitors.map((m) => m.id)].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const unique = Array.from(new Set(ordered));
  const limit = MULTI_MODE_PRIMARY_WIDGETS.has(widget.type) ? 1 : 6;
  return unique.slice(0, limit);
}

/**
 * After placing/moving a widget, push any overlapping widgets downward
 * so they don't overlap. Iterates until stable (max 100 passes).
 */
export function resolveCollisions(allWidgets: Widget[]): Widget[] {
  let widgets = [...allWidgets];
  const MAX_PASSES = 100;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    // Sort by y then x so we process top-left first (the "fixed" anchor)
    const sorted = [...widgets].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        // Check if a and b overlap
        const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
        const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
        if (overlapX && overlapY) {
          // Push b down so it sits below a
          const newY = a.y + a.h;
          if (b.y !== newY) {
            const idx = widgets.findIndex(w => w.id === b.id);
            if (idx >= 0) {
              widgets = [...widgets];
              widgets[idx] = { ...widgets[idx], y: newY };
              sorted[j] = { ...sorted[j], y: newY };
              changed = true;
            }
          }
        }
      }
    }
    if (!changed) break;
  }
  return widgets;
}
