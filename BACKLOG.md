## Status Summary (2026-04-01 21:35 UTC)
- **Build/Test:** ✅ Build clean; 4675 API + 760 web + 10 CLI + 12 agent tests passing; 0 vulnerabilities
- **Deployment:** ✅ Restarted API + web (`npm run restart`); `/health` 200, `/login` 200, `/api/v1/monitors` (proxy) 401 expected; all audited routes 200 locally + via `https://oc-dev-test.no749ah.com`
- **Branch:** heartbeat/2026-04-01-afternoon
- **Last changes (21:35 UTC):**
  - [x] **incidents/page.tsx refactor** — 1179→183 lines; useIncidents hook + IncidentRow, IncidentModals, IncidentToolbar, MonitorPicker extracted.
  - [x] **dashboard/page.tsx refactor** — 1184→176 lines; useDashboard hook + 8 extracted section components.
  - [x] **monitors/[id]/page.tsx refactor** — 5605→246 lines; 13 existing tab components wired + SimulateTab/PerformanceTab extracted.
  - [x] **monitors/page.tsx refactor** — 2947→249 lines; useMonitors hook + extracted page-level components.
  - [x] **alerts/page.tsx refactor** — 2003→173 lines; useAlerts hook + extracted page-level components.
  - [x] **MonitorFormModal.tsx refactor** — 2581→216 lines; split into type-specific form sections under `monitors/components/form/*`.
  - [x] **OverviewTab.tsx refactor** — extracted overview cards into `monitors/[id]/components/overview/*` for maintainability.
  - [x] **Changelog page** — Added missing v1.1.0–v1.6.0 entries (6 releases absent from web UI).
  - [x] **package.json license** — Fixed Apache-2.0 → MIT (matches LICENSE file and README badge).

## ⚠️ INSTRUCTION FROM NOAH (2026-03-17, updated)

**The project is NOT done. Not even close.**
**Work on this until EVERYTHING is perfect - every enterprise tool in the registry, every widget type implemented, every UI pixel polished.**
**Self-optimize: after every task, critically review your own work. Would a Fortune 500 pay for this? If not, improve.**
**Keep adding to this backlog when you discover gaps. Never stop improving.**
**Do not propose new projects. PulseDock is the focus until it's genuinely world-class.**

---

## Next Up (Priority Order)

### 🔴 P0 - Architecture & Code Quality

- [x] **Refactor monitors.service.ts (9613 lines → modular)** - ✅ Done (2026-03-30). Split into 6 sub-services:
  - `monitors-crud.service.ts` - CRUD, list, clone, bulk operations
  - `monitors-analytics.service.ts` - fleet report, trends, correlation, anomaly, failure prediction, heatmaps
  - `monitors-sla.service.ts` - SLA dashboard, compliance, forecast, error budget, burn rate
  - `monitors-diagnostics.service.ts` - health scores, coverage, check rate, schedule, interval optimizer
  - `monitors-export.service.ts` - export/import, config, OpenAPI import, Docker Compose import
  - `monitors-comparison.service.ts` - compare, latency distribution, period comparison
  - `monitors.service.ts` is now a thin facade. All 1044 monitor tests passing.

- [x] **Refactor monitors.controller.ts** - ✅ Already split into 10 sub-controllers (2510 lines total across alerts, analytics, comparison, details, diagnostics, export, runs, sla, state + main controller). Each handles its domain routes.

- [x] **Refactor alerts.service.ts** - ✅ Already split into sub-services:
  - `alerts-delivery.service.ts` (1079 lines) - channel dispatch, retry, batching
  - `alerts-routing.service.ts` (683 lines) - routing rules, escalation
  - `alerts.service.ts` (219 lines) - thin facade

- [x] **API integration tests with real database** - ✅ Done (2026-03-30). 57 integration tests across 5 files running against real PostgreSQL:
  - `auth.integration.spec.ts` (9 tests) - registration, login, lockout, token validation
  - `monitors-crud.integration.spec.ts` (12 tests) - full CRUD, types, auth isolation
  - `alerts-channels.integration.spec.ts` (12 tests) - channel CRUD, ownership isolation
  - `incidents.integration.spec.ts` (14 tests) - lifecycle, timeline, insights
  - `check-execution.integration.spec.ts` (6 tests) - check persistence, auto-incidents
  - Also fixed production bug: incidents controller used `req.user.sub` instead of `req.user.id`

