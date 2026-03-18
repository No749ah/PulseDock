import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { renderWidget, type Widget, type MonitorSummary } from "./widgets/index";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "http://localhost:4321";

interface PageLayout {
  widgets: Widget[];
}

interface IncidentData {
  id: string;
  title: string;
  status: string;
  severity: string;
  createdAt: string;
  resolvedAt: string | null;
  updates: { id: string; message: string; status: string; createdAt: string }[];
  monitors: { id: string; name: string }[];
}

interface MaintenanceData {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  monitors: { id: string; name: string }[];
}

interface CheckData {
  id: string;
  monitorId: string;
  monitorName: string;
  checkedAt: string;
  ok: boolean;
  level: string;
  latencyMs: number | null;
  message: string | null;
}

interface PublicPageData {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  layout: PageLayout;
  monitors: MonitorSummary[];
  incidents?: IncidentData[];
  maintenance?: MaintenanceData[];
  recentChecks?: CheckData[];
}

interface GridPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function getScopedMonitors(widget: Widget, monitors: MonitorSummary[]): MonitorSummary[] {
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

function passesVisibilityRule(widget: Widget, scopedMonitors: MonitorSummary[]): boolean {
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

function shouldRenderWidget(widget: Widget, monitors: MonitorSummary[]): boolean {
  const scopedMonitors = getScopedMonitors(widget, monitors);
  if (Boolean(widget.config.hideWhenNoData) && scopedMonitors.length === 0) return false;
  return passesVisibilityRule(widget, scopedMonitors);
}

function canPlace(occupied: Set<string>, x: number, y: number, w: number, h: number): boolean {
  for (let ry = y; ry < y + h; ry++) {
    for (let cx = x; cx < x + w; cx++) {
      if (occupied.has(`${ry}:${cx}`)) return false;
    }
  }
  return true;
}

function markPlaced(occupied: Set<string>, x: number, y: number, w: number, h: number): void {
  for (let ry = y; ry < y + h; ry++) {
    for (let cx = x; cx < x + w; cx++) {
      occupied.add(`${ry}:${cx}`);
    }
  }
}

function buildResponsivePlacement(widgets: Widget[], cols: number): Map<string, GridPlacement> {
  const map = new Map<string, GridPlacement>();
  const occupied = new Set<string>();

  for (const widget of widgets) {
    const w = clamp(Math.round((widget.w / 12) * cols), 1, cols);
    const h = Math.max(1, widget.h);
    const preferredX = clamp(Math.round((widget.x / 12) * cols), 0, cols - w);
    const preferredY = Math.max(0, widget.y);

    let y = preferredY;
    let placed = false;

    while (!placed) {
      const xCandidates: number[] = [];
      for (let x = preferredX; x <= cols - w; x++) xCandidates.push(x);
      for (let x = 0; x < preferredX; x++) xCandidates.push(x);

      for (const x of xCandidates) {
        if (!canPlace(occupied, x, y, w, h)) continue;
        markPlaced(occupied, x, y, w, h);
        map.set(widget.id, { x, y, w, h });
        placed = true;
        break;
      }

      y += 1;
    }
  }

  return map;
}

// ── Metadata ─────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(`${API_BASE}/v1/public/status/${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return {};
    const data: PublicPageData = await res.json() as PublicPageData;
    return {
      title: `${data.title} — Status`,
      description: data.description ?? `Live service status for ${data.title}`,
      openGraph: {
        title: `${data.title} — Status`,
        description: data.description ?? `Live service status for ${data.title}`,
      },
    };
  } catch {
    return {};
  }
}

// ── Page ─────────────────────────────────────────────────────────────────

