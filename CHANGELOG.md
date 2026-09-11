# Changelog

All notable changes to PulseDock are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [1.7.0] — 2026-04-04

### Added
- **Comprehensive Integration Test Suite** — 888+ real-database integration tests across 49 spec files covering every API module: auth, monitors (CRUD/state/runs/analytics/SLA/diagnostics/comparison/export/alerts/details), alerts (channels/analytics/routing/actions), incidents, teams, organizations, settings, status pages, tools, versions, admin, grafana, heartbeat, agent, webhooks, escalation, playbooks, maintenance, deployments, folders, tags, annotations, notifications, search, reports, plan, service groups, dependencies, and more.
- **V2 API Hardened** — Paginated list endpoints for monitors, alert channels, and checks with filtering, sorting, and search. Secret redaction on all webhook/bot token fields. Cross-user isolation verified in integration.
- **System & Health Integration Tests** — `/health`, `/health/live`, `/health/ready`, `/metrics`, `/v2/system/info`, `/v2/system/versions`.
- **Web Unit Test Coverage Blitz** — 5147 web unit tests across 230+ spec files. All helper modules, hooks, components, and page sections have pure-function unit test coverage.

### Fixed
- **`ImportExternalDto` payload whitelist** — Added `@IsOptional()` so `POST /v1/monitors/import-external` no longer returns 400 for valid CSV/provider payloads.
- **Agent `redirectChain:[]` missing** — `MonitorRun.create` was missing the required field, causing P2011 null constraint violations on every agent report. Fixed.
- **Route shadowing in analytics/SLA/diagnostics/export/comparison** — Static routes (`/fleet-report`, `/trends`, `/correlation`, etc.) were shadowed by `:id` param routes. Now controllers are registered before the main MonitorsController.
- **Organizations controller userId bug** — Controller typed `req.user` as `{ sub: string }` but `AuthGuard` populates it as `{ id: string }`. All org writes passed `undefined` as userId. Fixed.
- **Deployments controller route shadowing** — `/summary` and `/by-monitor/:id` were returning 404 because `:id` was declared before them. Moved static routes first.
- **SLA service `uptimeCertificate` throws 500** — Was throwing plain `Error` instead of `NotFoundException`. Now returns proper 404.

### Tests
- **11,300+ tests passing** (5055 API + 5147 web + 888 integration + 114 CLI + 12 agent) — up from 5350+ in v1.6.0
- 490+ test files across API, web, CLI, agent, and integration suites
- All web helper modules have unit test coverage (pure function extraction pattern)
- Integration tests run against real PostgreSQL with isolated user cleanup per suite

---

## [1.6.0] — 2026-03-29

### Added
- **X-Response-Time Header** — Every API response includes `X-Response-Time` header (in ms). Express middleware works for all responses including guard errors (401/403). Slow requests (>1000ms) logged with structured warnings. 8 tests.
- **Prometheus HTTP Request Duration Histogram** — `pulsedock_http_request_duration_ms` with 11 buckets (5ms–10s). Express middleware observes every request for Grafana p50/p95/p99 latency dashboards. 3 tests.
- **Prometheus Process Memory Gauges** — `pulsedock_process_heap_used_bytes`, `pulsedock_process_heap_total_bytes`, `pulsedock_process_rss_bytes`, `pulsedock_process_external_bytes` for self-hosted instance monitoring. 1 test.
- **Prometheus Check Execution Metrics** — `pulsedock_checks_executed_total{type,result}` counter tracks per-type ok/fail check counts. `pulsedock_check_duration_ms{type}` histogram with 10 buckets (50ms–60s). `pulsedock_checks_in_flight` gauge. 4 tests.
- **Prometheus Event Loop & CPU Metrics** — `pulsedock_eventloop_lag_{min,max,mean,p50,p99}_ms` gauges via `perf_hooks.monitorEventLoopDelay`. `pulsedock_process_cpu_{user,system}_seconds_total` counters. `pulsedock_process_active_{handles,requests}` gauges. 4 tests.
- **Monitor Comparison View** — `GET /v1/monitors/compare?ids=...&days=N` — Select 2–4 monitors for side-by-side performance analysis. Per-monitor uptime%, avg/P95 latency, failures, longest outage, daily breakdowns. Pearson correlation between uptime patterns. Frontend at `/monitors/compare` with color-coded chips, period pills, SVG overlay charts, correlation matrix.
- **Monitor Failure Prediction** — `GET /v1/monitors/failure-prediction` — Linear regression on 7-day uptime% and latency trends. Risk score 0–100 composite. Predictions: stable/watch/at_risk/likely_failure. Estimated hours to failure. Frontend at `/monitors/predictions` with fleet risk score, sortable table, pulsing time-to-failure indicators.
- **Incident Response Playbooks** — `IncidentPlaybook` Prisma model. CRUD at `/v1/playbooks`. Attach playbooks to monitors — auto-snapshot onto incidents when fired. Step completion tracking via `PATCH /v1/incidents/:id/playbook-step/:stepId`. Frontend at `/incidents/playbooks` with drag-step editor (check/escalate/runbook/command/notify types).
- **Monitor Dependencies & Impact Analysis** — `MonitorDependency` model. `POST /v1/monitors/:id/dependencies` to set/replace deps. `GET /v1/monitors/:id/impact` for BFS downstream + upstream root-cause analysis. Frontend at `/monitors/dependencies` with two-panel config UX.
- **Alert Escalation Policies** — Multi-step escalation with configurable delays per channel. `checkAllEscalations()` scheduler integration. Muted/healthy monitors skipped. Recovery resets.
- **Monitor Service Groups** — Logical grouping with aggregate status (worst-of). `GET /v1/service-groups/:id/status` returns operational/degraded/outage.
- **Production Dockerfiles** — Multi-stage Dockerfiles for API (Node 22 Alpine, Prisma migrate on start) + Web. GitHub Actions workflow for GHCR publishing.
- **Collapsible Sidebar Navigation** — 51 nav items restructured into 6 groups with primary/secondary items. "N more" toggles. Auto-expand on navigation. Persisted in localStorage.

### Changed
- **Zero `any` Types** — All production code is strictly typed with no `any` casts.
- **Sidebar Groups** — Monitoring, Alerting, Operations, Insights, Administration sections for better organization.
- **Prometheus Metric Naming** — All counters renamed from camelCase to snake_case per Prometheus best practices. `_total` suffix added per conventions.

### Tests
- **5350+ tests passing** (4567 API + 757 web + 12 agent + 10 CLI) — up from 4683 in v1.5.0
- Added 60 service-level specs for EscalationService, DependenciesService, PlaybooksService, ServiceGroupsService
- Added 23 controller specs for escalation, playbooks, dependencies, service-groups controllers
- Added 34 coverage tests for deployments, playbooks, dependencies modules
- Code quality: 8/8 checks passing (0 TS errors, 0 `any`, 0 TODOs, 0 console.log, 0 empty catches)

---

## [1.5.0] — 2026-03-28

