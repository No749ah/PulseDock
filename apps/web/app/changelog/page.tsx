"use client";

import { AppFrame } from "../../components/app-frame";
import { FadeIn } from "../components/FadeIn";
import { ExternalLink } from "lucide-react";

interface ChangeEntry {
  version: string;
  date: string;
  tags: string[];
  changes: string[];
}

const TAG_COLORS: Record<string, string> = {
  Security: "bg-danger/15 text-danger border-danger/20",
  Features: "bg-accent/15 text-accent border-accent/20",
  Performance: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "Bug Fixes": "bg-warning/15 text-warning border-warning/20",
  Testing: "bg-purple-500/15 text-purple-400 border-purple-500/20",
};

const releases: ChangeEntry[] = [
  {
    version: "1.0.2",
    date: "2026-03-19",
    tags: ["Testing", "Performance", "Features"],
    changes: [
      "Coverage improvements across all service layers",
      "Branch rotation cadence established — twice-daily merges to dev",
      "1349 tests passing with zero TypeScript errors",
      "Alert delivery log: getDeliveryHistory() returns last 50 deliveries with success/fail stats",
      "Reports service: scheduled uptime digest emails (daily/weekly) with styled HTML",
      "Notification center: bell dropdown with 60s auto-fetch, unread badge, mark-all-read",
      "Dashboard time range selector: 1h / 6h / 24h / 7d / 30d with localStorage persistence",
      "Monitors table: sortable columns, card view with uptime%, hover quick-actions",
      "Versions page: summary row, diff indicators, changelog links, sort dropdown",
      "Command palette: 7 new commands, shortcut kbd badges",
      "Copy/paste widgets across status pages via Ctrl+C / Ctrl+V",
      "Count-up animations on uptime metrics using RAF-based cubic ease-out",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-03-18",
    tags: ["Security", "Features", "Testing"],
    changes: [
      "Security hardening: Helmet, CORS, Content Security Policy, rate limiting",
      "Two-factor authentication (TOTP) with recovery codes and disable flow",
      "CSRF protection on all state-mutating endpoints",
      "Comprehensive audit log: every auth and admin action tracked, exportable as CSV/JSON",
      "Full test suite — 1349 unit + integration tests across API, CLI, and agent",
      "Session management: list active sessions, revoke individual or all-others",
      "API key scopes: READ / WRITE / ADMIN with usage tracking and expiry",
      "Notification preferences: per-event toggles, delivery frequency, quiet hours",
      "Maintenance windows: scheduled downtime with alert suppression",
      "Admin dashboard: user list, system metrics, audit log viewer",
      "Alert delivery history: per-channel activity log with retry tracking",
      "Status page widgets: 65+ widget types, copy/paste, count-up animations",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-03-15",
    tags: ["Features"],
    changes: [
      "Initial release of PulseDock — open-source version intelligence and uptime monitoring",
      "Uptime monitoring: HTTP, TCP, DNS, keyword, and custom check types",
      "Status pages: public-facing pages with real-time monitor status",
      "Version tracking: monitor software versions across services and tools",
      "Tool registry: 1400+ tracked tools with version metadata",
      "Alert channels: webhook, email, Slack, Discord, PagerDuty integrations",
      "Incidents: create, track, and resolve incidents linked to monitors",
      "Projects: organize monitors and status pages into logical groups",
      "Docker-first deployment with PostgreSQL and Redis",
      "Next.js 14 app router with dark-mode-first Tailwind CSS design",
      "NestJS API with Swagger documentation",
      "Prisma ORM with full migration history",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <AppFrame title="Changelog" subtitle="Release notes and version history" breadcrumbs={[{ label: "Changelog" }]}>
      <div className="max-w-3xl mx-auto space-y-2">
        {/* Header */}
        <FadeIn>
          <div className="mb-8">
            <p className="text-text-secondary text-sm">
              All notable changes to PulseDock are documented here.{" "}
              <a
                href="https://github.com/No749ah/PulseDock/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent/80 inline-flex items-center gap-1 transition-colors"
              >
                View all releases on GitHub
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </p>
          </div>
        </FadeIn>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" aria-hidden="true" />

          <div className="space-y-10">
            {releases.map((release, idx) => (
              <FadeIn key={release.version} delay={idx * 0.1}>
                <div className="relative flex gap-6">
                  {/* Timeline dot */}
                  <div className="relative z-10 flex-shrink-0 w-8 h-8 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-accent border-2 border-background shadow-[0_0_0_4px] shadow-accent/20" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-2">
                    {/* Version header */}
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-accent text-white">
                        v{release.version}
                      </span>
                      <time className="text-sm text-text-secondary">
                        {new Date(release.date + "T00:00:00Z").toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          timeZone: "UTC",
                        })}
                      </time>
                      <div className="flex flex-wrap gap-1.5">
                        {release.tags.map((tag) => (
                          <span
                            key={tag}
                            className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TAG_COLORS[tag] ?? "bg-surface-elevated text-text-secondary border-border"}`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Changes */}
                    <div className="bg-surface-elevated/50 border border-border rounded-xl p-5">
                      <ul className="space-y-2">
                        {release.changes.map((change, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm text-text-secondary">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent/60 shrink-0" />
                            {change}
                          </li>
                        ))}
                      </ul>

                      <div className="mt-4 pt-4 border-t border-border">
                        <a
                          href={`https://github.com/No749ah/PulseDock/releases/tag/v${release.version}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors font-medium"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View on GitHub
                        </a>
                      </div>
                    </div>
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