export default async function PublicStatusSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const res = await fetch(`${API_BASE}/v1/public/status/${slug}`, {
    cache: "no-store",
  });

  if (res.status === 404 || res.status === 401) notFound();
  if (!res.ok) throw new Error(`Failed to load status page: ${res.status}`);

  const data: PublicPageData = await res.json() as PublicPageData;

  const widgets = data.layout?.widgets ?? [];
  const sorted = [...widgets].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
  const visible = sorted.filter((w) => shouldRenderWidget(w, data.monitors));

  const widgetDataEntries = await Promise.all(
    visible.map(async (widget) => {
      try {
        const widgetRes = await fetch(`${API_BASE}/v1/public/status/${slug}/widget/${widget.id}`, {
          cache: "no-store",
        });
        if (!widgetRes.ok) return [widget.id, null] as const;
        const payload = await widgetRes.json() as Record<string, unknown>;
        return [widget.id, payload] as const;
      } catch {
        return [widget.id, null] as const;
      }
    })
  );
  const widgetDataById = Object.fromEntries(
    widgetDataEntries.filter((entry): entry is readonly [string, Record<string, unknown>] => entry[1] !== null)
  );

  const desktop = new Map<string, GridPlacement>(
    visible.map((w) => [w.id, { x: clamp(w.x, 0, 11), y: Math.max(0, w.y), w: clamp(w.w, 1, 12), h: Math.max(1, w.h) }])
  );
  const tablet = buildResponsivePlacement(visible, 6);

  const now = new Date();
  const lastUpdated = now.toISOString().slice(11, 19) + " UTC";

  return (
    <>
      {/* Auto-refresh every 60 seconds */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <meta httpEquiv="refresh" content="60" />

      <main className="min-h-screen bg-bg px-4 pb-16 pt-8">
        <div className="mx-auto max-w-6xl space-y-4">
          {/* Page header */}
          <div className="mb-8 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Status Page
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
              {data.title}
            </h1>
            {data.description && (
              <p className="mt-1 text-sm text-text-secondary">{data.description}</p>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-20 text-center">
              <p className="text-sm text-text-secondary">This status page has no widgets yet.</p>
            </div>
          ) : (
            <>
              {/* Mobile: single-column flow */}
              <div className="space-y-4 sm:hidden">
                {visible.map((widget) => (
                  <div key={`m-${widget.id}`}>
                    {renderWidget(widget, data.monitors, {
                      incidents: data.incidents ?? [],
                      maintenance: data.maintenance ?? [],
                      recentChecks: data.recentChecks ?? [],
                      widgetDataById,
                    })}
                  </div>
                ))}
              </div>

              {/* Tablet: 6-column responsive grid */}
              <div className="hidden grid-cols-6 auto-rows-[80px] gap-4 sm:grid lg:hidden">
                {visible.map((widget) => {
                  const t = tablet.get(widget.id);
                  if (!t) return null;
                  return (
                    <div
                      key={`t-${widget.id}`}
                      style={{
                        gridColumn: `${t.x + 1} / span ${t.w}`,
                        gridRow: `${t.y + 1} / span ${t.h}`,
                        minWidth: 0,
                      }}
                    >
                      {renderWidget(widget, data.monitors, {
                        incidents: data.incidents ?? [],
                        maintenance: data.maintenance ?? [],
                        recentChecks: data.recentChecks ?? [],
                        widgetDataById,
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Desktop: 12-column editor-parity grid */}
              <div className="hidden grid-cols-12 auto-rows-[80px] gap-4 lg:grid">
                {visible.map((widget) => {
                  const d = desktop.get(widget.id);
                  if (!d) return null;
                  return (
                    <div
                      key={`d-${widget.id}`}
                      style={{
                        gridColumn: `${d.x + 1} / span ${d.w}`,
                        gridRow: `${d.y + 1} / span ${d.h}`,
                        minWidth: 0,
                      }}
                    >
                      {renderWidget(widget, data.monitors, {
                        incidents: data.incidents ?? [],
                        maintenance: data.maintenance ?? [],
                        recentChecks: data.recentChecks ?? [],
                        widgetDataById,
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="pt-8 text-center text-xs text-text-secondary">
            <span>
              Last updated: {lastUpdated} ·{" "}
            </span>
            <span>
              Powered by <span className="font-semibold text-accent">PulseDock</span>
            </span>
          </div>
        </div>
      </main>
    </>
  );
}