### Added
- **Alert Acknowledgement** — `POST/DELETE /v1/monitors/:id/acknowledge` — Acknowledge active alerts with optional note. Suppresses further notifications. Shows note inline in the Acknowledged badge. Auto-clears when monitor recovers.
- **Monitor Muting** — `POST/DELETE /v1/monitors/:id/mute` — Mute all alerts for 30min/1h/4h/24h. Amber 🔇 badge on monitors list and detail page. Click badge to unmute.
- **Alert Routing Rules** — `GET/POST/PATCH/DELETE /v1/alert-routing-rules` — Route alerts to specific channels based on monitor type, level, tags, folder, or individual monitor. Rules evaluated in priority order (first match wins). Can override notifyOn per rule. Frontend at `/alerts/routing`. 9 tests.
- **Latency Anomaly Detection** — `anomalyDetection` + `anomalyMultiplier` per monitor. Automatically computes P95 baseline from last 7 days (≥10 samples required). Upgrades check level green→yellow when latency exceeds N×P95. Toggle in monitor form. 10 tests.
- **Alert Storm Protection** — `alertStormProtection` + `alertStormThreshold` in notification preferences. Suppresses alerts when more than N fire within 10 minutes. Sends one "storm detected" notification per 30-minute window. UI in Account > Notifications. 9 tests.
- **Business Hours Schedule** — `scheduleEnabled`, `scheduleDays`, `scheduleStartHour`, `scheduleEndHour` per monitor. Checks only run during configured UTC time window and days. Day picker + hour selects in monitor form. 📅 badge on monitors list. 10 tests.
- **Monitor Cloning** — `POST /v1/monitors/:id/clone` — Duplicate a monitor with all config, alert channels, and tags. Clone starts disabled. Clone button (Copy icon) in monitors list.
- **GET /v1/monitors/:id** — Single-monitor endpoint returning full detail including mute state, active acknowledgement note, anomaly settings, and schedule config. Monitor detail page now fetches this instead of loading all monitors.
- **Alert Analytics** — `GET /v1/alert-channels/analytics` — 30-day daily delivery counts, per-channel reliability rates, top alerting monitors. Frontend at `/alerts/analytics` with stat cards and bar chart.
- **Alert Analytics Dashboard Section** — Dashboard SLO Health section: `GET /v1/monitors/slo-summary` shows ok/at-risk/breached counts + per-monitor table.
- **Escalation Policies** — `GET/POST/PATCH/DELETE /v1/escalation-policies` — Define multi-step escalation with configurable delays per channel. Assigned to monitor alert channels via `PATCH /v1/monitors/:id/alerts/:channelId`. Checks scheduler fires steps automatically. Frontend at `/alerts/escalation`. 18 tests.
- **WebSocket live updates on monitor detail** — Check runs prepend in real-time without page refresh. Live green indicator badge.
- **P95 latency line on detail chart** — Response time chart shows P95 line alongside avg line.
- **Down monitor count badge in nav** — Sidebar "Monitors" link shows red badge with count of currently down monitors.
- **FTP / IMAP / POP3 Monitor Types** — Three new protocol monitors: FTP (login + directory list), IMAP (login + SELECT INBOX), POP3 (login + STAT). Full UI support, validator, templates, icons. 30+ tests.
- **CT Log Monitor** — Certificate Transparency log watcher. Detects newly issued certs for a domain within configurable hours. Alert on unexpected issuance. Frontend form config with `ctHours` field.
- **Monitor Check Rate Limiting** — `throttleMs` (min ms between consecutive checks) and `maxChecksPerHour` (hard cap) fields on Monitor. Scheduler enforces per-monitor. `GET /v1/monitors/:id/check-rate` returns effective rate info. Rate Limiting section in monitor Advanced Settings. 5 tests.
- **Monitor Trend Analysis** — `GET /v1/monitors/trends` — week-over-week uptime% and avg latency deltas for all monitors. Returns `uptimeTrend` / `latencyTrend` as `improving | degrading | stable | new` with numeric deltas. `/monitors/trends` page: summary cards, sortable table with trend badges and delta arrows. 5 tests.
- **MTTR/MTTF Analytics** — `/mttr` page with mean-time-to-recovery and mean-time-to-failure metrics per monitor. Sortable table with incident counts, downtime totals, trend sparklines.
- **Monitor Health Score** — Composite 0–100 scoring with grade A–F (uptime 40pts, latency trend 20pts, SLA budget 20pts, stability streak 20pts). Health score column on monitors list. Detail page breakdown. `GET /v1/monitors/health-summary` and `GET /v1/monitors/:id/health-score`. 17 tests.
- **Alert Channel Delivery Stats** — Per-channel delivery success/failure rates, last delivery timestamp, failure reasons. `GET /v1/alert-channels/:id/stats`. Stats shown on alert channels page.
- **Geo-Region Tagging** — `geoRegions` field on Monitor assigns round-robin region labels to check runs. `GET /v1/monitors/:id/geo-stats?periodDays=7` returns per-region uptime%, avgLatencyMs, p95LatencyMs. Monitor form tag-pill input. Detail page geo-stats table. Globe indicator on monitors list.
- **Global Status Timeline** — `/monitors/timeline` — Gantt-style view of all monitors' state over time. Configurable period (1h–7d). Filter by folder/tag. Color-coded status segments.
- **Failure Pattern Analysis** — Groups monitor failures by normalized error message. Shows frequency trends, top error types. "Failures" tab on monitor detail page.
- **Import from Docker Compose** — `POST /v1/monitors/import-from-compose` — Paste a `docker-compose.yml`, get back suggested monitors (HTTP/TCP) based on service images and port mappings. "From Compose" button on monitors page with full import modal. 6 tests.
- **Alert Rules Simulator** — `POST /v1/monitors/:id/simulate-alerts` — Replay last 7 days of check history through configurable alert rules (confirmations, flap detection, business hours). Returns noise score (low/medium/high), alerts/day rate, full event timeline. "Simulate Alerts" tab on monitor detail. "Apply to monitor" button. 6 tests.
- **Custom Metric Capture** — `metricPath` JSONPath field on HTTP monitors. Extracts a numeric value from JSON responses and stores as a time-series. Threshold alerting on metric value. `GET /v1/monitors/:id/metric-history` returns time-series data. Chart on monitor detail.
- **Monitor Coverage Analysis** — `GET /v1/monitors/coverage` — Config completeness scoring per monitor. Flags monitors missing alert channels, SLA targets, runbook URLs, tags. Sortable coverage table at `/monitors/coverage`. Score badges on monitors list.

### Tests
- **3905 API tests** (up from 3208), **756 web**, **10 CLI**, **12 agent** — Total: **4683 tests passing**.

## [1.4.0] — 2026-03-25

### Added
- **Flap Detection** — Monitors now detect rapid oscillation between healthy/unhealthy states. When a monitor flips state ≥3 times in the last 5 runs, it enters "flapping" state: failure alerts are suppressed (noise reduction), a single 🔁 FLAPPING notification is sent, and the monitor shows an animated amber badge in the UI. Flapping clears automatically when the monitor stabilises. Configurable per-monitor toggle (`flapDetectionEnabled`).
- **Auto-Create/Resolve Incidents** — Monitors can now automatically open and close incidents when status changes. Enable with `autoIncident` toggle per monitor; configure `autoIncidentSeverity` (CRITICAL/HIGH/MEDIUM/LOW). Auto-created incidents are tagged with an "Auto" badge in the UI and included in CSV export.
- **SLA Error Budget Burn Rate Alerts** — Google SRE-style multi-window burn rate alerting. Critical threshold: 1h ≥14.4× + 6h ≥2.88× budget burn. High: 1h ≥6× + 6h ≥1.2×. Warning: 1h ≥3× + 6h ≥0.6×. Both windows must fire simultaneously to reduce false positives. Throttled 6h per monitor. New `slaBurnRateAlertedAt` field.
- **Runbook URL** — Monitors can store a `runbookUrl` that is included in alert notifications and shown on the monitor detail page as a quick-access link for responders.
- **Send Test Report Now** — New button in account settings to trigger an immediate test uptime report email without waiting for the scheduled send.

