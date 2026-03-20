# Changelog

All notable changes to PulseDock are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased] — 2026-03-20 (ongoing)

### Added
- **Swagger API documentation audit** — Comprehensive pass across all 143 endpoints: added `@ApiResponse` decorators for 401 (Not authenticated), 403 (Access denied), 404 (Not found), and 400 (Validation error) where applicable. Added rich `description` strings to all `@ApiOperation` decorators explaining behaviour, parameter semantics, and edge cases. Error response annotation coverage increased from 16 → 82 annotations. Affected: incidents, maintenance, status-pages, team, tags, apikeys controllers.
- **Documentation audit** — Updated `docs/API.md`: added endpoint overview table (143 endpoints across 19 controllers), comprehensive sections for incidents, maintenance, status pages, API keys, and team endpoints. Fixed stale link. Updated `docs/TROUBLESHOOTING.md`: fixed stale references, added 3 new troubleshooting entries. Updated `docs/VERSION-CHECKS.md`: added missing `apt` and `helm` providers.

### Changed
- **Sticky table headers + column visibility** — Alerts and Versions tables now have sticky `<thead>` (stays visible while scrolling); column visibility toggle persisted to `localStorage` on both pages; Incidents table has sticky header too
- **Accessibility (a11y) — public status page widgets** — `LiveStatusRefresh`: `role="status"` + `aria-live="polite"` + descriptive `aria-label` for screen readers; decorative pulsing dots: `aria-hidden="true"`; `ServiceHealthMatrix` and `SLAComplianceTable` tables: `aria-label` + `scope="col"` on all `<th>` headers; `AggregateHealthScore` and `IncidentSeverityDistribution` SVGs: `role="img"` + `aria-label` + `<title>` element; `PerformanceTrend` sparkline SVG: `aria-hidden="true"` (value conveyed in text); color-only status dots marked `aria-hidden="true"` throughout
- **Accessibility (a11y) — public status page root** — `role="main"` on page container; skip-to-content landmark link; `role="toolbar"` on controls bar; `role="region"` + `aria-label` on all widget grid containers; `OverallSystemStatus`: `role="status"` + `aria-live="polite"` + full status description in `aria-label`; `UptimeBar`: `role="progressbar"` with `aria-valuenow/min/max`; `ComponentStatusList`: converted to `<ul>`/`<li>` with per-item descriptive `aria-label`; `ActiveIncidentBanner`: `role="alert"` + `aria-live="assertive"` when incidents active
- **Command palette (Ctrl+K)** — Fuzzy search across all app commands, navigation, create actions, and external links. Recent commands, group labels, keyboard shortcuts hints. Keyboard shortcuts modal (`?`). Both wired in root layout.
- **JSDoc** — Comprehensive `@param`/`@returns`/`@throws` annotations added to: `checks.service.ts`, `maintenance.service.ts`, `status-pages.service.ts`, `agent.service.ts`, `audit.service.ts`, `bootstrap.service.ts`, `data.service.ts`, `mailer.service.ts`, `metrics.service.ts`, `prisma.service.ts`, `backup.service.ts`, `tags.service.ts`

### Changed
- **Docs** — Tool registry count updated to 2500+ in `docs/README.md` and `docs/VERSION-CHECKS.md`

---

## [Unreleased] — 2026-03-19 (ongoing)

