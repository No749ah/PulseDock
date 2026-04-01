"use client";

import { AppFrame } from "../../components/app-frame";
import { ExternalLink } from "lucide-react";

interface ChangeEntry {
  version: string;
  date: string;
  tags: string[];
  changes: string[];
}

const TAG_COLORS: Record<string, string> = {
  Security:    "bg-danger/15 text-danger border-danger/20",
  Features:    "bg-accent/15 text-accent border-accent/20",
  Performance: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "Bug Fixes": "bg-warning/15 text-warning border-warning/20",
  Testing:     "bg-purple-500/15 text-purple-400 border-purple-500/20",
  UX:          "bg-green-500/15 text-green-400 border-green-500/20",
  Docs:        "bg-text-secondary/10 text-text-secondary border-border",
};

const releases: ChangeEntry[] = [
  {
    version: "1.6.0",
    date: "2026-03-29",
    tags: ["Features", "Performance", "Testing"],
    changes: [
      "Prometheus metrics suite: HTTP request duration histogram, process memory gauges, check execution counters, event loop & CPU metrics",
      "X-Response-Time header on every API response; slow requests (>1s) logged with structured warnings",
      "Monitor Comparison View: side-by-side performance analysis for 2–4 monitors with Pearson correlation",
      "Monitor Failure Prediction: linear regression on 7-day trends, risk score 0–100, estimated hours to failure",
      "Incident Response Playbooks: step-completion tracking, auto-snapshot on incident creation, drag-step editor",
      "Monitor Dependencies & Impact Analysis: BFS downstream/upstream root-cause analysis",
      "Alert Escalation Policies: multi-step escalation with configurable delays per channel",
      "Monitor Service Groups: logical grouping with aggregate worst-of status",
      "Production Dockerfiles: multi-stage Alpine builds for API + Web, GHCR publishing via GitHub Actions",
      "Collapsible Sidebar Navigation: 51 nav items in 6 groups with persist-to-localStorage collapse state",
      "5350+ tests passing (4567 API + 757 web + 12 agent + 10 CLI); zero any types, zero TypeScript errors",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-03-28",
    tags: ["Features", "Testing"],
    changes: [
      "Alert Acknowledgement: suppress further notifications with optional note, auto-clears on recovery",
      "Monitor Muting: 30min/1h/4h/24h mute durations, amber badge, one-click unmute",
      "Alert Routing Rules: route alerts by monitor type, level, tags, folder, or individual monitor",
      "Latency Anomaly Detection: P95 baseline from last 7 days, configurable multiplier, auto-degrades to yellow",
      "Alert Storm Protection: suppress bursts > N alerts in 10 minutes, one storm notification per 30-minute window",
      "Business Hours Schedule: checks only run during configured UTC hours and weekdays",
      "Monitor Cloning: duplicate with all config, alert channels, and tags; starts disabled",
      "FTP / IMAP / POP3 monitor types with full UI support and templates",
      "CT Log Monitor: detects newly issued certs for a domain within configurable hours",
      "Monitor Health Score: composite 0–100 with grade A–F across uptime, latency trend, SLA, stability",
      "Global Status Timeline: Gantt-style view of all monitor states with folder/tag filter",
      "Import from Docker Compose: paste docker-compose.yml, get suggested HTTP/TCP monitors",
      "Alert Rules Simulator: replay 7 days of history through configurable rules, noise score output",
      "3905 API tests, 756 web, 10 CLI, 12 agent — 4683 total passing",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-03-25",
    tags: ["Features", "Bug Fixes", "Testing"],
    changes: [
      "Flap Detection: suppresses alert noise when monitor flips state ≥3× in last 5 runs, sends single FLAPPING notification",
      "Auto-Create/Resolve Incidents: monitors can automatically open and close incidents on status change",
      "SLA Error Budget Burn Rate Alerts: Google SRE-style multi-window burn rate alerting (critical/high/warning)",
      "Runbook URL field: included in alert notifications and monitor detail page for rapid responder access",
      "Send Test Report Now: trigger immediate uptime report email from account settings",
      "Fixed flap alert delivery logging and auto-incident autoCreated flag persistence",
      "3208 API tests passing (up from 2778); extensive web component tests added (+300)",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-03-24",
    tags: ["Features", "UX", "Testing"],
    changes: [
      "Status Page Index: /status listing all published pages with live aggregate status",
      "Widget Showcase: 99 widgets at /status/widget-showcase across all categories",
      "Loading Skeletons & Error Boundaries on all remaining pages",
      "Comprehensive Security Headers for web app (CSP, X-Frame-Options, HSTS)",
      "Major codebase decomposition: widget-data-resolver 2771→173 lines across 9 category resolvers; monitors page, versions page, status-page editor all split into focused modules",
      "Dependency updates: NestJS 11.1.17, Tailwind 4.2.2, vitest 4.1.1, TypeScript 5.7.3",
      "Removed on-call schedules (out of scope) and 400 bogus registry placeholder entries",
      "Tool registry now at 5009 verified unique tools across all categories",
      "Fixed CORS (CORS_ORIGINS env var), LayoutWidgets use client directive, redundant cache header",
      "2778 tests total (2637 API + 119 web + 10 CLI + 12 agent); 90%+ branch coverage",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-03-23",
    tags: ["Features", "Bug Fixes", "Testing"],
    changes: [
      "Demo Data Seeding: POST /v1/demo/seed creates 5 sample monitors, alert channel, and status page for new users",
      "Tool Registry Live Validation: test reachability + version extraction for any registry tool on demand",
      "Extractor Pipeline: isVersionLike(), heuristic pass scanning 14 common version field names, 42 extractor tests",
      "Widget Config Property Editors for 15 widget types; required field asterisks, inline validation, setup hints",
      "Registry Runtime Mock Verification CI gate and correctness gates for verified templates",
      "Verification metadata (verificationStatus, lastVerifiedAt, docsUrl) on all 646 verified entries",
      "Fixed security audit: pinned prisma to 6.12.0, eliminating GHSA-38f7-945m-qr2g — 0 vulnerabilities",
      "1973 tests total (1951 API + 10 CLI + 12 agent)",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-03-21",
    tags: ["Features", "UX", "Docs"],
    changes: [
      "Swagger API documentation audit: all 143 endpoints annotated with full @ApiResponse coverage",
      "Status page subscriber emails, SVG badge, PDF export, webhook on status change",
      "Admin user management overhaul: edit, disable/enable, force reset, remove MFA, delete",
      "Dashboard UX: customizable section order, time range selector (1h/6h/24h/7d/30d), live pulsing indicator",
      "Monitors UX: pagination, advanced filter panel, sortable columns, hover quick-actions, row expansion",
      "Command palette (Ctrl+K): fuzzy search across commands, navigation, and create actions",
      "Notification bell: in-app dropdown with version update counts and monitor names",
      "BROWSER monitor type: page check with CSS selector assertions, expected text, custom status codes",
      "Widget resolver coverage complete: all 82 status page widget types have dedicated API data endpoints",
      "Monitor Timeline Annotations: deploy/note/incident events as reference lines on response-time chart",
      "Tool registry variants system: 50 tools with platform/edition variant definitions",
      "Billing/Plan management, White-label support, Organization/Workspace multi-tenancy",
      "1736 API tests passing; zero TypeScript strict mode errors",
    ],
  },
  {
    version: "1.0.4",
    date: "2026-03-20",
    tags: ["Features", "UX", "Security"],
    changes: [
      "OAuth2 SSO: Login with GitHub and Google — OAuthAccount model, nullable passwordHash, callback token exchange, brand buttons on login page",
      "Per-widget fetchedAt timestamps: all 60+ status page widget data responses now include fetchedAt — shown as 'Updated Xm ago' in widget card meta",
      "Tool registry expanded to 2900+ entries: new categories (GIS & Mapping, Radio & SDR, Fleet & Asset Management, Digital Signage, VoIP & Telephony, Print & 3D extensions)",
      "Status page 'Full Preview' mode: editors can preview unpublished pages with real live widget data at /status-pages/:id/preview",
      "Pre-publish widget validation: warns about unconfigured widgets before publishing a status page",
      "Widget design overhaul: WidgetCard consistent header system, StatusDot, SeverityBadge, TrendArrow helpers across all major widgets",
      "Date range picker on public status pages: 24h/7d/30d/90d URL-synced pill buttons, range param forwarded to all time-based widgets",
      "Slack/Discord webhook notifications on status page status changes",
      "SMS alert channel via Twilio — accountSid/authToken/from/to config",
      "PagerDuty and OpsGenie alert channels with trigger/resolve dedup",
      "Grafana SimpleJSON datasource: /v1/grafana endpoints for metrics, annotations, search",
      "HTTP JSONPath assertions for monitor checks: bodyJsonPath + bodyJsonPathExpected config",
      "Endpoint fallback chains in version monitors: ordered candidate URLs for resilient version detection",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-03-19",
    tags: ["Features", "UX", "Bug Fixes"],
    changes: [
      "Admin user management overhaul: edit display name, force password reset link, remove MFA, disable/enable, delete user",
      "Status page widget saves fixed — 17 widget types were silently rejected by API validation whitelist",
      "Dashboard version stats fixed — 'Updates Available' now always shows correct count regardless of selected time range",
      "Version badges fixed — no more double-v prefix (v18.9.0 not vv18.9.0)",
      "Account page: removed FadeIn animations, full-width balanced two-column layout",
      "Status page editor: Page Settings modal now scrollable on small screens",
      "Canvas widget previews: all 50+ widget types show meaningful visual previews in editor",
      "Public status page widgets visual overhaul: UptimeBar with large percentage + status icon, better empty states, slimmer timeline bars, contribution-graph style",
      "Monitors table: pagination (10/25/50/100/all) with localStorage persistence",
      "Command palette: cleaner selection state (accent left border), Ctrl K label",
      "Print/PDF: enhanced @media print stylesheet for status pages — proper widget flow, colour-accurate cards",
      "Webhook on status change: status pages now send POST when overall status changes",
      "Status page SVG badge: GET /v1/public/status-badge/:slug.svg with style variants",
      "Docs: GETTING-STARTED.md, ARCHITECTURE.md, TOOL-REGISTRY.md fully rewritten",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-03-18",
    tags: ["Features", "Testing", "UX"],
    changes: [
      "Tool registry expanded to 2567+ tools across 20+ categories",
      "Status page builder: 65+ widget types including multi-environment status, region map, dependency map, offline banner",
      "Widget editor: copy/paste across pages (Ctrl+C/V), version history (10 saves), alignment guides, snap-to-grid",
      "Count-up animations on all uptime metrics (RAF-based, prefers-reduced-motion safe)",
      "WebSocket real-time on public status pages — Live indicator with polling fallback",
      "Monitor column visibility toggle, sortable columns, bulk actions",
      "Drag-and-drop editor: resize handles, canvas zoom (30-200%), responsive preview (Desktop/Tablet/Mobile)",
      "7 status page template gallery presets",
      "RSS feed for status page incidents, custom domain slug with availability checker",
      "Incident severity distribution, post-mortem cards, maintenance calendar widgets",
      "1428 API + 10 CLI + 12 agent tests passing, zero TypeScript errors",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-03-17",
    tags: ["Security", "Features", "Testing"],
    changes: [
      "Two-factor authentication (TOTP) with QR code setup, recovery codes, and admin override",
      "CSRF protection: double-submit cookie pattern on all mutating routes",
      "Account lockout after 5 consecutive failed logins (15-minute cooldown)",
      "Email verification on registration with token-based flow",
      "Password strength enforcement: minimum 12 chars, upper/lower/digit/special required",
      "Stricter rate limiting on auth endpoints (5 req/min per IP)",
      "Session management: list active sessions, revoke individual or all-others",
      "Audit log export (CSV/JSON), session anomaly detection (IP/user-agent tracking)",
      "Monitor confirmation debounce: configurable consecutive failures before alerting",
      "TCP, SSL certificate, and Heartbeat monitor types",
      "Maintenance windows with alert suppression during active windows",
      "Public status page builder with drag-and-drop, 20+ initial widget types",
      "PulseDock CLI tool and browser extension",
      "Docker Compose production setup, Kubernetes Helm chart",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-03-15",
    tags: ["Features"],
    changes: [
      "Initial release — open-source version intelligence and uptime monitoring",
      "HTTP, TCP, and version check monitor types",
      "Alert channels: Webhook, Email, Slack, Discord, Telegram",
      "Projects and folders for monitor organization",
      "Dark-first UI built with Next.js 15, Tailwind CSS, Framer Motion",
      "NestJS API with Swagger documentation at /api/docs",
      "Prisma ORM with full migration history, PostgreSQL + Redis",
      "Docker-first deployment with multi-stage Alpine builds",
      "GitHub Actions CI/CD pipeline",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <AppFrame title="Changelog" subtitle="Release notes and version history" breadcrumbs={[{ label: "Changelog" }]}>
      <div className="max-w-3xl space-y-2">
        {/* Header */}
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

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" aria-hidden="true" />

          <div className="space-y-10">
            {releases.map((release) => (
              <div key={release.version} className="relative flex gap-6">
                {/* Timeline dot */}
                <div className="relative z-10 flex-shrink-0 w-8 h-8 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-accent border-2 border-bg shadow-[0_0_0_4px] shadow-accent/20" />
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
            ))}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
