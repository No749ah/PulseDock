"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ExternalLink, GitCommit, Package, Shield, Wrench, Zap, Star } from "lucide-react";
import { getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { Badge } from "../components/Badge";
import { FadeIn } from "../components/FadeIn";

interface ChangelogSection {
  type: "added" | "fixed" | "changed" | "removed" | "security" | "tests" | "summary";
  items: string[];
}

interface ChangelogRelease {
  version: string;
  date: string;
  isUnreleased: boolean;
  sections: ChangelogSection[];
  summary?: string;
}

const RELEASES: ChangelogRelease[] = [
  {
    version: "Unreleased",
    date: "",
    isUnreleased: true,
    sections: [
      {
        type: "added",
        items: [
          "Tool registry expanded 1303 → 1385 tools (+82) — New categories: AI/ML platforms, ERP/Business software, Search/Vector databases, IoT/Edge devices, Photo/Document services",
          "Dashboard auto-refresh controls — Live/Paused toggle, interval picker (10s/30s/1m/5m), manual refresh button, last-updated indicator",
          "Versions table sortable columns — Click Name, Status, or Last Check headers to sort ascending/descending",
          "Debounced tool search (200ms) in version check tool picker — smoother filtering on large registry",
          "Landing page — Social Proof section with GitHub CTA, community-driven and self-hosted messaging",
          "Branded 404 page with PulseDock logo and Dashboard/Home CTAs",
          "Breadcrumbs navigation component wired into monitor detail page",
          "Page-level status page settings — logo URL, accent color, auto-refresh interval, branding toggle",
          "Monitor CSV export alongside JSON export",
          "Monitors advanced filters panel with type filter and saved filter presets (localStorage)",
          "Status page widget error boundaries for graceful widget failure handling",
          "Notifications read/unread state with localStorage persistence",
        ],
      },
      {
        type: "fixed",
        items: [
          "44 broken Simple Icons slugs corrected to match Simple Icons v13 naming conventions",
          "Status pages service spec — added incident.findFirst mock, fixed TS18046 type assertions",
        ],
      },
      {
        type: "changed",
        items: [
          "Accessibility improvements — blob animations use motion-safe, aria-label on all major landing sections",
        ],
      },
    ],
  },
  {
    version: "1.0.2",
    date: "2026-03-17",
    isUnreleased: false,
    sections: [
      {
        type: "added",
        items: [
          "Status page — monitor groups and multi-status badges with live tag/folder data",
          "Status page — version widgets (update-status-badge, version-comparison-table) with real data",
          "Status page — live widget previews in editor with 2s auto-save debounce",
          "Monitors page — collapsible group sidebar with aggregate status badges and tag/folder filtering",
          "Status page — Enter key submits all modals",
        ],
      },
      {
        type: "fixed",
        items: [
          "Next.js build config warning — removed unsupported allowedHosts key",
          "Trust proxy for secure cookies behind nginx/Cloudflare",
          "GitLab version check — uses gitlab-releases provider correctly",
          "Case-insensitive version key extraction (version/Version/VERSION)",
          "Badge embed snippets now include full domain URL",
          "Modal focus trap regression — no longer steals focus from text inputs",
          "socket.io proxy path corrected for nginx routing",
          "VersionDiff compact single-line format",
          "Tag color contrast for accessible display",
          "Monitor template version endpoints corrected for all 19 self-hosted app templates",
          "Status page mock coverage — fixed findPublic() unit tests",
        ],
      },
      {
        type: "tests",
        items: [
          "5 new status-pages service tests covering findPublic() return shape",
          "Coverage stable at 1327 API tests. Statement: 98.73%, branch: 95.29%, line: 100%",
        ],
      },
    ],
  },
  {
    version: "1.0.1",
    date: "2026-03-17",
    isUnreleased: false,
    sections: [
      {
        type: "fixed",
        items: [
          "Degraded status visibility — HTTP monitors with response-time violations and version monitors with pending updates now show as 'Degraded' across all surfaces (monitors list, dashboard, sparklines). Sparklines show amber bars at 65% height for degraded runs",
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-03-17",
    isUnreleased: false,
    summary: "First stable production release. All major features complete, tested, and documented. API surface stable, frontend accessible and responsive, Docker/Kubernetes deployment paths production-hardened.",
    sections: [
      {
        type: "added",
        items: [
          "Monitor detail — Run Now + Enable/Disable actions",
          "Monitor picker in Maintenance Windows and Incidents modals",
          "Per-page document titles for all 12 dashboard routes",
          "Monitor detail — HTTP/SSL/TCP config panel with full configuration display",
          "HTTP response time threshold alerting — yellow/degraded status when threshold exceeded",
          "HTTP custom method, headers, and request body support",
          "HTTP body keyword + expected status code assertions",
          "Folder/project filter and assignment on Monitors page",
          "Agent package unit tests (12 tests) wired into root test suite",
          "Landing page v1.0.0 badge",
        ],
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-03-16",
    isUnreleased: false,
    sections: [
      {
        type: "added",
        items: [
          "PulseDock Agent — @pulsedock/agent package + Docker image for local version reporting. 16 built-in shell checks (Proxmox, pfSense, Docker, PostgreSQL, nginx, etc.)",
          "Agent Setup UI — tab-switcher card in Versions page with Docker/Compose/Shell snippets and copy buttons",
          "Target field locking — read-only with 'from registry' badge when tool selected from registry",
          "Nginx WebSocket proxy documentation (docs/NGINX.md)",
          "Tool registry 382 → 1302 tools — 920 new entries covering all major self-hosted categories",
        ],
      },
      {
        type: "fixed",
        items: ["Daily Discord report cron — fixed recipient format to user:ID"],
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-03-16",
    isUnreleased: false,
    sections: [
      {
        type: "added",
        items: [
          "Monitor search + status filter — real-time search bar + status segmented control on Monitors page",
          "Incident management — full lifecycle (Investigating → Resolved), timeline updates, affected monitors, /incidents page",
          "SVG status badges — GET /v1/public/badge/:monitorId.svg with shields.io-style styles (flat/flat-square/for-the-badge)",
          "Tool registry 302 → 382 tools — email, infra, database, and self-hosted app additions",
        ],
      },
      {
        type: "fixed",
        items: ["Recovery alerts never sent — monitors recovering to green now correctly dispatch recovery alerts"],
      },
    ],
  },
  {
    version: "0.7.0",
    date: "2026-03-15",
    isUnreleased: false,
    sections: [
      {
        type: "added",
        items: [
          "Public Status Page Builder — drag-and-drop editor with 20+ widget types, CSS grid layout, publish flow, password protection",
          "Tool Registry — 164 → 302 pre-configured tools across all categories with searchable GET /v1/tool-registry API",
          "i18n — English + German translations on landing page and login, LocaleSwitcher component",
          "TCP, SSL Certificate, and Heartbeat monitor types",
          "Maintenance Windows — full CRUD, alert suppression during active windows",
          "Import from Uptime Robot / BetterUptime (JSON + CSV)",
          "Webhook, Slack, Discord, Telegram alert channels",
          "Browser extension — Chrome MV3 with one-click monitor creation",
          "CLI tool — pulsedock check <url> + monitors list/check + config commands",
          "WebSocket real-time updates on Dashboard and Monitors pages",
          "Plugin system for custom monitor types",
          "Docker Compose + Kubernetes manifests for production deployment",
        ],
      },
    ],
  },
];

const SECTION_CONFIG = {
  added: { label: "Added", icon: Zap, color: "text-success", bg: "bg-success/10" },
  fixed: { label: "Fixed", icon: Wrench, color: "text-warning", bg: "bg-warning/10" },
  changed: { label: "Changed", icon: GitCommit, color: "text-accent", bg: "bg-accent/10" },
  removed: { label: "Removed", icon: Package, color: "text-danger", bg: "bg-danger/10" },
  security: { label: "Security", icon: Shield, color: "text-purple-400", bg: "bg-purple-400/10" },
  tests: { label: "Tests", icon: BookOpen, color: "text-sky-400", bg: "bg-sky-400/10" },
  summary: { label: "Summary", icon: Star, color: "text-yellow-400", bg: "bg-yellow-400/10" },
} as const;

export default function ChangelogPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    if (!currentUser) router.push("/login");
  }, [router]);

  if (!user) return null;

  return (
    <AppFrame title="Changelog" subtitle="What's new in PulseDock">
      <div className="max-w-3xl space-y-2">
        {/* Header */}
        <FadeIn>
          <div className="flex items-center justify-between mb-8">
            <p className="text-text-secondary text-sm">
              Release history and feature updates for PulseDock.
            </p>
            <a
              href="https://github.com/No749ah/PulseDock/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              GitHub Releases
            </a>
          </div>
        </FadeIn>

        {/* Releases */}
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-8 bottom-0 w-px bg-border" />

          <div className="space-y-10">
            {RELEASES.map((release, releaseIdx) => (
              <FadeIn key={release.version} delay={releaseIdx * 0.05}>
                <div className="relative pl-12">
                  {/* Timeline dot */}
                  <div className={`absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                    release.isUnreleased
                      ? "border-accent bg-accent/20 text-accent"
                      : releaseIdx === 1
                      ? "border-success bg-success/20 text-success"
                      : "border-border bg-surface text-text-secondary"
                  }`}>
                    <Package className="w-3.5 h-3.5" />
                  </div>

                  {/* Release header */}
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-lg font-bold text-text-primary">
                      {release.isUnreleased ? "Unreleased" : `v${release.version}`}
                    </h2>
                    {release.isUnreleased ? (
                      <Badge variant="warning">In Progress</Badge>
                    ) : releaseIdx === 1 ? (
                      <Badge variant="success">Latest</Badge>
                    ) : null}
                    {release.date && (
                      <span className="text-text-secondary text-sm">{release.date}</span>
                    )}
                  </div>

                  {/* Summary */}
                  {release.summary && (
                    <p className="text-text-secondary text-sm mb-4 leading-relaxed italic">
                      {release.summary}
                    </p>
                  )}

                  {/* Sections */}
                  <div className="space-y-4">
                    {release.sections.map((section, sIdx) => {
                      const config = SECTION_CONFIG[section.type];
                      const Icon = config.icon;
                      return (
                        <div key={sIdx} className="rounded-xl border border-border bg-surface p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className={`p-1.5 rounded-lg ${config.bg}`}>
                              <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                            </div>
                            <span className={`text-sm font-semibold ${config.color}`}>
                              {config.label}
                            </span>
                            <span className="text-xs text-text-secondary opacity-50">
                              {section.items.length} {section.items.length === 1 ? "change" : "changes"}
                            </span>
                          </div>
                          <ul className="space-y-1.5">
                            {section.items.map((item, iIdx) => (
                              <li key={iIdx} className="flex items-start gap-2 text-sm text-text-secondary">
                                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${config.color.replace("text-", "bg-")}`} />
                                <span className="leading-relaxed">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
