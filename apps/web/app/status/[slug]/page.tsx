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

interface PublicPageData {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  layout: PageLayout;
  monitors: MonitorSummary[];
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

  // Sort widgets by y then x for natural reading order
  const sorted = [...widgets].sort((a, b) =>
    a.y !== b.y ? a.y - b.y : a.x - b.x
  );

  const now = new Date();

  return (
    <>
      {/* Auto-refresh every 60 seconds */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <meta httpEquiv="refresh" content="60" />

      <main className="min-h-screen bg-bg px-4 pb-16 pt-8">
        <div className="mx-auto max-w-5xl space-y-4">
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

          {/* Render widgets in y-sorted order */}
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-20 text-center">
              <p className="text-sm text-text-secondary">This status page has no widgets yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sorted.map((widget) => (
                <div key={widget.id}>
                  {renderWidget(widget, data.monitors)}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="pt-8 text-center text-xs text-text-secondary">
            <span>
              Last updated: {now.toLocaleTimeString()} ·{" "}
            </span>
            <span>
              Powered by{" "}
              <span className="font-semibold text-accent">PulseDock</span>
            </span>
          </div>
        </div>
      </main>
    </>
  );
}