### Fixed
- **Flapping notification delivery log** — Fixed alert delivery log trigger for flap alerts so flap notifications are properly recorded in the delivery log.
- **Auto-incident `autoCreated` flag** — Incidents created automatically now correctly have `autoCreated: true` persisted and exported in CSV output.
- **TypeScript errors** — Resolved TS errors in `incidents.controller.spec.ts` and related test files.

### Tests
- **3208 API tests** (up from 2778), **10 CLI**, **12 Agent** — Total: **3230 tests passing**.
- Added flap detection specs: stable runs, insufficient data, threshold crossing, state clear, detection-disabled.
- Added 7 auto-incident tests: create, deduplication, resolve on recovery, confirmations interaction, severity mapping, error handling.
- Added SLA burn rate alert tests (9 tests covering all severity levels, throttling, window logic).
- Added extensive web component unit tests: Button, Card, Select, Skeleton, SortableTable, CopyButton, VersionDiff, PasswordStrength, MonitorStatusCell, Sparkline, CountUp, Badge, status-page editor utils (+300+ web tests).
- Added resolver specs for incident/maintenance/SLA/performance/version/metric/layout/content/uptime resolvers.
- Added semver utility specs (76 tests), timeUtils specs (53 tests), network runner specs.

---

## [1.3.0] — 2026-03-24

### Added
- **Status Page Index** — New `/status` index page listing all published status pages with live aggregate status (operational/degraded/outage) per page. `GET /v1/public/status-pages` API endpoint with batched monitor status queries.
- **Widget Showcase** — 99 widgets deployed to `/status/widget-showcase` covering all categories with 7 live monitors for Noah's visual review.
- **Loading Skeletons & Error Boundaries** — Added for incidents, maintenance, status-pages, reports, changelog, verify-email, and invite pages.
- **Metadata Layouts** — SEO metadata for folders, reports, and changelog pages.
- **Security Headers** — Comprehensive security headers added to web app (CSP, X-Frame-Options, HSTS, etc.).

### Changed
- **Major Codebase Decomposition** — Split large monolithic files into focused modules:
  - `widget-data-resolver`: 2771 → 173 lines (split into 9 category resolvers)
  - `monitors page`: 3664 → 1994 lines
  - `versions page`: 2118 → 794 lines
  - `status-page editor`: 4199 → 3460 lines
  - `monitors service`: 2123 → 1665 lines (extracted version detection)
  - `status-pages service`, `account page`, `monitor detail` decomposed
  - `public status page widgets` split into 9 category files
- **Status page grid** — Replaced fixed-height grid with auto-height flex rows for better visual layout.
- **Dependency updates** — NestJS 11.1.17, Tailwind 4.2.2, vitest 4.1.1, TypeScript 5.7.3, nodemailer 8.0.3, rxjs 7.8.2.
- **Next.js 16.2+** — Added `--webpack` flag for production builds (required by 16.2+).

### Removed
- **On-Call Feature** — Removed on-call schedules and escalation policies by Noah's request (-1973 lines). On-call rotation is out of scope for PulseDock.
- **Bogus Registry Entries** — Removed 400 placeholder entries from tool registry. Registry now has 5009 verified unique tools.

### Fixed
- **CORS** — Removed hardcoded CORS origin, added `CORS_ORIGINS` env var for flexible configuration.
- **LayoutWidgets** — Added missing `"use client"` directive for TabContainer `useState`.
- **Redundant cache header** — Removed `_next/static` cache header that caused Next.js 16 warning.
- **TypeScript** — Resolved 15 strict mode errors in test files.
- **Public status page spacing** — Reduced excessive spacing on public status pages.

### Tests
- **Test Coverage Sprint** — API: 2637 (up from 1951), Web: 119 (up from 65), CLI: 10, Agent: 12. **Total: 2778.**
- Branch coverage: 90%+ across all major services (alerts 96%, monitors 90%, status-pages 85%, checks 91%, settings 98%, reports 98%, organizations 100%).
- Added coverage for: ScopeGuard, ToolRegistryController, dashboard, realtime, team modules, grafana, backup, plan, checker, alerts, redis-cache, mailer, cert-expiry plugin, scheduler SLA edge cases, web api helper, useDebounce, realtime socket, useCountUp, app controller, demo service.

---

## [1.2.0] — 2026-03-23

### Added
- **Monitor Health Score** — Composite 0–100 health scoring with grade A–F for monitors. New API endpoints: `GET /v1/monitors/health-summary` (aggregated) and `GET /v1/monitors/:id/health-score` (detailed breakdown). Scoring: uptime 40pts, latency trend 20pts, SLA budget 20pts, stability streak 20pts. Health score badges on monitors table and detail page. 17 new tests.
- **Demo Data Seeding** — `POST /v1/demo/seed` creates 5 sample monitors, 1 webhook alert channel, and a status page for new users. Idempotent (skips if 3+ monitors exist). OnboardingChecklist "Load Sample Data" button with success/error toasts. 5 new tests.
- **Tool Registry Live Validation** — `GET /v1/tool-registry/validate/:id?instanceUrl=...` tests reachability + version extraction for any registry tool. Auto-detects upstream sources (GitHub, Docker Hub, npm, PyPI, Cargo).
- **Extractor Pipeline Enhancement** — Added `isVersionLike()`, `stripVPrefix()`, `runHeuristicExtraction()`, `extractVersionWithFallback()`. Heuristic pass scans 14 common version field names when configured paths miss. 42 extractor tests (was 17).
- **Widget Config Property Editors** — Added dedicated property editors for 15 widget types (announcement-bar, image-banner, code-block, video-embed, embed-iframe, countdown, FAQ accordion, link-list, social-links, SLA summary, response-time-chart, uptime-heatmap, response-time-heatmap, aggregate-health-score, subscriber-form).
- **Widget Config UX Polish** — Required field asterisks, inline validation, red invalid styling for monitor selector, Security Advisory packageName, and Embed URL. Contextual monitor-scope guidance. Per-widget "Setup tips" hints.
- **Registry Runtime Mock Verification** — `npm run registry:verify:runtime:mocks` validates verified template extraction behavior. CI gate step added. Machine-readable audit report output.
- **Registry Correctness CI Gates** — Strict verified-template lint gates, variant audit regression guard, runtime audit baseline + regression thresholds in CI.
- **Verification Metadata** — `verificationStatus` + `lastVerifiedAt` on all 646 verified entries. `docsUrl` added to 163+ key tools.

### Changed
- **Next.js** upgraded 16.2.0 → 16.2.1
- **React** remains at 18.3.1 (React 19 upgrade deferred — breaking changes in ecosystem)
- **Prisma config** — switched to `process.env.DATABASE_URL` and enabled `driverAdapters` preview feature
- **Web build** — `scripts/build-web.sh` hardened against flaky heartbeat builds (stale `.next/lock` cleanup, bounded `NODE_OPTIONS` heap)
- **Version tool picker** — Memoized normalization + ranked filtering to avoid recomputation on unrelated renders

### Fixed
- **Security audit** — Pinned `prisma`, `@prisma/client`, `@prisma/adapter-pg` to 6.12.0 eliminating GHSA-38f7-945m-qr2g. `npm audit --audit-level=high` now reports 0 vulnerabilities.
- **Registry lint** — Strict verified-template gates: `verified=true` requires `verificationStatus='verified'`, instance-based sources require explicit `authRequired`, verified entries must have docs/evidence.

### Tests
- API tests: 1951 (up from 1736 in v1.1.0)
- CLI tests: 10
- Agent tests: 12
- Total: 1973

---

## [1.1.0] — 2026-03-21