- [x] **Database query optimization audit** - ✅ Done (2026-03-30). Added 9 missing @@index([userId]) indexes. Batched SLA service queries (slaDashboard, slaComplianceReport, getSloSummary). Batched health score leaderboard (2N+1 → 2 queries). All hot paths optimized.

- [x] **Fix global search monitor type filtering** - ✅ Done (2026-04-01). Replaced invalid `VERSION_CHECK` literal with proper enum filters (`type: { notIn: [GIT_RELEASE, DOCKER_IMAGE] }` for uptime monitors and `type: { in: [...] }` for version monitors). Added targeted unit coverage + integration coverage for `/v1/search` (auth, limits, isolation, result mapping).

- [x] **Normalize API path expectations in ops checks/docs** - ✅ Done (2026-04-01). `scripts/verify-deployment.sh` is the canonical verification script with all three access paths documented (direct API port 4321, web proxy port 1234, public reverse proxy). Path anti-pattern guard included.

### 🟠 P1 - UX & Polish

- [x] **Visual browser testing** - ✅ Done (2026-04-01). Added rootless runner `scripts/visual-test-docker.sh` + `npm run test:visual:docker`; verified with 90/90 passing screenshots across all target pages × 3 viewports × 2 themes.

- [x] **Unit tests for monitor sub-services (comparison + diagnostics)** - ✅ Done (2026-04-01). 74 new unit tests for MonitorsComparisonService (pearsonCorrelation, compareMonitors, getLatencyDistribution, getPeriodComparison, getStatusTransitions) and MonitorsDiagnosticsService (getHealthScore: all 4 scoring dimensions, grade thresholds A-F). API test total: 4598 → 4672.

- [x] **Status page widget preview coverage** - ✅ Done (2026-04-01). All 82 widget palette types now have editor canvas previews. Fixed 11 missing widget cases + 3 type aliases. Zero fallthrough to default.

- [x] **Status page widget visual audit (browser)** - ✅ Done (2026-04-01). Executed visual sweep (`npm run test:visual:docker`, 90/90 pass), validated widget coverage (`npm run widget:audit`, 82/82), fixed `version-timeline` preview color-dot rendering defect, and documented qualitative findings in `docs/STATUS_PAGE_WIDGET_VISUAL_AUDIT_2026-04-01.md`.

- [x] **Loading performance audit** - ✅ Done (2026-03-30). Dashboard JS reduced 24% (1314KB → 1001KB). Chart.js removed from critical path (lazy-loaded only on monitor detail). Deleted unused BarChartCJS. TTFB <21ms on all pages. Gzipped dashboard JS ~300KB via reverse proxy.

- [x] **Remove invalid Next.js config warning** - ✅ Done (2026-04-01). Removed deprecated/invalid `optimizePackageImports` root key from `apps/web/next.config.mjs` so `npm run build` no longer emits config warnings.

- [x] **Monitor detail page UX** - ✅ Done (2026-03-30). Replaced flat 17-tab scrollbar with primary tabs + "More" dropdown. Extracted MonitorTabBar component. 4 primary tabs always visible, 13 secondary in dropdown.

- [x] **Sidebar navigation UX** - ✅ Done (2026-03-30). Reorganized into categorized sub-sections with labels. Monitoring group: 3 primary + 5 sub-sections (Real-time, Performance, Intelligence, Infrastructure, Versions). Progressive disclosure preserved.

### 🟡 P2 - Features & Enhancements

- [x] **GraphQL monitor improvements** - ✅ Done (2026-03-30). Added: template variable substitution ({{VAR_NAME}}), introspection validation with schema hash, schema change detection (previousSchemaHash comparison), latency threshold support (yellow/degraded). 22 tests covering all features.

