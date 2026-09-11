import type { Widget, MonitorSummary } from "./shared";

/** Filter the full monitor list down to those in scope for this widget. */
export function getScopedMonitors(widget: Widget, monitors: MonitorSummary[]): MonitorSummary[] {
  const ids = widget.config.monitorIds as string[] | undefined;
  const singleId = widget.config.monitorId as string | undefined;
  const tag = widget.config.tag as string | undefined;
  const folderId = widget.config.folderId as string | undefined;
  const monitorType = widget.config.monitorType as string | undefined;

  let scoped = monitors;
  if (ids?.length) scoped = scoped.filter((m) => ids.includes(m.id));
  else if (singleId) scoped = scoped.filter((m) => m.id === singleId);
  if (tag) scoped = scoped.filter((m) => m.tags?.includes(tag));
  if (folderId) scoped = scoped.filter((m) => m.folderId === folderId);
  if (monitorType) scoped = scoped.filter((m) => m.type === monitorType);
  return scoped;
}

/** Determine whether a widget should be shown based on its visibility rule + current monitor states. */
export function passesVisibilityRule(widget: Widget, scopedMonitors: MonitorSummary[]): boolean {
  const rule = (widget.config.visibility as string | undefined) ?? "always";
  if (rule === "always") return true;
  if (scopedMonitors.length === 0) return false;

  const hasRed = scopedMonitors.some((m) => m.level === "red");
  const hasYellow = scopedMonitors.some((m) => m.level === "yellow");

  if (rule === "outage") return hasRed;
  if (rule === "degraded") return !hasRed && hasYellow;
  if (rule === "operational") return !hasRed && !hasYellow;
  return true;
}

/** Returns the href to the monitor detail page for the first scoped monitor, or null if none. */
export function monitorDetailHref(widget: Widget, scopedMonitors: MonitorSummary[]): string | null {
  const singleId = widget.config.monitorId as string | undefined;
  const firstId = singleId ?? (widget.config.monitorIds as string[] | undefined)?.[0] ?? scopedMonitors[0]?.id;
  return firstId ? `/monitors/${firstId}` : null;
}
