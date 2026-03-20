/**
 * Status Page Preview
 *
 * Server-rendered full preview of a status page using the owner's authenticated
 * session. Renders the exact same layout and widget components as the public
 * status page — including real live data — so the editor can show a pixel-perfect
 * preview without requiring the page to be published.
 *
 * URL: /status-pages/[id]/preview
 * Opened in a new tab from the editor toolbar "Full Preview" button.
 */
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { renderWidget, type Widget, type MonitorSummary } from "../../../status/[slug]/widgets/index";
import { LazyWidget } from "../../../status/[slug]/widgets/LazyWidget";

const INTERNAL_API_BASE =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4321";

interface PageSettings {
  autoRefreshInterval?: number;
  showBranding?: boolean;
  logoUrl?: string;
  faviconUrl?: string;
  accentColor?: string;
  theme?: "dark" | "light" | "system";
  fontFamily?: "inter" | "roboto" | "system" | "mono";
  backgroundStyle?: "solid" | "gradient" | "grid-dots";
  backgroundColor?: string;
}

interface PageLayout {
  widgets: Widget[];
  settings?: PageSettings;
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

interface PreviewData {
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
  customCss?: string | null;
}

interface GridPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp(n: number, min: number, max: number) {
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
  for (let ry = y; ry < y + h; ry++)
    for (let cx = x; cx < x + w; cx++)
      if (occupied.has(`${ry}:${cx}`)) return false;
  return true;
}

function markPlaced(occupied: Set<string>, x: number, y: number, w: number, h: number): void {
  for (let ry = y; ry < y + h; ry++)
    for (let cx = x; cx < x + w; cx++)
      occupied.add(`${ry}:${cx}`);
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

export default async function StatusPagePreview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Forward the session cookie so the API can authenticate the user
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const res = await fetch(`${INTERNAL_API_BASE}/v1/status-pages/${id}/preview`, {
    cache: "no-store",
    headers: { cookie: cookieHeader },
  });

  if (res.status === 401) redirect("/login");
  if (res.status === 403) redirect("/status-pages");
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Preview fetch failed: ${res.status}`);

  const data: PreviewData = await res.json() as PreviewData;

  // Fetch per-widget data using the internal API with cookie auth
  const widgets = data.layout?.widgets ?? [];
  const settings = data.layout?.settings ?? {};
  const sorted = [...widgets].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
  const visible = sorted.filter((w) => shouldRenderWidget(w, data.monitors));

  // Use the authenticated preview widget endpoint (works for unpublished pages)
  const widgetDataEntries = await Promise.all(
    visible.map(async (widget) => {
      try {
        const wr = await fetch(
          `${INTERNAL_API_BASE}/v1/status-pages/${id}/preview/widget/${widget.id}`,
          { cache: "no-store", headers: { cookie: cookieHeader } },
        );
        if (!wr.ok) return [widget.id, null] as const;
        const payload = await wr.json() as Record<string, unknown>;
        return [widget.id, payload] as const;
      } catch {
        return [widget.id, null] as const;
      }
    })
  );
  const widgetDataById = Object.fromEntries(
    widgetDataEntries.filter((e): e is readonly [string, Record<string, unknown>] => e[1] !== null)
  );

  const desktop = new Map<string, GridPlacement>(
    visible.map((w) => [
      w.id,
      { x: clamp(w.x, 0, 11), y: Math.max(0, w.y), w: clamp(w.w, 1, 12), h: Math.max(1, w.h) },
    ])
  );
  const tablet = buildResponsivePlacement(visible, 6);

  const accentColor = settings.accentColor ?? null;
  const logoUrl = settings.logoUrl ?? null;
  const showBranding = settings.showBranding !== false;
  const theme = settings.theme ?? "dark";
  const fontFamily = settings.fontFamily ?? "inter";
  const backgroundStyle = settings.backgroundStyle ?? "solid";
  const backgroundColor = settings.backgroundColor ?? null;

  const fontFamilyMap: Record<string, string> = {
    inter: "'Inter', 'system-ui', sans-serif",
    roboto: "'Roboto', 'system-ui', sans-serif",
    system: "system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  };

  const containerStyle: React.CSSProperties = {
    ...(accentColor ? ({ "--color-accent": accentColor } as React.CSSProperties) : {}),
    fontFamily: fontFamilyMap[fontFamily] ?? fontFamilyMap.inter,
    ...(backgroundColor && backgroundStyle === "solid" ? { backgroundColor } : {}),
  };

  const bgClass =
    backgroundStyle === "gradient"
      ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
      : backgroundStyle === "grid-dots"
      ? "bg-bg [background-image:radial-gradient(circle,_rgba(99,102,241,0.15)_1px,_transparent_1px)] [background-size:24px_24px]"
      : theme === "light"
      ? "bg-white text-gray-900"
      : "bg-bg";

  const themeClass = theme === "light" ? "text-gray-900" : "";

  return (
    <>
      {/* Custom CSS injection */}
      {data.customCss && (
        // eslint-disable-next-line react/no-danger
        <style dangerouslySetInnerHTML={{ __html: data.customCss }} />
      )}

      {/* Preview banner — not shown on the real public page */}
      <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-xs font-medium text-yellow-400 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
          <span>Preview Mode — this page may not be published yet · Live data shown</span>
        </div>
        <a
          href={`/status-pages/${id}/edit`}
          className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-yellow-300 hover:bg-yellow-500/20 transition"
        >
          ← Back to Editor
        </a>
      </div>

      <main
        id="status-page-content"
        role="main"
        aria-label={`${data.title} status page preview`}
        className={`min-h-screen px-4 pb-16 pt-8 ${bgClass} ${themeClass}`}
        style={containerStyle}
      >
        <div className="mx-auto max-w-6xl space-y-4">
          {/* Page header */}
          <header className="mb-8 text-center">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`${data.title} logo`} className="mx-auto mb-4 h-12 w-auto object-contain" />
            )}
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent" aria-hidden="true">
              Status Page
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
              {data.title}
            </h1>
            {data.description && (
              <p className="mt-1 text-sm text-text-secondary">{data.description}</p>
            )}
            {!data.isPublished && (
              <p className="mt-2 text-xs text-yellow-400/70">⚠️ Not published — only you can see this preview</p>
            )}
          </header>

          {visible.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-20 text-center"
              role="status"
            >
              <p className="text-sm text-text-secondary">This status page has no widgets yet.</p>
              <p className="mt-2 text-xs text-text-muted">
                Add widgets in the editor and refresh this preview.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: single-column flow */}
              <div className="space-y-4 sm:hidden" role="region" aria-label="Status widgets">
                {visible.map((widget, idx) => {
                  const content = renderWidget(widget, data.monitors, {
                    incidents: data.incidents ?? [],
                    maintenance: data.maintenance ?? [],
                    recentChecks: data.recentChecks ?? [],
                    widgetDataById,
                  });
                  return (
                    <div key={`m-${widget.id}`}>
                      {idx < 3 ? content : (
                        <LazyWidget placeholderHeight={widget.h * 80}>{content}</LazyWidget>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Tablet: 6-column grid */}
              <div
                className="hidden grid-cols-6 auto-rows-[80px] gap-4 sm:grid lg:hidden"
                role="region"
                aria-label="Status widgets"
              >
                {visible.map((widget, idx) => {
                  const t = tablet.get(widget.id);
                  if (!t) return null;
                  const content = renderWidget(widget, data.monitors, {
                    incidents: data.incidents ?? [],
                    maintenance: data.maintenance ?? [],
                    recentChecks: data.recentChecks ?? [],
                    widgetDataById,
                  });
                  return (
                    <div
                      key={`t-${widget.id}`}
                      style={{
                        gridColumn: `${t.x + 1} / span ${t.w}`,
                        gridRow: `${t.y + 1} / span ${t.h}`,
                        minWidth: 0,
                      }}
                    >
                      {idx < 4 ? content : (
                        <LazyWidget placeholderHeight={t.h * 80}>{content}</LazyWidget>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop: 12-column editor-parity grid */}
              <div
                className="hidden grid-cols-12 auto-rows-[80px] gap-4 lg:grid"
                role="region"
                aria-label="Status widgets"
              >
                {visible.map((widget, idx) => {
                  const d = desktop.get(widget.id);
                  if (!d) return null;
                  const content = renderWidget(widget, data.monitors, {
                    incidents: data.incidents ?? [],
                    maintenance: data.maintenance ?? [],
                    recentChecks: data.recentChecks ?? [],
                    widgetDataById,
                  });
                  return (
                    <div
                      key={`d-${widget.id}`}
                      style={{
                        gridColumn: `${d.x + 1} / span ${d.w}`,
                        gridRow: `${d.y + 1} / span ${d.h}`,
                        minWidth: 0,
                      }}
                    >
                      {idx < 4 ? content : (
                        <LazyWidget placeholderHeight={d.h * 80}>{content}</LazyWidget>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="pt-8 flex items-center justify-center gap-3 text-center text-xs text-text-secondary">
            {showBranding && (
              <span>
                Powered by <span className="font-semibold text-accent">PulseDock</span>
              </span>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