- [x] **Webhook signature verification docs** - `docs/WEBHOOKS.md` with payload format, HMAC-SHA256 examples in Node.js, Python, Go, PHP. *(2026-03-30)*

- [x] **Status page custom CSS** - ✅ Already implemented. Custom CSS textarea in status page editor settings panel (max 10,000 chars), injected into public page `<head>` via `<style>`. Works in both live pages and preview mode.

- [x] **Monitor grouping hierarchy** - ✅ Done (2026-03-30). Nested folder hierarchy (max 5 levels) with self-referencing Folder tree. Cycle detection, stats aggregation bubbling up, new `/flat` + `/move` endpoints. Mute/unmute cascades to subfolders. Frontend tree view with indentation + parent selector in create modal. 25 unit tests.

- [x] **Batch notification digest improvements** - Added weekly_digest option (cron: Mon 07:05 UTC). Trend data in digests deferred (requires significant mailer template rework). *(2026-03-30)*

### 🟢 P3 - Maintenance & Cleanup

- [x] **Prune old status summaries from backlog file** - ✅ Done (2026-04-01). Removed redundant top-of-file status blocks and kept a single current status summary. (Note: git commit history itself is immutable and intentionally unchanged.)

- [x] **Consolidate duplicate API endpoints** - ✅ Done (2026-03-30). Extracted shared v2 types (PaginatedEnvelope, AuthenticatedRequest, parsePagination, buildMeta) into v2/v2.types.ts and common/auth.types.ts. v1 and v2 are complementary (v2 adds pagination), not duplicates. 14 unit tests added.

- [x] **Upgrade path documentation** - `docs/UPGRADING.md` covers all 5 pending major upgrades with risk assessment, breaking changes, and strategy. *(2026-03-30)*

- [x] **CHANGELOG cleanup** - Merged 3 stale "Unreleased" sections into v1.1.0. All 18 releases properly versioned with comparison links. *(2026-03-30)*

---

## Completed Features (Reference)

<details>
<summary>Click to expand full completed feature list</summary>

### Core Monitoring
- [x] HTTP/TCP/SSL/Heartbeat/DNS/WHOIS/SMTP/FTP/IMAP/POP3/CT_LOG/GraphQL/Browser monitor types
- [x] Check retries with exponential backoff
- [x] Cron expression scheduling
- [x] Rate limiting & throttling per monitor
- [x] Failure confirmations (debounce alert noise)
- [x] Flapping detection
- [x] Latency anomaly detection (P95 baseline)
- [x] Business hours schedule
- [x] Monitor pinning, cloning, bulk operations
- [x] Monitor priority (P1-P4)
- [x] Check history with CSV export
- [x] Response diff tracking
- [x] Content change detection (SHA-256)
- [x] DNS record change detection
- [x] Geo-region distribution
- [x] HTTP timing breakdown (DNS/TCP/TLS/TTFB/Download)
- [x] HTTP header assertions
- [x] HTTP body/JSON path assertions
- [x] Custom metric capture (JSONPath)
- [x] Redirect chain tracking
- [x] Response size tracking
- [x] Monitor config change history (audit trail)
- [x] Failure pattern analysis
- [x] Status webhooks per monitor
- [x] Public share tokens
- [x] Uptime certificates

### Alerting
- [x] Webhook, Slack, Discord, Telegram, Email, PagerDuty, OpsGenie, SMS (Twilio), Teams, Mattermost, Zulip, Rocket.Chat, ntfy, Gotify, Apprise channels
- [x] Alert routing rules (conditional)
- [x] Alert acknowledgement & monitor muting
- [x] Alert grouping/correlation
- [x] Alert batching/digest mode
- [x] Per-channel active schedules
- [x] Custom message templates
- [x] Alert noise analysis
- [x] Alert response time analytics
- [x] Alert storm protection
- [x] SLA burn rate alerts (Google SRE model)
- [x] REPEAT_EVERY_N alert mode
- [x] Alert delivery CSV export

