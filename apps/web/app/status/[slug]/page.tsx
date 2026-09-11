import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PasswordGate from "./PasswordGate";
import { renderWidget, type Widget, type MonitorSummary } from "./widgets/index";
import { PrintButton } from "./widgets/PrintButton";
import { ExportImageButton } from "./widgets/ExportImageButton";
import { ExportPDFButton } from "./widgets/ExportPDFButton";
import { OfflineBanner } from "./widgets/OfflineBanner";
import { LazyWidget } from "./widgets/LazyWidget";
import { LiveStatusRefresh } from "./widgets/LiveStatusRefresh";
import { RangePicker } from "./widgets/RangePicker";
import { Suspense } from "react";
import { brand } from "../../../lib/brand";

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
  customCss?: string | null;
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

const VALID_RANGES = new Set(["24h", "7d", "30d", "90d"]);

export default async function PublicStatusSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawRange = Array.isArray(resolvedSearchParams.range)
    ? resolvedSearchParams.range[0]
    : resolvedSearchParams.range;
  const range = rawRange && VALID_RANGES.has(rawRange) ? rawRange : "7d";

  const rawPassword = Array.isArray(resolvedSearchParams.password)
    ? resolvedSearchParams.password[0]
    : resolvedSearchParams.password;
  const password = rawPassword as string | undefined;

  const fetchUrl = password
    ? `${API_BASE}/v1/public/status/${slug}?password=${encodeURIComponent(password)}`
    : `${API_BASE}/v1/public/status/${slug}`;

  const res = await fetch(fetchUrl, { cache: "no-store" });

  // Password gate: page is protected
  if (res.status === 403) {
    const body = await res.json().catch(() => ({})) as { protected?: boolean; title?: string };
    if (body.protected) {
      return <PasswordGate slug={slug} title={body.title ?? 'Status Page'} />;
    }
  }

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
        const qs = new URLSearchParams();
        if (range !== "7d") qs.set("range", range);
        if (password) qs.set("password", password);
        const rangeParam = qs.toString() ? `?${qs.toString()}` : "";
        const widgetRes = await fetch(`${API_BASE}/v1/public/status/${slug}/widget/${widget.id}${rangeParam}`, {
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

  const desktop = buildResponsivePlacement(visible, 12);

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
      {/* Custom CSS injection — admins can add branding/style overrides via Page Settings */}
      {data.customCss && (
        // eslint-disable-next-line react/no-danger
        <style dangerouslySetInnerHTML={{ __html: data.customCss }} />
      )}
      <OfflineBanner />
      {/* Live refresh client component replaces meta http-equiv refresh */}
      <LiveStatusRefresh intervalSec={autoRefreshSec} slug={slug} />

      <main id="status-page-content" role="main" aria-label={`${data.title} status page`} className={`min-h-screen px-4 pb-10 pt-6 ${bgClass} ${themeClass}`} style={containerStyle}>
        {/* Skip to main content link for keyboard users */}
        <a href="#status-widgets" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-white focus:font-semibold">
          Skip to status widgets
        </a>
        <div className="mx-auto max-w-6xl space-y-3">
          {/* Page header */}
          <header className="mb-4 text-center relative">
            {/* Action buttons — top-right of header, hidden when printing */}
            <div className="absolute right-0 top-0 no-print flex items-center gap-2" role="toolbar" aria-label="Page actions">
              <Suspense fallback={null}>
                <RangePicker slug={slug} currentRange={range} />
              </Suspense>
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
              {/* Group widgets into rows based on desktop placement, then render
                  each row as a flex row.  This gives auto-height per row (no fixed
                  grid rows) while still supporting side-by-side widgets. */}
              {(() => {
                // Build rows: group widgets that share the same y band
                const rows: { y: number; widgets: { widget: Widget; placement: GridPlacement }[] }[] = [];
                for (const widget of visible) {
                  const d = desktop.get(widget.id);
                  if (!d) continue;
                  let row = rows.find((r) => r.y === d.y);
                  if (!row) {
                    row = { y: d.y, widgets: [] };
                    rows.push(row);
                  }
                  row.widgets.push({ widget, placement: d });
                }
                rows.sort((a, b) => a.y - b.y);

                let globalIdx = 0;
                return (
                  <div id="status-widgets" className="space-y-3" role="region" aria-labelledby="status-widgets-heading">
                    {rows.map((row) => {
                      const isSingleFull = row.widgets.length === 1 && row.widgets[0].placement.w === 12;
                      return (
                        <div
                          key={`row-${row.y}`}
                          className={isSingleFull ? "" : "grid grid-cols-12 gap-3"}
                        >
                          {row.widgets.map(({ widget, placement }) => {
                            const idx = globalIdx++;
                            const content = renderWidget(widget, data.monitors, {
                              incidents: data.incidents ?? [],
                              maintenance: data.maintenance ?? [],
                              recentChecks: data.recentChecks ?? [],
                              widgetDataById,
                            });
                            if (isSingleFull) {
                              return (
                                <div key={widget.id}>
                                  {idx < 4 ? content : (
                                    <LazyWidget placeholderHeight={120}>
                                      {content}
                                    </LazyWidget>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <div
                                key={widget.id}
                                style={{
                                  gridColumn: `${placement.x + 1} / span ${placement.w}`,
                                  minWidth: 0,
                                }}
                              >
                                {idx < 4 ? content : (
                                  <LazyWidget placeholderHeight={120}>
                                    {content}
                                  </LazyWidget>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          )}

          {/* Footer */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-3 text-center text-xs text-text-secondary print:hidden">
            <LiveStatusRefresh intervalSec={autoRefreshSec} slug={slug} />
            {showBranding && (
              <span>
                {" · "}Powered by <span className="font-semibold text-accent">{brand.name}</span>
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