### Added
- **Status page subscriber emails** — Outage/degraded events now trigger email notifications to all page subscribers; recovery events are suppressed to avoid noise
- **Status page SVG badge** — `GET /v1/public/status-badge/:slug.svg` — shields.io-style badge; embed modal with Markdown/HTML/URL copy snippets on Status Pages list
- **Status page PDF export** — Print button + comprehensive `@media print` stylesheet; widget flow renders correctly as single-column PDF; report meta footer with timestamp and URL
- **Status page webhook on status change** — Page-level webhook URL in settings; fires on any status transition with full payload (slug, title, overall level, changed monitors)
- **Admin user management overhaul** — Edit modal now supports: display name, role, disable/enable, force password reset link (15-min token + copy button), remove MFA, delete user with confirmation
- **Admin user list** — MFA and unverified badges shown inline per user
- **Monitors pagination** — 10/25/50/100/All selector with localStorage persistence, prev/next + page buttons, sticky header
- **Versions page** — No double-v in update badge (`v18.9.0` not `vv18.9.0`); target column truncated with hover tooltip
- **Command palette** — 6 new commands; `⌘K` → `Ctrl K` label; selection highlight redesigned (accent left-border, no tinted text)
- **Account page** — Full-width layout (no `max-w-5xl` cap); FadeIn animations removed; columns rebalanced (API Keys left, Activity Log right)
- **Status page editor** — All 50+ widget types now have meaningful canvas previews instead of blank/italic placeholders
- **Status page editor** — Page Settings modal is now scrollable with sticky header/footer (was overflowing off-screen)
- **Status page editor** — 17 widget types added to DTO validation whitelist (offline-banner, custom-metric-chart, dependency-map, tab-container, multi-environment-status, collapsible-section, etc.) — saves were silently rejected before
- **Public status page widgets — visual overhaul** — UptimeBar shows large colored percentage + status icon + tinted border; ResponseTimeChart has a proper empty state; UptimeTimeline uses taller slimmer bars (contribution-graph style); OverallSystemStatus pulses on outage; UptimeComparisonChart bars capped at 96% to show background track
- **Dashboard version stats fix** — "Updates Available" now uses version-summary API (always latest run) instead of time-range-filtered runs — was showing 0 even when updates existed
- **API endpoints** — Admin: `POST /v1/admin/users/:id/reset-mfa`, `POST /v1/admin/users/:id/force-password-reset`, `DELETE /v1/admin/users/:id`
- **.env.example** — Comprehensive reference for all environment variables with defaults, security guidance, and comments
- **Notification bell** — Shows version update counts + monitor names; clicking navigates to the relevant page
- **Incidents page** — Search filter, sortable columns (title/status/severity/date), CSV export
- **JSDoc** — Comprehensive documentation added to status-pages, alerts, and auth services
- **Email notifications to status page subscribers** on outage/degraded events
- **Breadcrumbs** on monitor detail page; account page loading state breadcrumb
- **DEPLOYMENT.md** — Comprehensive rewrite covering Docker Compose, Kubernetes/Helm, bare metal, nginx config, env var table, health checks
- Dashboard: customizable section order (localStorage), time range selector (1h/6h/24h/7d/30d), live pulsing indicator
- Monitors: advanced filter panel (status/type/tag), sortable columns, hover quick-actions, latency column, check-now button, card view polish
- Monitors: status bar history tooltips, row expansion with check history
- Status pages: copy/paste widgets across pages (Ctrl+C/V), count-up animations on uptime cards
- Versions page: summary row, diff indicators, changelog links, sort dropdown
- Incidents: summary header, severity/status badges, duration display, empty state
- Alert channels: channel type icons, last-triggered column, improved test button
- Maintenance: upcoming calendar widget, status badges, duration display
- Account: Team Members UI, Workspace Settings UI, Data Retention card
- Team API: stub endpoints (GET/POST/DELETE /v1/team/*)
- Settings API: data retention endpoint (GET/PUT /v1/settings/retention)
- Changelog page with timeline layout and navigation entry
- Chart.js components: LineSparkline, BarChartCJS
- Loading skeletons: TableSkeleton, route loading.tsx files
- Command palette: 7 new commands, shortcut kbd badges
- Error pages: custom 404, error boundary, global-error

### Fixed
- **Backup service** — Pre-existing TS errors: wrong field names (`config` → `configJson`, `monitorTags`, removed non-existent `settings`/`enabled` fields from status page select)
- **Status page password UX** — Confirm field added; inline remove confirmation (no browser `confirm()` dialog); amber lock card for protected pages
- **Mobile landing page** — Reduced hero padding, tighter feature card spacing, comparison table scroll hint, larger nav touch targets, better font scaling

### Security
- API key scope enforcement: @RequireScope decorator + ScopeGuard
- Rate limiting: per-endpoint overrides (30/min for write ops)

### Performance
- DB indexes: AuditLog compound indexes (userId+createdAt)
- N+1 eliminated in version summary queries
- Scheduler: jitter (0-5s per monitor), queue depth tracking
- Webhook delivery: exponential backoff (1s/2s/4s)

### Tests
- 1519 total (1497 API + 10 CLI + 12 Agent) — all green
- Reports service: 11 new unit tests
- Team service: 3 unit tests
- Scope guard: 14 unit tests
- Alert delivery: 3 new coverage tests

---

## [Unreleased] — Prior

### Added
- **Tool registry expanded 1303 → 1385 tools (+82)** — New tool categories: AI/ML platforms, ERP/Business software, Search/Vector databases, IoT/Edge devices, Photo/Document services.
- **Landing page — Social Proof section** — Three-card grid (Open Source & Private, Community-Driven, Built for Self-Hosters) with GitHub CTA, placed between Open Source Banner and Pricing sections.
- **Branded 404 page** — Replaced interactive easter-egg 404 with a clean, branded `not-found.tsx` using PulseDock logo, accent-coloured 404 heading, and Dashboard/Home CTAs.
- **Breadcrumbs component** — New `apps/web/app/components/Breadcrumbs.tsx` generic breadcrumb nav component for use across dashboard pages.
- **Status page editor — universal config panel phase 2 controls** — Extended the shared widget properties sidebar with visibility rules (always/operational/degraded/outage + hide-when-no-data), click actions (none/monitor-detail/external URL), style controls (border toggle, radius, padding), and mobile behavior controls (normal/full-width/collapsed/hidden).

### Fixed
- **44 broken Simple Icons slugs** — Corrected icon slug mappings in the tool registry to match current Simple Icons v13 naming conventions.

### Changed
- **Accessibility improvements** — All hero section background blob animations changed from `animate-blob` to `motion-safe:animate-blob`. Added `aria-label` attributes to all major `<section>` elements on the landing page (Hero, Stats, Features, How it works, Screenshots, Demo, Comparison, Open source, Social proof, Pricing, CTA).

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

[Unreleased]: https://github.com/No749ah/PulseDock/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/No749ah/PulseDock/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/No749ah/PulseDock/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/No749ah/PulseDock/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/No749ah/PulseDock/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/No749ah/PulseDock/releases/tag/v0.1.0
