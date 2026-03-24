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

export default async function StatusIndexPage() {
  const pages = await getPublicStatusPages();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-gray-400">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Status Pages
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            System Status
          </h1>
          <p className="mt-3 text-gray-400">
            Real-time status for all monitored services
          </p>
        </div>

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
            {pages.map((page) => (
              <Link
                key={page.slug}
                href={`/status/${page.slug}`}
                className="group block rounded-2xl border border-white/10 bg-white/5 p-6 transition-all hover:border-indigo-500/40 hover:bg-white/[0.07] hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors truncate">
                      {page.title}
                    </h2>
                    {page.description && (
                      <p className="mt-1 text-sm text-gray-400 line-clamp-2">
                        {page.description}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-gray-500">
                      Updated {new Date(page.updatedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
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
            ))}
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
