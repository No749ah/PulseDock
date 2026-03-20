import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { renderWidget, type Widget, type MonitorSummary } from "./widgets/index";
import { PrintButton } from "./widgets/PrintButton";
import { ExportImageButton } from "./widgets/ExportImageButton";
import { ExportPDFButton } from "./widgets/ExportPDFButton";
import { OfflineBanner } from "./widgets/OfflineBanner";
import { LazyWidget } from "./widgets/LazyWidget";
import { LiveStatusRefresh } from "./widgets/LiveStatusRefresh";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "http://localhost:4321";

interface PageSettings {
  autoRefreshInterval?: number; // seconds, 0 = off
  showBranding?: boolean;
  logoUrl?: string;
  faviconUrl?: string;
  accentColor?: string;
  theme?: "dark" | "light" | "system";
  fontFamily?: "inter" | "roboto" | "system" | "mono";
  backgroundStyle?: "solid" | "gradient" | "grid-dots";
  backgroundColor?: string;
  // SEO
  metaTitle?: string;
  metaDescription?: string;
  ogImageUrl?: string;
  robotsIndex?: boolean;
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
    const settings = (data.layout?.settings ?? {}) as PageSettings;
    const metaTitle = settings.metaTitle || `${data.title} — Status`;
    const metaDesc = settings.metaDescription || data.description || `Live service status for ${data.title}`;
    const ogImage = settings.ogImageUrl || undefined;
    const allowIndex = settings.robotsIndex !== false;
    return {
      title: metaTitle,
      description: metaDesc,
      robots: allowIndex ? { index: true, follow: true } : { index: false, follow: false },
      openGraph: {
        title: metaTitle,
        description: metaDesc,
        ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630 }] } : {}),
      },
      twitter: {
        card: ogImage ? "summary_large_image" : "summary",
        title: metaTitle,
        description: metaDesc,
        ...(ogImage ? { images: [ogImage] } : {}),
      },
      icons: settings.faviconUrl
        ? { icon: settings.faviconUrl, shortcut: settings.faviconUrl }
        : undefined,
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
  const settings = data.layout?.settings ?? {};
  const autoRefreshSec = typeof settings.autoRefreshInterval === 'number' && settings.autoRefreshInterval > 0
    ? settings.autoRefreshInterval
    : 60;
  const showBranding = settings.showBranding !== false; // default true
  const logoUrl = settings.logoUrl ?? null;
  const accentColor = settings.accentColor ?? null;

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
    ...(accentColor ? { '--color-accent': accentColor } as React.CSSProperties : {}),
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
      <OfflineBanner />
      {/* Live refresh client component replaces meta http-equiv refresh */}
      <LiveStatusRefresh intervalSec={autoRefreshSec} slug={slug} />

      <main id="status-page-content" role="main" aria-label={`${data.title} status page`} className={`min-h-screen px-4 pb-16 pt-8 ${bgClass} ${themeClass}`} style={containerStyle}>
        {/* Skip to main content link for keyboard users */}
        <a href="#status-widgets" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-white focus:font-semibold">
          Skip to status widgets
        </a>
        <div className="mx-auto max-w-6xl space-y-4">
          {/* Page header */}
          <header className="mb-8 text-center relative">
            {/* Action buttons — top-right of header, hidden when printing */}
            <div className="absolute right-0 top-0 no-print flex items-center gap-2" role="toolbar" aria-label="Page actions">
              <ExportImageButton slug={slug} />
              <ExportPDFButton slug={slug} />
              <PrintButton />
            </div>
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
          </header>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-20 text-center" role="status" aria-label="No widgets configured">
              <p className="text-sm text-text-secondary">This status page has no widgets yet.</p>
            </div>
          ) : (
            <>
              <h2 id="status-widgets-heading" className="sr-only">Status widgets</h2>
              {/* Mobile + Print: single-column flow
                  `status-page-mobile-flow` class enables print layout (print CSS shows this, hides grids) */}
              <div id="status-widgets" className="status-page-mobile-flow space-y-4 sm:hidden" role="region" aria-labelledby="status-widgets-heading">
                {visible.map((widget, idx) => {
                  const content = renderWidget(widget, data.monitors, {
                    incidents: data.incidents ?? [],
                    maintenance: data.maintenance ?? [],
                    recentChecks: data.recentChecks ?? [],
                    widgetDataById,
                  });
                  // First 3 widgets render immediately (above fold); rest are lazy
                  return (
                    <div key={`m-${widget.id}`}>
                      {idx < 3 ? content : (
                        <LazyWidget placeholderHeight={widget.h * 80}>
                          {content}
                        </LazyWidget>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Tablet: 6-column responsive grid */}
              <div className="status-page-tablet-grid hidden grid-cols-6 auto-rows-[80px] gap-4 sm:grid lg:hidden" role="region" aria-labelledby="status-widgets-heading">
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
                        <LazyWidget placeholderHeight={t.h * 80}>
                          {content}
                        </LazyWidget>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop: 12-column editor-parity grid */}
              <div className="status-page-desktop-grid hidden grid-cols-12 auto-rows-[80px] gap-4 lg:grid" role="region" aria-labelledby="status-widgets-heading">
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
                        <LazyWidget placeholderHeight={d.h * 80}>
                          {content}
                        </LazyWidget>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-center text-xs text-text-secondary print:hidden">
            <LiveStatusRefresh intervalSec={autoRefreshSec} slug={slug} />
            {showBranding && (
              <span>
                {" · "}Powered by <span className="font-semibold text-accent">PulseDock</span>
              </span>
            )}
            <span className="hidden sm:inline text-text-muted">·</span>
            <PrintButton />
          </div>
        </div>
      </main>


    </>
  );
}