### Incidents
- [x] Full CRUD with timeline updates
- [x] Post-mortem auto-generation
- [x] Incident playbooks with step tracking
- [x] MTTR/MTTF analytics
- [x] Incident insights (hour/DOW heatmap, severity distribution)
- [x] SVG status badges

### Status Pages
- [x] Drag-and-drop editor (dnd-kit)
- [x] 70+ widget types across 9 categories
- [x] Real CSS grid layout (12-col responsive)
- [x] Widget resize, lock, duplicate, multi-select
- [x] Undo/redo, zoom, alignment guides, layer management
- [x] Template gallery (7 presets)
- [x] Version history (10 saves, one-click restore)
- [x] Page themes (light/dark/system, fonts, accent color, backgrounds)
- [x] SEO config, custom favicon, branding toggle
- [x] Password protection
- [x] WebSocket real-time updates
- [x] Email subscriber system
- [x] Slack/Discord status change notifications
- [x] Embeddable widget (iframe/JSON/script-tag)
- [x] Status page badge (SVG)
- [x] Print/export (PDF, PNG)

### Analytics & Reports
- [x] Fleet health report (grade A-F)
- [x] Monitor trends (week-over-week)
- [x] Monitor comparison view
- [x] Failure prediction (regression-based risk scoring)
- [x] Failure correlation (Jaccard similarity + union-find clusters)
- [x] Uptime heatmap, latency heatmap
- [x] Reliability trends, incident insights
- [x] SLA dashboard, compliance report, by-tag, error budget forecast
- [x] Downtime cost tracking
- [x] Check schedule overview, interval optimizer
- [x] Security headers fleet dashboard
- [x] Monitor anomaly report
- [x] Operations digest
- [x] Assertion stats, tag analytics
- [x] Health score leaderboard
- [x] Latency budget tracking, benchmarking
- [x] Monitor infrastructure topology (SVG graph)
- [x] Deployment events & CI/CD integration
- [x] Maintenance window effectiveness
- [x] Alert channels health dashboard

### Version Intelligence
- [x] 5000+ tools in registry (17 categories)
- [x] npm, PyPI, Cargo, Maven, Helm, Docker Hub, GitHub providers
- [x] 144 monitor templates
- [x] Version drift report
- [x] PulseDock Agent (local version reporter)
- [x] Browser extension (Chrome MV3)
- [x] CLI tool

### Security
- [x] 2FA/TOTP with recovery codes
- [x] CSRF protection (double-submit cookie)
- [x] Account lockout (5 attempts → 15min)
- [x] Email verification
- [x] Password strength enforcement (12+ chars)
- [x] Strict rate limiting on auth endpoints
- [x] Audit log with CSV/JSON export
- [x] Session activity & anomaly detection
- [x] OAuth SSO (GitHub + Google)
- [x] Input sanitization
- [x] Security headers (helmet)

### Enterprise
- [x] Multi-user/team with RBAC (Owner/Admin/Editor/Viewer)
- [x] Organizations/workspaces
- [x] API keys with scoped permissions
- [x] Scheduled email reports
- [x] Data retention policies with rollup
- [x] Backup & restore
- [x] Billing/plan management
- [x] White-label support
- [x] Grafana datasource plugin
- [x] i18n (EN + DE)

### Infrastructure
- [x] Docker Compose (dev + prod)
- [x] Kubernetes manifests + Helm chart
- [x] GitHub Actions CI/CD
- [x] Prometheus metrics endpoint
- [x] WebSocket real-time updates
- [x] Redis caching layer
- [x] Historical data retention (configurable)
- [x] Aggregation rollups

### Code Quality
- [x] 5350+ tests (4571 API + 757 web + 12 agent + 10 CLI)
- [x] Zero `any` types, zero TODO/FIXME, zero console.log
- [x] Zero TS errors (API + web)
- [x] Zero npm audit vulnerabilities
- [x] API p95 <15ms, Web TTFB <130ms
- [x] 19 comprehensive docs in docs/
- [x] Swagger/OpenAPI with 143 endpoints documented
- [x] JSDoc on all service methods
- [x] Performance + smoke test scripts
- [x] Code quality automation (8 checks)

</details>