### Added
- **Swagger API documentation audit** — All 143 endpoints annotated with `@ApiResponse` (401/403/404/400). Error response coverage: 16 → 82 annotations.
- **Status page subscriber emails** — Outage/degraded events trigger notifications to all page subscribers.
- **Status page SVG badge** — `GET /v1/public/status-badge/:slug.svg` with embed modal (Markdown/HTML/URL).
- **Status page PDF export** — Print button + comprehensive `@media print` stylesheet.
- **Status page webhook on status change** — Page-level webhook URL; fires on status transitions.
- **Admin user management overhaul** — Edit modal: display name, role, disable/enable, force password reset, remove MFA, delete.
- **Dashboard UX** — Customizable section order, time range selector (1h/6h/24h/7d/30d), live pulsing indicator.
- **Monitors UX** — Pagination (10/25/50/100/All), advanced filter panel, sortable columns, hover quick-actions, row expansion.
- **Command palette (Ctrl+K)** — Fuzzy search across commands, navigation, create actions. Keyboard shortcuts modal (`?`).
- **Notification bell** — In-app notification dropdown with version update counts and monitor names.
- **Tool registry expanded to 1385+ tools** — Added AI/ML, ERP/Business, Search/Vector DB, IoT/Edge, Photo/Document categories.
- **Accessibility audit** — ARIA roles, landmarks, live regions across all public status page widgets and root layout.
- **JSDoc documentation** — `@param`/`@returns`/`@throws` across 12+ service files.
- **Widget resolver coverage complete** — All 82 status-page widget types now have per-widget API data endpoints. Added resolvers for `active-incident-banner` (returns active incidents + down monitors with all-clear flag), `maintenance-calendar` (upcoming/active windows for 90-day window), `multi-monitor-status-grid`, `multi-status-badges`, `version-check-badge`, `update-summary`, and 10 content-only widgets. Widget audit: ✅ 82/82 types, zero palette/renderer/resolver gaps.
- **BROWSER monitor type** — Full page check with browser User-Agent, 2xx/3xx status assertion, expected text search (case-insensitive), CSS selector presence check (#id, .class, tag, [attr], tag.class, tag#id), custom allowed status codes. 9 new unit tests.
- **DNS/PING monitor config UI** — Create/edit modal now shows type-specific fields for DNS (record type, expected value, timeout) and PING (ping count, max packet-loss %) monitors. Config correctly serialized to API and pre-filled when editing.
- **Monitor Timeline Annotations** — `MonitorEvent` Prisma model + API. Monitor detail page shows Timeline Annotations panel: add/delete events with type (deploy/note/incident/maintenance/config), color-coded badges, relative timestamps, hover-reveal delete. Events appear as vertical reference lines on the response-time area chart.
- **Monitor detail page enhancements** — Edit/Delete buttons in header; auto-open edit modal via `#edit-{id}` anchor; 7×24 uptime heatmap (GitHub contributions style); expanded check history to 50 rows with total run count.
- **Tool registry variants system** — `TOOL_VARIANTS` map with 50 tools having platform/edition variant definitions (e.g. GitLab CE/EE, Traefik Docker/k8s, SonarQube CE/DE/EE, Immich Docker/k8s). Each variant includes verified endpoint, auth requirements, and evidenceUrl. Exposed via `GET /v1/tool-registry/:id/variants`. Platform selector in versions setup UI.
- **Billing / License Management** — `Plan` + `UserPlan` Prisma models. `PlanService` with COMMUNITY/PRO/ENTERPRISE tiers, limit enforcement on monitor/status-page/alert-channel creation. `GET /v1/plan` + `/v1/plan/check/:resource` endpoints. Admin plan management. `PlanUsageCard` on account page.
- **White-label support** — All 13 app shell layouts, 20+ pages, login branding, and API mailer templates use `brand.name` from centralized `apps/web/lib/brand.ts` driven by `NEXT_PUBLIC_APP_*` env vars.
- **Organization / Workspace** — Multiple organizations per account, slug availability check, member management, invite system. Full API + frontend `/account/organizations` page.
- **Plugin System v2** — 8 built-in check plugins (http.response-match, http.response-time, http.json-assertion, http.status-code, http.regex-match, http.header-assertion, http.redirect-check, http.cert-expiry). External plugin loader from filesystem. Admin panel Plugin Management UI. `GET /v1/plugins` endpoint.
- **On-call rotation** — `OnCallSchedule`/`OnCallRotation`/`EscalationPolicy` Prisma models. Round-robin schedule API. Calendar view in account page.
- **SMS alert channel** — Twilio integration. Config: accountSid, authToken, from, to.
- **PagerDuty / OpsGenie alert channels** — Full POST trigger/resolve + dedup (PagerDuty Events API v2, OpsGenie Alerts API with EU region support).
- **HTTP JSONPath assertions** — `bodyJsonPath` + `bodyJsonPathExpected` config fields for HTTP monitors. Dot-notation path traversal. 7 new tests.
- **Scheduler performance** — Covering index `(monitorId, checkedAt, level)` on `MonitorRun` for index-only uptime scans. Explicit column `select` in scheduler tick to avoid pulling unused fields.
- **DB index** — `(monitorId, checkedAt)` covering index on `MonitorRun` for latency percentile queries.
- **Widget live data preview** — Status-page editor toolbar "Live" toggle shows real API widget data in the Properties panel.

### Changed
- **Tool registry** — 5,009 unique tool entries across all categories. 50 tools have verified platform variant definitions.
- **Widget audit** — Automated `npm run widget:audit` passes with zero gaps across all 82 widget types.
- **Test suite** — 1,736 API tests passing (up from 1,346 at v1.0.2). Zero TypeScript strict mode errors.

---

## [1.0.2] — 2026-03-17

### Added
- **Status page — monitor groups, multi-status badges** — Status page public view now renders `monitor-group-status` and `multi-monitor-status-grid` widgets using live monitor tag/folder data. Group status aggregates across monitors (Operational / Degraded / Outage) with colour-coded badge counts.
- **Status page — version widgets** — `update-status-badge` and `version-comparison-table` widgets now show real version data (current vs latest, up-to-date / update-available state) with live API polling.
- **Status page — live widget previews in editor** — Editor renders live data previews for all widget types while editing, not just a static placeholder. Auto-save on every layout change (2s debounce).
- **Monitors page — monitor groups + tag/folder filtering** — Monitors list has a collapsible group sidebar (tag and folder groups). Group rows show aggregate status badge. Tag filter bar updated to support group-level filtering.
- **Status page — Enter key submits modals** — All modals now submit the primary action on Enter key, consistent with platform conventions.

### Fixed
- **Next.js build config warning** — Removed unsupported `allowedHosts` key from `apps/web/next.config.mjs`. `npm run build` no longer prints `Invalid next.config.mjs options` warning.
- **Trust proxy for secure cookies** — API now calls `app.set('trust proxy', 1)` so secure/SameSite cookies work correctly behind nginx/Cloudflare reverse proxies.
- **GitLab version check** — GitLab CE uses `gitlab-releases` provider (not `github-releases`). Fixed auth defaults and version endpoint for GitLab self-hosted instances.
- **Case-insensitive version key extraction** — `extractVersion()` now matches `version`, `Version`, `VERSION`, etc. in JSON responses.
- **Badge embed snippets** — Embed Markdown/HTML/URL snippets now include the full domain URL (not just the path).
- **Modal focus trap regression** — Fixed Tab/Shift+Tab focus trap stealing focus from text inputs on every keystroke. Focus is now only trapped when Tab reaches the boundary.
- **socket.io proxy path** — Client socket.io path corrected to match nginx `/api/socket.io/` routing.
- **VersionDiff display** — Simplified to a compact single-line format (`v1.2.3 → v1.2.4`) rather than a large two-line diff block.
- **Tag color contrast** — Tag badges now use proper accessible color contrast across all monitor list, group, and filter surfaces.
- **Monitor template version endpoints** — Corrected version endpoints and auth defaults for all 19 self-hosted app monitor templates.
- **Status page mock coverage** — Fixed `findPublic()` unit tests: added missing `incident`, `maintenanceWindow`, and `monitorRun` (with monitor relation) mock entries that were causing 3 unit test failures and 1 integration test failure.

### Tests
- **Status-pages service spec** — Added 5 new tests covering `findPublic()` return shape: monitor tags from monitorTags relation, incident timeline mapping, maintenance window monitor links, recentChecks monitorName, and null last-run defaults.
- **Coverage** — API test suite stable at 1327 tests (1349 total incl. CLI+Agent). Statement coverage: 98.73%, branch: 95.29%, line: 100%.

---

## [1.0.1] — 2026-03-17

### Fixed
- **Degraded status visibility** — HTTP monitors with response-time threshold violations and version monitors with pending updates emit `level=yellow` (ok=true). Monitors list, dashboard table, monitor detail page, and sparkline bars previously showed these as "OK". Now all surfaces show "Degraded" (amber/warning) for yellow-level runs. Sparkline updated with amber bars at 65% height for degraded runs, and aria-label now includes degraded count.

---

## [1.0.0] — 2026-03-17

This is the first stable production release of PulseDock. All major features are complete, tested, and documented. The API surface is stable, the frontend is accessible and responsive, and the Docker/Kubernetes deployment paths are production-hardened.

### Added
- **Monitor detail — Run Now + Enable/Disable actions** — Monitor detail page was previously read-only. Added two action buttons in the header: "Run Now" (triggers an immediate check via `POST /v1/monitors/run`, auto-refreshes run history after 2.5s, disabled while monitor is paused) and "Enable/Disable" toggle (PATCH /v1/monitors/:id, color-coded warning/success). Toast notification on success (3s auto-dismiss), inline error display on failure.
- **Monitor picker in Maintenance Windows + Incidents modals** — Create and Edit modals in both Maintenance Windows and Incidents pages now include a scrollable multi-select checklist of monitors. Selecting monitors sends `monitorIds` to the API (which already supported it — this closes the UI gap). Maintenance Windows table now shows "—" instead of "0" badge when no monitors are associated.
- **Per-page document titles** — All 12 dashboard routes now have unique browser tab titles (e.g. "Dashboard — PulseDock", "Monitors — PulseDock") via Next.js layout.tsx metadata. Improves multi-tab workflows and browser history.
- **Monitor detail — HTTP/SSL/TCP config panel** — Monitor detail page now shows a type-specific configuration card: HTTP monitors display method, expected status codes, response time threshold, confirmations, body assertion, request body, and custom headers; SSL monitors show host and warning threshold; TCP monitors show host and port. Run history expanded from 20 to 50 entries.
- **Swagger API docs — CreateMonitorDto annotations** — All `CreateMonitorDto` fields documented with `@ApiProperty` including detailed `config` field examples for HTTP, HEARTBEAT, SSL, and version-provider monitors.
- **HTTP response time threshold alerting** — HTTP monitors now support `responseTimeThresholdMs` config option. When set, checks that exceed the threshold are marked **yellow (degraded)** instead of green, triggering degraded alerts. UI: new "Response time threshold (ms)" field in the HTTP monitor form.
- **HTTP custom method, headers, and request body** — HTTP monitors support `httpMethod` (GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS), `requestHeaders` (custom headers map), and `requestBody`. Enables monitoring auth-protected APIs and POST-based health endpoints.
- **HTTP body keyword + expected status assertions** — `bodyContains` and `expectedStatus` config fields for HTTP monitors. Enables monitoring JSON health APIs without the plugin system.
- **Folder/project filter and assignment on Monitors page** — Monitors can be assigned to projects/folders from the monitors list. Filter bar supports folder-based filtering alongside tags and status.
- **Agent package unit tests** — Added 12 unit tests to `@pulsedock/agent` covering BUILT_IN_CHECKS registry (tool count, command validity, specific tool assertions) and the structured logger (stdout/stderr routing, JSON format, extra fields, newline termination). Wired into root `npm run test`. Total: 1287 tests (1265 API + 10 CLI + 12 Agent).
- **Landing page v1.0.0 badge** — Hero badge on landing page updated from "Open source · Self-hosted · Version intelligence" to "v1.0.0 · Open source · Self-hosted" in both EN and DE.

### Summary of all v1.0.0 capabilities
- **Monitor types:** HTTP, TCP, SSL certificate, Heartbeat (push), Version check (GitHub, Docker Hub, npm, PyPI, Cargo, Maven, Helm, custom JSON-path)
- **Alerting:** Webhook, Slack, Discord, Telegram, Email — with notification preferences, quiet hours, digest mode, recovery alerts, failure confirmations, maintenance window suppression
- **Security:** 2FA/TOTP, CSRF protection, account lockout, email verification, password strength enforcement, strict rate limiting, audit log export, session anomaly detection, input sanitization, security headers
- **Public features:** Status page builder (drag-and-drop, 20+ widget types), SVG status badges, public API (`/v1/public/*`)
- **Incident management:** Full lifecycle (investigating → identified → monitoring → resolved), timeline updates, affected monitor linking
- **Tool registry:** 1302+ pre-configured tools across all major self-hosted categories
- **PulseDock Agent:** Local shell reporter (Docker + binary), 16 built-in checks for Proxmox, pfSense, Docker, databases, nginx, etc.
- **CLI:** `pulsedock check <url>` + monitors CRUD + config
- **Browser extension:** Chrome MV3, one-click monitor creation, API key auth
- **PWA:** Service worker, offline fallback, installability banner
- **API:** v1 + v2 versioning, 95 documented endpoints, Swagger UI at `/api/docs`
- **Infrastructure:** Docker Compose (dev + prod), Kubernetes manifests, Helm chart
- **Tests:** 1275 passing (1265 API + 10 CLI), 98%+ coverage, Playwright E2E
- **i18n:** English + German UI translations

---

## [0.9.0] — 2026-03-16

### Added
- **PulseDock Agent** — New `@pulsedock/agent` package + Docker image for local version reporting. Supports 16 built-in shell checks (Proxmox VE, pfSense, OPNsense, Unraid, OpenWRT, VyOS, TrueNAS, Docker Engine, PostgreSQL, MySQL, MariaDB, nginx, Apache, OpenSSH). Deploy via Docker or shell script. Reports via `POST /v1/agent/report` (API key auth).
- **Agent Setup UI** — Versions page tab-switcher card (Docker Run / Compose / Shell Script) shown when an agent-required tool is selected. One-click copy buttons per snippet. Link to Account settings for API key creation.
- **Target field locking** — When a tool is selected from the registry, the target field is read-only with a 'from registry' badge. Users can clear the selection to edit manually.
- **Nginx WebSocket proxy docs** — `docs/NGINX.md` with complete production nginx config: HTTPS, WebSocket proxying for socket.io (`/api/socket.io/`), security headers, gzip, and static asset caching.
- **Tool registry: 382 → 1302 tools** — Expanded with 920 additional entries covering Infrastructure (Proxmox VE, TrueNAS, Unraid, pfSense, MikroTik, VyOS, WireGuard UI, cert-manager), Security (Bitwarden Server, Teleport), Networking (BIND9, FRRouting), Database (PostgreSQL Docker, MySQL Docker), and 800+ upstream GitHub/Docker release trackers across all categories.

### Fixed
- **Daily Discord report cron** — Fixed recipient format from bare ID to `user:ID` format required by the message tool.

---

## [0.8.0] — 2026-03-16

### Added
- **Monitor search + status filter** — Monitors page now has a real-time search bar (filter by name or target URL) and a segmented status control (All / Enabled / Disabled). Filters compose with existing tag filters via AND logic. Empty state contextually shows "Clear filters" when active.
- **Incident management** — Full incident tracking lifecycle: create/edit/delete incidents with title, description, severity (LOW/MEDIUM/HIGH/CRITICAL) and status (INVESTIGATING/IDENTIFIED/MONITORING/RESOLVED). Timeline updates per incident with status transitions. Link affected monitors to incidents. Frontend `/incidents` page with expandable rows, active/resolved sections, and all CRUD modals. Nav entry added.
- **SVG status badges** — `GET /v1/public/badge/:monitorId.svg` — shields.io-style embeddable badges showing live monitor status (up/degraded/down/paused). Supports `flat`, `flat-square`, and `for-the-badge` styles, custom label override, 60s cache headers. Monitors page now shows an embed button (Shield icon) per row with Markdown/HTML/URL copy snippets.
- **Tool registry expansion: 302 → 382 tools** — Added 80 additional pre-configured entries spanning email/collaboration (Mailcow, Mailu, Stalwart Mail, Roundcube, Mailpit, Mastodon, Misskey, PeerTube, Lemmy), infrastructure/networking (NetBox, OPNsense, pfSense, OpenWrt, LibreSpeed, Speedtest Tracker, Coolify, CapRover, Dokku), database/admin tooling (pgAdmin, Adminer, CloudBeaver, InfluxDB 2.x, Garnet), and self-hosted app ecosystem additions (Paperless-ngx, Mealie, Grocy, Tandoor, ownCloud, Jellyseerr, Readarr, JupyterHub, Gitpod, Hono, Clair).

### Fixed
- **Recovery alerts never sent** — `notifyMonitorFailure()` was previously only invoked on red/yellow level changes. Monitors recovering from red or yellow to green now correctly dispatch recovery alerts through all configured channels. The `notifyOnRecovery` notification preference was already implemented but never exercised.
- **WebSocket BOLA vulnerability** — `RealtimeGateway` previously trusted a client-supplied `userId` string from the handshake query/auth. Any client knowing another user's ID could subscribe to their monitor event stream. Gateway now validates the JWT access token (from `pulsedock_token` cookie or `auth.token`) and derives the identity from the verified payload only. Cross-user subscription attempts return `{ ok: false, error: 'forbidden' }`.
- **CSRF exemption gap** — `POST /v1/auth/verify-email` and `POST /v1/auth/resend-verification` were not in the CSRF exempt list. Since both are unauthenticated (no session cookie exists when the user clicks an email link), they would 403 in a fresh browser session.
- **Next.js 16 Turbopack build failure** — Set `bundler: 'webpack'` in `next.config.mjs` to bypass a Turbopack ENOENT crash on `pages-manifest.json` and `_buildManifest.js.tmp` files present in Next.js 16. Build now completes reliably.

### Improved
- **Dashboard N+1 query eliminated** — `GET /v1/dashboard/overview` previously loaded all monitor runs without a limit. Changed to use Prisma `include: { runs: { take: 1 } }` to get latest run per monitor in a single query. Activity feed now capped at `take: 20` at the DB level instead of slicing in application code.
- **Registry quality pass** — Normalized added entries to existing category taxonomy and removed duplicate IDs, keeping tool lookup deterministic.
- **Test coverage at ceiling** — API branch coverage 94.03%, statement 98.33%, functions 99.36%, lines 100%. Only type declaration files remain uncovered (no executable code). Added edge-case tests for incidents service (null description, resolvedAt transitions) and monitors service (CSV column gaps, duplicate skipping, non-Error throws).

---

## [0.7.0] — 2026-03-16

### Added
- **Tool registry: 164 → 302 tools** — Added 138 new tools across all 17 existing categories. New additions cover Container runtime (containerd, CRI-O, KEDA, Flagger, MicroK8s, Talos, Crossplane, Cluster API), CI/CD (Argo Workflows, Dagger, Earthly, Buildkite Agent, Spinnaker, ARC, GitLab Runner, Argo Events), Database (CouchDB, Neo4j, ArangoDB, ScyllaDB, YugabyteDB, TiDB, FerretDB, EdgeDB, QuestDB, Dragonfly, Couchbase, RethinkDB), Observability (Kibana, Logstash, Fluentd, Fluent Bit, SigNoz, OpenObserve, Pyroscope, Coroot, Quickwit, OpenSearch Dashboards), Security (OPA, Kyverno, Boundary, Consul, External Secrets, Grype, Syft, Semgrep, Infisical, OpenBao, Checkov, SOPS), Networking (Cilium, Headscale, cloudflared, ZeroTier, OpenVPN, Netmaker, FRP, Unbound, CoreDNS, Technitium DNS, ingress-nginx), Storage (OpenEBS, Velero, Restic, Kopia, BorgBackup, Duplicati, SeaweedFS, JuiceFS, Ceph), CMS (KeystoneJS, Craft CMS, ProcessWire, Microweber, Cockpit CMS, Decap CMS), Communication (Jitsi Meet, BigBlueButton, LiveKit, ejabberd, Prosody, Mumble, Coturn, Gotify, ntfy), Media (Kavita, Komga, Calibre-Web, Audiobookshelf, Sonarr, Radarr, Lidarr, Prowlarr, Overseerr, Tautulli, Bazarr), Dev Tools (Deno, Bun, DevPod, Act, Hoppscotch, Gitness, Plane, AppFlowy, Excalidraw, draw.io, Mermaid, Outline, BookStack, Wiki.js, NocoDB, Baserow), Infrastructure (Vagrant, Waypoint, CDKTF, Serverless Framework, AWS CDK, Atlantis, Infracost), Messaging (Apache Pulsar, RocketMQ, NSQ, EMQX, HiveMQ, Apache NiFi), API (KrakenD, Gravitee, SuperTokens, Logto, Zitadel, Casdoor), Cloud (k3d, kind, Minikube, kubeadm). Registry is now at 84% of the 500+ launch target.

### Fixed
- **Test spec scoping regressions** — Fixed two broken spec describe blocks (`auth.controller` `refresh() — null context fallbacks` and `dashboard/public.controller` incident escalation test) that referenced outer-scope variables from a different `beforeEach`. Both now create their own local instances, ensuring isolation.

### Improved — Test Coverage
- **register() / login() email verification paths** — Added tests for `REQUIRE_EMAIL_VERIFICATION=true` flow: register sends verification email and returns `emailVerificationSent:true`; login blocks unverified users with `email_not_verified` error.
- **Docker non-Error catch branch** — Added test for `runMonitor()` Docker image check when fetch throws a non-Error (string) value — verifies generic `'Docker check failed'` fallback message.
- **CSV object payload branch** — Added test for `importExternal()` with `source=csv` and a non-string payload — verifies `JSON.stringify()` branch is taken without crash and returns `imported:0`.
- **Test count: 1192 API tests + 10 CLI = 1202 total** (up from 1115 API + 10 CLI = 1125)
- **Coverage: 98.26% stmt | 93.63% branch | 99.33% func | 100% line**

---

## [0.6.0] — 2026-03-15

### Added
- **Account lockout email notification** — When a user's account is locked after 5 consecutive failed login attempts, a branded HTML email is sent to their registered address. Email includes lockout expiry time (UTC), IP address of the attempt (when available), and a password change reminder. Fire-and-forget delivery — never blocks the login response.
- **Webhook HMAC signing** — Alert webhook channels now support an optional signing secret (`config.secret`). When set, outgoing webhook POSTs include an `X-PulseDock-Signature: sha256=<hex>` header using HMAC-SHA256. Receivers can verify payload authenticity. UI: new "Signing Secret" field in the create/edit webhook channel wizard.
- **Branded HTML emails** — All 5 MailerService email types (invite, password reset, email verification, new login, alert) now render dark-themed HTML with PulseDock logo, CTA buttons, metadata rows, and footers. Inline-CSS safe for all major email clients.

### Fixed
- **OpenVPN auth params forwarding** — `discoverCurrentVersion()` now correctly forwards `appAuthType`, `appUsername`, and `appPassword` into `detectDeployedVersion()` for OpenVPN-authenticated endpoints. Previously parameters were silently dropped, causing auth failures for OpenVPN monitors.
- **otplib v2 API compatibility** — Updated TOTP verify call to use the async `verify()` API (returns `{ valid: boolean }` object) introduced in otplib v12+. Previously used deprecated sync call that returned a raw boolean.
- **Background API startup** — `start-api.sh` now correctly backgrounds the NestJS process, preventing the web start script from blocking on API startup.

### Improved — Test Coverage
- **auth.controller** — Branch coverage improved from 78% → 88%. Added tests for CSRF token endpoint, session anomaly detection paths, and 2FA bypass scenarios.
- **monitors.service** — Branch coverage improved from 71% → 85.6%. Added 20+ tests for CSV/BetterUptime import parsers, `importExternal` error handling, and `discoverCurrentVersion` auth type branches.
- **checks.service** — Added tests for semver extraction fallback paths and prerelease comparison branches.
- **status-pages.controller** — 24 new unit tests covering all 8 endpoints: list, create, findOne, update, publish, remove, findPublic, getWidgetData. Previously publish() and getWidgetData() had 0% coverage.
- **plugin.sandbox** — Added branch coverage for error handling and sandbox isolation paths.
- **http-response-match plugin** — Improved branch coverage for regex match, header extraction, and JSON path resolution.
- **alerts.controller** — Additional branch coverage for bulk and paginated alert query paths.
- **scheduler** — Covered `N+1` eliminated tick path and concurrent dispatch failure handling.
- **validateEnv()** — 11 new unit tests covering dev fallbacks, production/staging validations, missing DATABASE_URL, short JWT secrets, and default admin password guard. Previously 0% coverage.
- **Test count: 960 → 1115 API tests** (+155 tests, +16%). Total including CLI: **1125 tests**.
- **Coverage: 96.82% stmt | 90.4% branch | 98.89% func | 98.88% line** (from 93.31% / 84.97% / 94.8% / 95.7%)

---

## [0.5.0] — 2026-03-15

### Added — Monitor Types
- **TCP port monitor** — New monitor type checks if a TCP port is open (`host:port` target). Measures connection latency. Fails on refused connection or timeout.
- **SSL certificate monitor** — Tracks TLS certificate expiry for any domain or HTTPS URL. Levels: green (>30 days), yellow (10–30 days), red (<10 days or expired). Shows days remaining in check messages.
- **Heartbeat monitor** — Push-based monitoring for cron jobs and internal services. Generates a unique token per monitor. `POST /v1/heartbeat/:token` (no auth, CSRF-exempt) updates `lastHeartbeatAt`. Alerts if no ping received within configurable timeout window. Ping URL displayed with copy button in UI.

### Added — Features
- **Maintenance windows** — Full CRUD for scheduling planned maintenance windows (name, description, startsAt, endsAt, monitorIds). Alert suppression during active windows. Frontend at `/maintenance` with status badges (Active/Upcoming/Past), create/edit modal, calendar icon empty state. Navigation item added.

### Improved — Code Quality
- **Test suite expanded to 960 tests** (950 API + 10 CLI). Previously 851.
- **Branch coverage improvements** — TOTP recovery code edge cases (invalid JSON, recovery code consumption + audit event), monitors.service version sort tiebreaker, openvpn no-credential path, tags.service update() branch paths (no-name, same-name, no-color fallback).
- **Overall coverage**: 93.31% stmt | 84.97% branch | 94.8% func | 95.7% line

---

## [0.4.0] — 2026-03-15

### Added — Security
- **2FA / TOTP** — Full TOTP two-factor authentication via `otplib`. QR code setup flow, encrypted secret storage, recovery codes (8 single-use codes), enforcement on login, and dedicated UI in Account Settings.
- **CSRF protection** — Double-submit cookie pattern. `GET /v1/auth/csrf` issues token; `CsrfMiddleware` validates `X-CSRF-Token` on all mutating routes using `timingSafeEqual`. API key / Bearer callers exempt.
- **Account lockout** — After 5 consecutive failed logins, account locks for 15 minutes. Lockout events logged to audit log with email notification.
- **Email verification** — New registrations require email verification before access. Token-based verification link, blocked login until verified.
- **Password strength enforcement** — Minimum 12 chars, upper/lower/digit/special character requirements enforced at API level. Strength indicator UI in registration form.
- **Stricter auth rate limits** — `/auth/login`, `/auth/register`, `/auth/forgot-password` now limited to 5 req/min per IP (separate from global 120/min).
- **Secure password reset** — Reset tokens are single-use, 15-minute TTL, invalidated after use, submitted via POST body (never in URL).
- **Security headers audit** — Verified HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy via Helmet config.
- **Input sanitization** — All user-provided text sanitized before render to prevent stored XSS (monitor names, descriptions, alert labels).
- **Session activity & anomaly detection** — IP + user agent logged per session. New-device login warning in active sessions UI.
- **Audit log export** — Users can export their full audit log as CSV or JSON from the account page.

### Added — Features
- **Drag-and-drop Status Page Builder** — Full-stack custom public status pages. 20 widget types (uptime bars, sparklines, incident history, version badges, response time charts, announcement blocks, etc.). `dnd-kit` canvas with resize handles, config panel per widget, publish/unpublish flow, password protection, custom slugs (`/status/[slug]`). SSR public view with 60s auto-refresh.
- **Tool Registry** — 126 pre-configured version check tools across 14 categories (Container, CI/CD, Database, Observability, Security, Networking, Storage, Dev Tools, Media, Infrastructure, Messaging, CMS, Communication, Cloud). Searchable `GET /v1/tool-registry`. ToolPicker in Versions UI. Simple Icons CDN for logos.
- **Monitor tags** — Tag monitors for filtering and grouping. Tag filter bar on monitors page, tag chips in rows, tag input (Enter/comma) in create/edit modal.
- **Bulk monitor actions** — Select multiple monitors → bulk enable/disable/delete/run-now. Checkbox per row, select-all header, bulk action bar, `POST /v1/monitors/bulk`.
- **Monitor templates** — Pre-built one-click templates for common checks (GitHub latest release, Docker Hub, npm package).
- **Response time tracking** — HTTP response time recorded per check. Trend chart per monitor. Alert threshold for slow response.
- **Check history charts** — Sparkline/bar timeline of check results per monitor.
- **More version providers** — npm (registry.npmjs.org), PyPI (pypi.org), Cargo (crates.io) added.
- **All alert channels** — Webhook, Slack, Discord, Telegram fully implemented with test-send UI.
- **Notification preferences** — Per-user settings for alert types, quiet hours, and digest frequency. Backend `NotificationsService.shouldNotify()` wired into alert dispatch.
- **Import from competitors** — `POST /v1/monitors/import-external` supports Uptime Robot JSON, BetterUptime JSON, and generic CSV. Duplicate URL detection, modal with source picker and instructions.
- **Onboarding flow** — 3-step "Get Started" checklist on dashboard for new users. Progress bar, localStorage dismiss, completion celebration.
- **User profile** — Display name + timezone fields. Editable in Account Settings.
- **i18n** — Lightweight custom i18n (no external dep). English + German translations. `LocaleSwitcher` in nav and login. Auto-detects browser locale, persists in localStorage.
- **Public status page polish** — Latency sparklines, structured incident history with durations, per-monitor uptime %, active incidents banner.
- **Admin dashboard stats** — Total monitors, total checks today, error rate, active users on admin page.

### Added — Frontend / UX
- **Accessibility audit** — Skip-to-content link, global focus-visible ring, `role="dialog"` + `aria-modal` + focus trap on modals, `aria-label` on all icon-only buttons, `aria-live` on pagination, `role="main"` + `id="main-content"` on layout.
- **Empty states** — All list pages (Monitors, Alerts, Projects, etc.) have illustrated empty states with CTA.
- **Error boundaries** — All pages have `error.tsx` with helpful messages. API errors show actionable toasts.
- **Form validation UX** — Inline validation errors on all forms. Required field indicators. Submit disabled until valid.
- **Loading states** — All data-fetching components have proper skeletons.
- **Mobile UX audit** — All 9 pages verified at 375px. Table columns progressively hidden at breakpoints. No horizontal overflow.
- **Keyboard navigation** — Full focus trap in modals, Escape closes, skip-to-content on first Tab.
- **Dark mode audit** — All hardcoded colors resolved. No invisible elements in dark theme.
- **FadeIn animations fixed** — Replaced non-functional framer-motion v12 placeholder with CSS keyframe + IntersectionObserver. All scroll-triggered animations work in React 19.

### Added — DevOps / Quality
- **Test coverage >90%** — 706 tests passing. Line coverage 90.03%, statement coverage 87.79%. `auth.service` 87%, `checks.service` 94%, `monitors.service` 83%. All controllers at 100%.
- **E2E tests (Playwright)** — `packages/e2e/` with landing, auth, dashboard, monitors test suites. `loggedIn` fixture with storage state reuse. CI workflow in `.github/workflows/e2e.yml`.
- **Helm chart** — `helm/pulsedock/` with 19 templates (API, Web, Postgres, Redis, Ingress, HPA). Auto-computes DATABASE_URL and REDIS_URL. `helm lint` clean. Documented in `docs/HELM.md`.
- **API documentation** — All 95 endpoints annotated with `@ApiOperation`, `@ApiParam`, `@ApiQuery`, `@ApiResponse`. Swagger UI live at `/api/docs`.
- **Performance** — Monitor scheduler: O(1) DB round-trips (single `findMany` with includes), concurrent dispatch via `Promise.allSettled`.
- **Log rotation** — Docker `json-file` log driver rotation in both dev and prod compose files. `LOG_LEVEL` env var filtering.
- **Kubernetes manifests** — `k8s/base` + `k8s/overlays/prod` with namespace/config/ingress/service/deployment/statefulset.
- **Browser extension** — Chrome MV3 `@pulsedock/extension` with one-click monitor creation, context menu, dark theme popup, API key auth. Documented in `docs/EXTENSION.md`.
- **CLI tool** — `pulsedock check <url>` + `monitors list/check` + `config` commands. `@pulsedock/cli` with 10 unit tests. Documented in `docs/CLI.md`.
- **Plugin system** — Typed plugin contracts/registry, `executePluginSafely` boundary with timeout + output sanitization, starter plugin `http.response-match`. Community contribution flow documented in `docs/PLUGINS.md`.
- **API v2** — Paginated/filterable endpoints for monitors, alert-channels, checks, system info, system versions.
- **WebSocket real-time** — `monitor.checked` and `alert.triggered` events pushed to dashboard/monitors pages via Socket.io.
- **PWA** — Install banner, service worker, offline fallback route (`/offline`), contextual loading skeletons.

---

## [0.3.0] — 2026-03-11

### Added
- **Complete Mantine → Tailwind migration** — Admin page fully migrated; reusable Tailwind components: `TextInput`, `CopyButton`, `AppModal`, pagination controls
- **Full UI usability overhaul** — Consistent layouts (`p-6`, `gap-6`), empty states on all pages, full-width inputs, consistent loading spinners
- **Error pages** — Global `error.tsx` boundary and `not-found.tsx` 404 page (Tailwind-styled)
- **TypeScript strict mode** — Removed all implicit `any` types; both apps compile clean under `strict: true`

### Changed
- Inline CSS cleanup — migrated `unauthorized`, `status/[userId]`, admin invite URL rendering away from inline styles

---

## [0.2.0] — 2026-03-05

### Added
- **API security hardening** — Helmet headers (CSP, HSTS, X-Frame-Options), CORS configuration, rate limiting (120 req/min per IP), structured JSON logging
- **Input validation phase 2** — Enhanced DTOs with `MaxLength`, `IsUrl()`, `@IsIn()` validators across all endpoints; global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true`
- **Metadata & OG tags** — Comprehensive `<head>` metadata and OpenGraph tags on landing page
- **Unit tests** — 27 unit tests (Vitest) for `AppController`, `MetricsService`, `AuthService`, `MonitorsService`
- **Reusable Tailwind component library** — `Card`, `Badge`, `Button`, `Table`, `Modal`, `Select`, `TextInput`, `CopyButton`
- **Frontend pages** — Alerts, Projects/Folders, Versions pages migrated to Tailwind (Mantine fully removed)

### Changed
- API: structured JSON logging replaces `console.log` throughout
- Frontend: all pages now use dark-first Tailwind design system

---

## [0.1.0] — 2026-02-15

### Added
- **Core infrastructure** — NestJS API + Next.js frontend in npm workspaces monorepo
- **Authentication** — Login, register, JWT access + refresh tokens, invite system, password reset
- **Monitor CRUD** — HTTP, GIT_RELEASE, DOCKER_IMAGE monitor types; scheduled checks via cron
- **Alert channels** — Discord, Slack, Telegram, webhook, email channels; monitor-to-channel linking
- **Version intelligence** — GitHub releases, GitLab releases, Docker image tags, APT packages; auto-detect deployed app version
- **Folder organization** — Organize monitors into folders/projects
- **Admin panel** — User management, role assignment, audit logs, invite management
- **Public status pages** — Per-user shareable status pages at `/status/:userId`
- **Tailwind CSS + Framer Motion** — Apple-like landing page, animated hero, scroll-triggered reveals, dark dashboard
- **Prisma ORM + PostgreSQL** — Full schema with migrations; Redis session store
- **Swagger/OpenAPI docs** — Auto-generated at `/docs`
- **Single root `.env`** — Shared across API and Web via workspace setup
- **Docker support** — `docker-compose.yml` for local dev with PostgreSQL + Redis

[1.6.0]: https://github.com/No749ah/PulseDock/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/No749ah/PulseDock/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/No749ah/PulseDock/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/No749ah/PulseDock/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/No749ah/PulseDock/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/No749ah/PulseDock/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/No749ah/PulseDock/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/No749ah/PulseDock/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/No749ah/PulseDock/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/No749ah/PulseDock/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/No749ah/PulseDock/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/No749ah/PulseDock/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/No749ah/PulseDock/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/No749ah/PulseDock/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/No749ah/PulseDock/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/No749ah/PulseDock/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/No749ah/PulseDock/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/No749ah/PulseDock/releases/tag/v0.1.0
