import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "../../lib/brand";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "http://localhost:4321";

export const metadata: Metadata = {
  title: `Status Pages — ${brand.name}`,
  description: `Public status pages powered by ${brand.name}`,
};

interface StatusPageSummary {
  slug: string;
  title: string;
  description: string | null;
  status: "operational" | "degraded" | "outage" | "unknown";
  monitorsTotal: number;
  monitorsUp: number;
  createdAt: string;
  updatedAt: string;
}

async function getPublicStatusPages(): Promise<StatusPageSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/v1/public/status-pages`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

const STATUS_CONFIG = {
  operational: {
    label: "All Systems Operational",
    dotClass: "bg-emerald-500",
    badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    ringClass: "ring-emerald-500/20",
  },
  degraded: {
    label: "Partial Degradation",
    dotClass: "bg-amber-500",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    ringClass: "ring-amber-500/20",
  },
  outage: {
    label: "Major Outage",
    dotClass: "bg-red-500",
    badgeClass: "border-red-500/30 bg-red-500/10 text-red-400",
    ringClass: "ring-red-500/20",
  },
  unknown: {
    label: "No Monitors",
    dotClass: "bg-gray-500",
    badgeClass: "border-gray-500/30 bg-gray-500/10 text-gray-400",
    ringClass: "ring-gray-500/20",
  },
} as const;

// Compute overall status across all pages
function getOverallStatus(pages: StatusPageSummary[]): "operational" | "degraded" | "outage" | "unknown" {
  if (pages.length === 0) return "unknown";
  const statuses = pages.map((p) => p.status);
  if (statuses.includes("outage")) return "outage";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.every((s) => s === "operational")) return "operational";
  return "unknown";
}

export default async function StatusIndexPage() {
  const pages = await getPublicStatusPages();
  const overall = getOverallStatus(pages);
  const overallConfig = STATUS_CONFIG[overall];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-gray-400">
            <span className={`inline-block h-2 w-2 rounded-full ${overallConfig.dotClass} animate-pulse`} />
            Status Pages
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            System Status
          </h1>
          <p className="mt-3 text-gray-400">
            Real-time status for all monitored services
          </p>
        </div>

        {/* Overall Status Banner */}
        {pages.length > 0 && (
          <div className={`mb-8 flex items-center justify-center gap-3 rounded-2xl border ${overallConfig.badgeClass} px-6 py-4`}>
            <span className={`inline-block h-3 w-3 rounded-full ${overallConfig.dotClass} ${overall !== "unknown" ? "animate-pulse" : ""}`} />
            <span className="text-sm font-medium">{overallConfig.label}</span>
          </div>
        )}

        {/* Pages List */}
        {pages.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
              <svg className="h-7 w-7 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6m-7.5 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            </div>
            <p className="text-gray-400">No status pages published yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pages.map((page) => {
              const cfg = STATUS_CONFIG[page.status];
              return (
                <Link
                  key={page.slug}
                  href={`/status/${page.slug}`}
                  className="group block rounded-2xl border border-white/10 bg-white/5 p-6 transition-all hover:border-indigo-500/40 hover:bg-white/[0.07] hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors truncate">
                          {page.title}
                        </h2>
                        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.badgeClass}`}>
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
                          {cfg.label}
                        </span>
                      </div>
                      {page.description && (
                        <p className="mt-1.5 text-sm text-gray-400 line-clamp-2">
                          {page.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                        {page.monitorsTotal > 0 && (
                          <span>
                            {page.monitorsUp}/{page.monitorsTotal} monitors up
                          </span>
                        )}
                        <span>
                          Updated{" "}
                          {new Date(page.updatedAt).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                    <svg
                      className="mt-1 h-5 w-5 shrink-0 text-gray-600 transition-transform group-hover:translate-x-1 group-hover:text-indigo-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-xs text-gray-600">
          Powered by{" "}
          <a href="/" className="text-gray-500 hover:text-indigo-400 transition-colors">
            {brand.name}
          </a>
        </div>
      </div>
    </div>
  );
}
