## Status Summary (2026-03-17 23:08 UTC)
- **Build/Test:** ✅ Clean build, full test suite passing (API+CLI+Agent)
- **Security/Audit:** ⚠️ `npm audit --audit-level=high` reports 10 moderate vulnerabilities (Next.js advisory set + transitive `file-type`/`lodash`); no high/critical.
- **Deployment:** ✅ Services restarted via `npm run restart`; post-deploy checks green.
- **This session:**
  - Completed **monitor-scope UX polish** for status widgets in the editor:
    - added widget-aware helper copy for multi-monitor mode
    - added sensible default monitor preselection when switching to multi mode (single-series widgets default to 1, aggregate widgets default up to 6)
    - normalized monitor-scope mode transitions (`single`/`multiple`/`all`) to prevent stale monitor ID config
  - Ran full heartbeat checks: `git pull origin dev`, `npm run build`, `npm run test`, `npm audit --audit-level=high`
  - Post-deploy verification:
    - local health/API: `/health` 200, `/v1/auth/me` with Bearer header 401 (expected invalid token)
    - local web/proxy: `/login` 200, `/api/v1/monitors` via web proxy 401 (expected unauthenticated)
    - local route audit: `/login /dashboard /monitors /alerts /account /projects /versions /admin` all 200
    - reverse-proxy route audit: same routes on `https://oc-dev-test.no749ah.com` all 200
    - reverse-proxy static assets from `/login` (`/_next/static/...`) all 200

# PulseDock Backlog

## ⚠️ INSTRUCTION FROM NOAH (2026-03-17, updated)

**The project is NOT done. Not even close.**
**Work on this until EVERYTHING is perfect — every enterprise tool in the registry, every widget type implemented, every UI pixel polished.**
**Self-optimize: after every task, critically review your own work. Would a Fortune 500 pay for this? If not, improve.**
**Keep adding to this backlog when you discover gaps. Never stop improving.**
**Do not propose new projects. PulseDock is the focus until it's genuinely world-class.**

---

## In Progress

- [ ] **Uptime Timeline with real data** — Per-day status bars from actual MonitorRun records. Green=all checks OK, yellow=some failed, red=majority failed. API returns day-by-day breakdown.

## Recently Completed

- [x] **Monitor-scope UX polish for status widgets** — Added widget-specific multi-monitor helper text, sensible default monitor preselection on mode switch, and clean monitor-scope mode transitions (`single`/`multiple`/`all`) so config stays coherent.

- [x] **Multi-Monitor Picker component** — Added reusable status-page editor picker with checkbox multi-select, search input, tag/folder/type filters, select-all/clear-filtered controls, and selected-count badge. Wired into config panel for `monitorMode = multiple`.

- [x] **Uptime Bar with real data** — public status-page uptime widget now consumes live per-widget API data (`/v1/public/status/:slug/widget/:widgetId`) and renders real `uptimePct` + period + check count instead of status-derived placeholders.

- [x] **Public status page layout parity with editor grid** — public renderer now uses true responsive grid layout with editor coordinates (`x/y/w/h`): 12-col desktop, 6-col tablet with collision-safe placement, and 1-col mobile flow. Visibility/hide-no-data rules are applied before layout so only renderable widgets occupy grid slots.

- [x] **Universal Config Panel for ALL widget types** — completed end-to-end: shared monitor scope selector + filters + visibility/click/style/responsive controls in editor, runtime wiring in public renderer (visibility filtering, hide-when-no-data, click actions, mobile behavior), and per-widget conditional control visibility in config panel.

- [x] **Auth controller spec stabilization (request context)** — Updated `auth.controller.spec.ts` invite/reset test calls to pass `req` alongside `res` after controller method signature changes. Test suite is green again.

- [x] **Next.js build warning cleanup (`allowedHosts`)** — Removed unsupported `allowedHosts` key from `apps/web/next.config.mjs` (Next.js 16 no longer recognizes this option). Build is now clean without config warnings.

- [x] **Coverage sweep: auth/checks/monitors edge branches** — Added focused unit tests for `AuthService` token/session/profile/verify edge paths, semver prerelease mixed-part comparison in `ChecksService`, and CSV/import parser edge cases in `MonitorsService`. API tests: 1308 → 1327 (total suite: 1349 incl. CLI+Agent), all green.

- [x] **HTTP body keyword + expected status assertions** — `runHttpCheck()` now accepts `config.bodyContains` (response body must contain string, case-insensitive) and `config.expectedStatus` (exact status code or array of codes). Monitor create/edit UI shows both fields for HTTP monitors. 8 new tests (total: 1264). This enables monitoring JSON API health payloads without the plugin system.

- [x] **Monitor failure confirmations (debounce alert noise)** — Added per-monitor `confirmations` setting (1–5) across API DTOs, service layer, Prisma schema + migration, scheduler/check runtime type mapping, and Monitors UI create/edit flow. Alerting logic now triggers only when unhealthy streak crosses the configured threshold (and avoids repeated alerts after threshold is already crossed). Added focused tests covering first-failure suppression, threshold crossing, default immediate mode, and no-repeat behavior.

- [x] **Incident management + SVG status badges** — Full incident tracking: Prisma schema (Incident, IncidentUpdate, IncidentMonitor + enums), migration, backend CRUD API (`/v1/incidents`), incidents service with timeline updates and monitor linking. Public SVG badge endpoint (`GET /v1/public/badge/:monitorId.svg`) — shields.io-style flat/flat-square/for-the-badge styles, live up/degraded/down/paused status with colour coding, 60s cache. Frontend `/incidents` page: create/edit/delete/post-update modals, status/severity badges, expandable rows with timeline + affected monitors, active/resolved sections. Monitors page: embed badge button (Shield icon) per row with Markdown/HTML/URL copy snippets. Nav updated with AlertOctagon icon.

- [x] **Tool registry expansion: 302 → 382 tools** — Added 80 additional pre-configured tools across existing categories with broad self-hosting coverage: Email/Comms (Mailcow, Mailu, Stalwart Mail, Roundcube, Mailpit, Mastodon, Misskey, PeerTube, Lemmy), Infra & networking (NetBox, OPNsense, pfSense, OpenWrt, LibreSpeed, Speedtest Tracker, Coolify, CapRover, Dokku), data/admin (pgAdmin, Adminer, CloudBeaver, InfluxDB 2.x, Garnet), home/self-hosted apps (Paperless-ngx, Mealie, Grocy, Tandoor, ownCloud), and additional media/dev ecosystem tools (Jellyseerr, Readarr, Mylar3, Stremio Server, JupyterHub, Gitpod, Hono, Clair). Registry now has 382 unique tools with no duplicate IDs.

- [x] **Test suite stabilization (scoping regressions)** — Fixed two broken spec blocks introduced outside their parent `describe` scopes: `auth.controller.spec.ts` (undefined `authService`) and `dashboard/public.controller.spec.ts` (undefined `prisma`). Added local test setup inside each standalone block so tests no longer rely on outer-scope variables. Result: API tests back to green (49/49 files, 1192/1192 tests).

- [x] **Tool registry expansion: 164 → 302 tools** — Added 138 new tools across all 17 categories: Container (containerd, CRI-O, KEDA, Flagger, MicroK8s, Talos, Crossplane, Cluster API), CI/CD (Argo Workflows, Dagger, Earthly, Buildkite Agent, Spinnaker, ARC, GitLab Runner, Argo Events), Database (CouchDB, Neo4j, ArangoDB, ScyllaDB, YugabyteDB, TiDB, FerretDB, EdgeDB, QuestDB, Dragonfly, Couchbase, RethinkDB), Observability (Kibana, Logstash, Fluentd, Fluent Bit, SigNoz, OpenObserve, Pyroscope, Coroot, Quickwit, OpenSearch Dashboards), Security (OPA, Kyverno, Boundary, Consul, External Secrets, Grype, Syft, Semgrep, Infisical, OpenBao, Checkov, SOPS), Networking (Cilium, Headscale, cloudflared, ZeroTier, OpenVPN, Netmaker, FRP, Unbound, CoreDNS, Technitium DNS, ingress-nginx), Storage (OpenEBS, Velero, Restic, Kopia, BorgBackup, Duplicati, SeaweedFS, JuiceFS, Ceph), CMS (KeystoneJS, Craft CMS, ProcessWire, Microweber, Cockpit CMS, Decap CMS), Communication (Jitsi Meet, BigBlueButton, LiveKit, ejabberd, Prosody, Mumble, Coturn, Gotify, ntfy), Media (Kavita, Komga, Calibre-Web, Audiobookshelf, Sonarr, Radarr, Lidarr, Prowlarr, Overseerr, Tautulli, Bazarr), Dev Tools (Deno, Bun, DevPod, Act, Hoppscotch, Gitness, Plane, AppFlowy, Excalidraw, draw.io, Mermaid, Outline, BookStack, Wiki.js, NocoDB, Baserow), Infrastructure (Vagrant, Waypoint, CDKTF, Serverless Framework, AWS CDK, Atlantis, Infracost), Messaging (Apache Pulsar, RocketMQ, NSQ, EMQX, HiveMQ, Apache NiFi), API (KrakenD, Gravitee, SuperTokens, Logto, Zitadel, Casdoor), Cloud (k3d, kind, Minikube, kubeadm).

- [x] **Fix maven/helm testVersionConnection handlers** — Added explicit maven (Maven Central solrsearch API) and helm (Artifact Hub API) branches in `testVersionConnection()` — previously both providers silently fell through to Docker Hub, returning wrong data. Replaced 2 stale `as never` test hacks with 8 proper tests covering happy paths, empty-result, API errors, and invalid target formats. Tests: 953 → 963.

- [x] **Status Pages build stabilization** — Fixed failing web build by removing obsolete conflicting route `app/status/[userId]` (conflicted with new slug route `app/status/[slug]`) and repairing corrupted JSX references in status page editor (`widget.type`, `widget.config.label`, size display string). Build now passes and all tests green.

- [x] **Scheduler perf: eliminate N+1 queries + concurrent monitor checks** — Refactored `ChecksScheduler.tick()` to load all enabled monitors with their latest run in a single `findMany` (one DB round-trip instead of N+1). Due monitors now dispatched concurrently via `Promise.allSettled` rather than sequentially. Added structured logger for failed-tick warnings.

- [x] **Fix FadeIn animation component** — Replaced no-op placeholder (caused by framer-motion v12 / React 19 typing incompatibility) with CSS keyframe + Intersection Observer implementation. All scroll-triggered entrance animations on landing, login, dashboard, and monitors pages now work correctly. Dependency-free, performant, React 19 compatible.

- [x] **Browser extension** — Chrome MV3 extension (`@pulsedock/extension`) with one-click monitor creation, context menu integration, dark theme popup, API key auth, settings panel, and dashboard shortcut. Documented in `docs/EXTENSION.md`.
- [x] **CLI tool** — `pulsedock check <url>` one-shot HTTP checker + `monitors list/check` + `config` commands. New package `@pulsedock/cli` with 10 unit tests, fully wired into root build/test, documented in `docs/CLI.md`.
- [x] **Mobile-responsive PWA improvements** — Added contextual loading skeletons for Monitors/Dashboard/Alerts, installability banner (`beforeinstallprompt` + iOS hint), service worker registration, and offline fallback route (`/offline`) with cached offline support.
- [x] **Add proper API versioning strategy** — Implemented v2 API surface: `GET /v2/monitors` (paginated + filtering + sorting), `GET /v2/alert-channels` (paginated + usedByCount + secret redaction), `GET /v2/checks` (paginated check history + date-range + level filters), `GET /v2/system/info`, `GET /v2/system/versions`. v1 unchanged. 89 integration tests passing.
- [x] **Plugin system for custom monitor types** — Delivered plugin contracts/registry/sandbox + plugin execution path, added starter plugin (`http.response-match`), exposed plugin metadata + config UX in Monitors UI, and documented packaging/verification flow (`docs/PLUGINS.md`).
- [x] **Docker Compose / Kubernetes manifests for production** — Added production deployment docs, fixed compose prod env keys, and shipped baseline Kubernetes manifests (`k8s/base` + `k8s/overlays/prod`) with ingress/service/deployment/statefulset resources.
- [x] **WebSocket support for real-time monitor updates** — Added server push for check + alert activity (`monitor.checked`, `alert.triggered`) and frontend live subscriptions on Dashboard/Monitors with immediate UI updates.

## Next Up (Priority Order)

> **NOTE:** Items marked 🔴 are critical for production. Do not skip them.

---

### 🔴 SECURITY — Critical Gaps

- [x] **2FA / TOTP (Two-Factor Authentication)** — Implement TOTP-based 2FA (e.g. via `otplib`). Add setup flow (QR code + secret), verify endpoint, enforce on login if enabled. Store encrypted TOTP secret per user. Add recovery codes. UI: Account settings page.
- [x] **CSRF Protection** — Double-submit cookie pattern implemented. `GET /v1/auth/csrf` issues non-httpOnly cookie + returns token. `CsrfMiddleware` validates `X-CSRF-Token` header against cookie on all mutating routes (timingSafeEqual). Web `api.ts` auto-injects token. API key / Bearer callers exempt.
- [x] **Account lockout after failed login attempts** — After 5 consecutive failed logins, lock account for 15 minutes. Log lockout events to audit log. Notify user via email.
- [x] **Email verification on registration** — New users must verify their email before accessing the app. Send verification link via email. Block login until verified.
- [x] **Password strength enforcement** — Enforce minimum 12 chars, complexity rules (upper/lower/digit/special). Show strength indicator in UI. Reject weak passwords at API level.
- [x] **Stricter rate limiting on auth endpoints** — Auth routes (`/auth/login`, `/auth/register`, `/auth/forgot-password`) need much tighter limits (e.g. 5 req/min per IP), separate from the global 120/min limit.
- [x] **Audit log export (CSV/JSON)** — Users/admins can export their audit log. Useful for compliance. Add export button on audit log page.
- [x] **Session activity & anomaly detection** — Log IP + user agent per session. Warn user if new login from unknown IP/device. Show in active sessions list.
- [x] **Secure password reset flow review** — Ensure reset tokens are: single-use, short-lived (15min), invalidated after use, and not exposed in URLs (use POST body instead).
- [x] **Security headers review** — Audit helmet config: ensure `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` all set correctly.
- [x] **Input sanitization for stored content** — Sanitize all user-provided text that gets rendered in UI (monitor names, descriptions, etc.) to prevent stored XSS.

---

### 🟠 FRONTEND / UX — Major Gaps

- [x] **Accessibility (a11y) audit and fixes** — Added skip-to-content link, global focus-visible ring (CSS), `role="dialog"` + `aria-modal` + `aria-labelledby` + focus-trap (Tab/Shift+Tab) to both Modal components, `aria-label` on all icon-only buttons (Edit/Delete in alerts/projects tables, pagination prev/next), `aria-live="polite"` on pagination counters, `aria-label` on navigation + user menu button, `id="main-content"` + `role="main"` on main layout area.
- [x] **Empty states for all pages** — Every list page (Monitors, Alerts, Projects, etc.) needs a proper empty state with illustration, message, and CTA ("Create your first monitor →"). Currently likely just blank.
- [x] **Error boundaries and user-friendly error pages** — Ensure all pages have error.tsx with helpful messages. API errors should show toast with actionable info, not just "Something went wrong".
- [x] **Form validation UX** — All forms should show inline validation errors, not just top-level. Required field indicators. Disable submit until valid.
- [x] **Onboarding flow for new users** — 3-step "Get Started" checklist on dashboard: create monitor → set up alert channel → explore dashboard. Progress bar, per-user localStorage dismiss, all-done celebration banner. Auto-marks steps complete from real API data.
- [x] **Loading states consistency** — Audit every data-fetching component. Ensure all have proper loading skeletons, not just spinners or blank screens.
- [x] **Toast / notification system** — Ensure all success/error actions show consistent toasts. No silent failures.
- [x] **Mobile UX audit** — Audited all 9 pages at 375px. Fixed: monitors/versions table columns progressively hidden at sm/md/lg breakpoints (Name+Status+Action always visible), versions page header buttons responsive text (New vs Create version check), admin metrics grid-cols-1 sm:grid-cols-3. All 8 pages return 200, no horizontal overflow.
- [x] **Keyboard navigation** — Modals (both Modal.tsx and modal-framework.tsx) now trap focus with Tab/Shift+Tab cycle and close on Escape. Skip-to-content link visible on first Tab press. Global focus-visible ring ensures all interactive elements show keyboard focus indicator.
- [x] **Dark mode consistency audit** — Check all pages/components for hardcoded colors that don't respect dark mode. Fix any white-on-white or invisible elements.

---

### 🟡 FEATURES — Missing / Incomplete

- [x] **More version providers** — Added npm (registry.npmjs.org), PyPI (pypi.org/pypi/{pkg}/json), Cargo (crates.io). Maven Central + Helm TBD.
- [x] **Webhook alert channel** — Webhook URL config + HTTP POST with JSON payload implemented in `alerts.service.ts`. UI supports create/edit/test flow.
- [x] **Slack alert channel** — Slack incoming webhook URL config implemented. UI + backend complete.
- [x] **Discord alert channel** — Discord webhook URL config + embed payload implemented. UI + backend complete.
- [x] **Telegram alert channel** — Bot token + chat ID implemented via Telegram Bot API. UI + backend complete.
- [x] **Public status page polish** — Added latency sparklines (inline SVG per monitor), structured incident history (active + resolved with durations), per-monitor uptime%, active incidents banner. Custom domain support deferred (infra work).
- [x] **Monitor groups / tags** — Prisma Tag + MonitorTag models, migration applied. API: GET/POST/PATCH/DELETE /v1/tags, monitors list/create/update accept tags[]. UI: tag filter bar on monitors page, tag chips in rows, tag input (Enter/comma) in create+edit modal.
- [x] **Bulk actions** — Select multiple monitors → bulk enable/disable/delete/run now. Checkbox per row + select-all header, bulk action bar, POST /v1/monitors/bulk API endpoint.
- [x] **Monitor templates** — Pre-built templates for common checks (GitHub latest release, Docker Hub, npm package). One-click setup.
- [x] **Response time tracking** — Record and display HTTP response time per check. Show trend chart. Alert if response time exceeds threshold.
- [x] **Check history charts** — Visual timeline of check results per monitor. Show success/fail over time as a sparkline or bar chart.
- [x] **Public Status Page Builder (Drag & Drop)** — Delivered: Prisma schema + migration, full CRUD API (create/update/publish/delete/public endpoint), drag-and-drop editor (`dnd-kit`, 20 widget types, resizable/repositionable), public view at `/status/[slug]` (SSR, auto-refresh), publish flow + slug management, password protection (bcrypt), status-pages list+create UI. 7 integration tests added.

  <details>
  <summary>Full Feature Spec</summary>

  **Goal:** Allow admins to build a fully customizable public status page from a set of widgets. The page can be published and shared with a public URL — no login required for viewers.

  **Editor (Admin only — `/status/[id]/edit`):**
  - Drag-and-drop canvas using a grid-based layout (e.g. `react-grid-layout` or `dnd-kit` + custom grid)
  - Widget palette on the left sidebar — drag widgets onto the canvas
  - Each widget is resizable and repositionable
  - Click any widget to open its config panel (right sidebar)
  - Toolbar: Save draft, Preview, Publish/Unpublish, Share link, Duplicate page, Delete page
  - "Add Page" button to create multiple independent status pages

  **Available Widgets:**
  | Widget | Description | Config options |
  |--------|-------------|----------------|
  | **Uptime Bar** | Shows uptime % over a selectable period | Monitor selector, time range (7/30/90d), label, show % toggle |
  | **Uptime Timeline** | 90-day bar chart (green/red per day) | Monitor selector, day count, tooltip on hover |
  | **Response Time Chart** | Sparkline or area chart of latency over time | Monitor selector, time range, chart type, threshold line |
  | **Response Time Heatmap** | Hour-of-day × day-of-week latency heatmap | Monitor selector, color scale |
  | **Current Status Badge** | Green/yellow/red pill indicator | Monitor selector, label, show latency, show last checked |
  | **Multi-Monitor Status Grid** | Grid of badges for multiple monitors at once | Monitor multi-select, columns count, compact/detailed |
  | **Incident History** | Paginated list of past incidents with duration/cause | Max shown, filter by tag/monitor, show resolved toggle |
  | **Active Incident Banner** | Full-width banner when something is currently down | Monitors to watch, custom "all clear" message |
  | **Monitor Group Status** | Overview of a tag/group (all green / X degraded / X down) | Tag selector, compact/detailed, show monitor list |
  | **Version Check Widget** | Shows tracked version + last checked timestamp | Monitor selector, show changelog link, show "latest" label |
  | **Update Status Badge** | "Up to date ✓" / "Update available ↑ vX.Y.Z" | Monitor selector, link to release notes |
  | **Version Comparison Table** | Side-by-side: current vs latest for N monitors | Monitor multi-select, show delta column |
  | **Overall System Status** | Auto-computed hero status: Operational / Degraded / Outage | Monitors to include, custom labels per state |
  | **SLA Summary** | Shows SLA target vs actual for a period | Monitor, SLA target %, period, color-code pass/fail |
  | **Check History Feed** | Live-updating log of recent check results | Monitor selector, max rows, show status icon + latency |
  | **Text / Announcement Block** | Free text (markdown supported) for maintenance notes | Text editor, optional expiry date/time, style (info/warn/danger) |
  | **Scheduled Maintenance** | Shows upcoming or active maintenance windows | Date range, affected monitors, custom message |
  | **Last Updated Footer** | "Last updated X seconds ago" with refresh button | Format options, auto-refresh interval |
  | **Custom Header / Logo** | Page title, subtitle, logo/favicon | Text, image upload (stored as base64 or object storage), link URL |
  | **Metric Counter** | Single big stat (e.g. "99.9% uptime last 30 days") | Monitor, metric type, period, prefix/suffix, decimal places |
  | **Metric Comparison Row** | N metric counters in a horizontal strip | Multiple monitors + metrics, label each |
  | **Embed / iFrame Block** | Embed an external URL (e.g. Grafana panel) | URL, height, sandbox policy |
  | **Divider / Spacer** | Visual separator or empty space | Height, optional label, style (line/dots/none) |
  | **Countdown** | Countdown to a planned event (e.g. maintenance end) | Target datetime, label, hide after expiry |

  **Editor UX details:**
  - Grid: 12-column responsive grid, min widget height 1 row = 80px
  - Snap-to-grid while dragging, resize handles on all 4 corners
  - Multi-select widgets (Shift+click) → group move/align/distribute
  - Undo/Redo (Ctrl+Z / Ctrl+Y), keyboard shortcuts panel
  - Widget lock (prevent accidental moves), widget duplicate
  - Page-level settings panel: background color, font, accent color, favicon, custom CSS (advanced)
  - Responsive preview toggle: Desktop / Tablet / Mobile view in editor
  - Real-time collaboration placeholder (future: OT/CRDT — note in spec for later)
  - Template gallery: start from pre-built layouts (Minimal, Full Dashboard, Incident Page, SLA Report)

  **Public View (`/status/[slug]`):**
  - Renders the published layout — read-only, no auth required
  - Auto-refreshes data every 60s (SSE or polling)
  - Mobile-responsive: single column on small screens
  - Shows "Last updated: X seconds ago" footer
  - Optional password protection (admin sets a passphrase)
  - Custom slug support (e.g. `/status/my-company`)
  - SEO-friendly: proper meta tags, OG image

  **Data model additions (Prisma):**
  - `StatusPage { id, userId, slug, title, description, isPublished, passwordHash?, layout (JSON), createdAt, updatedAt }`
  - `layout` stores: `{ widgets: [{ id, type, x, y, w, h, config: {} }] }`

  **API endpoints:**
  - `GET /v1/status-pages` — list my pages
  - `POST /v1/status-pages` — create page
  - `PATCH /v1/status-pages/:id` — update layout/config
  - `POST /v1/status-pages/:id/publish` — publish/unpublish
  - `DELETE /v1/status-pages/:id`
  - `GET /v1/public/status/:slug` — public data endpoint (no auth)
  - `GET /v1/public/status/:slug/widget/:widgetId` — individual widget data

  **Implementation order:**
  1. DB schema + migrations
  2. API endpoints + widget data resolvers
  3. Drag-and-drop editor (dnd-kit recommended — already tree-shakeable)
  4. Widget components (public view)
  5. Public route + SSR/ISR rendering
  6. Publish flow + slug management
  7. Password protection
  8. Custom slug + OG image generation

  </details>

- [x] **Tool Registry — Pre-configured Version Check Library** — Delivered: 126 tools across 14 categories (Container, CI/CD, Database, Observability, Security, Networking, Storage, Dev Tools, Media, Infrastructure, Messaging, CMS, Communication, Cloud). Searchable `GET /v1/tool-registry` API (filter by q + category). ToolPicker UI integrated in Versions page. Simple Icons CDN for icons. 5 integration tests. Notable tools: Prometheus, Loki, Vault, Keycloak, Gitea, ArgoCD, Jellyfin, Immich, n8n, MinIO, Nextcloud, AdGuard, Pi-hole, Caddy, RabbitMQ, NATS, Terraform, OpenTofu, and more.

  <details>
  <summary>Full Feature Spec</summary>

  **Goal:** Zero-config version monitoring for all major tools. Instead of manually finding a tool's version API, users pick from a searchable catalog. PulseDock already knows where to fetch the version, what the JSON path is, what the latest release endpoint is, and even what the project looks like.

  **UX Flow:**
  1. User clicks "New Monitor" → selects "Version Check"
  2. Modal shows **Tool Picker** as first step (searchable gallery)
  3. User searches (e.g. "gitlab") → sees GitLab CE card with icon + description
  4. Clicks it → form pre-fills: name, version URL, JSON path, latest-version source, check interval
  5. User only needs to enter: **their instance URL** (or leave blank for cloud-hosted tools)
  6. Save → monitor is live

  **Tool Picker UI:**
  - Search bar with instant filtering (name, category, tags)
  - Category filters: `Self-hosted` · `Cloud` · `Database` · `CI/CD` · `Infra` · `Security` · `Observability` · `CMS` · `Dev Tools` · `Container` · `Network` · `Storage`
  - Grid view: icon + name + category badge + short description
  - "Custom" tile always available at end for manual config
  - Verified badge on official/maintained entries
  - Community-contributed entries (future: submission flow)

  **Registry data model** (static JSON file bundled with app, updateable via PR):
  ```json
  {
    "id": "gitlab-ce",
    "name": "GitLab CE",
    "category": "CI/CD",
    "tags": ["git", "devops", "self-hosted"],
    "icon": "https://cdn.../gitlab.svg",  // or bundled in /public/tool-icons/
    "description": "Open-source DevOps platform",
    "homepage": "https://gitlab.com",
    "versionSource": {
      "type": "json-path",
      "urlTemplate": "{{instanceUrl}}/api/v4/version",
      "jsonPath": "$.version",
      "authRequired": false
    },
    "latestSource": {
      "type": "github-releases",
      "repo": "gitlab-org/gitlab-foss"
    },
    "docsUrl": "https://docs.gitlab.com/ce/api/version.html",
    "checkInterval": 3600
  }
  ```

  **Source types supported:**
  | Type | Description |
  |------|-------------|
  | `json-path` | Fetch URL, extract value via JSONPath |
  | `github-releases` | Latest release from GitHub API (`/releases/latest`) |
  | `github-tags` | Latest tag from GitHub API |
  | `docker-hub` | Latest tag from Docker Hub API |
  | `npm-registry` | Latest version from registry.npmjs.org |
  | `pypi` | Latest version from pypi.org |
  | `apt-release` | Parse Debian/Ubuntu package version |
  | `html-scrape` | Regex extract from HTML page (fallback) |
  | `custom-endpoint` | User-defined URL + path (for "Custom" tile) |

  **Initial tool list (target: 500+ at launch, prioritized):**

  **Container / Orchestration:**
  Portainer, Rancher, Kubernetes, k3s, k0s, Docker Engine, Podman, Nomad, Fleet, OpenShift, Lens

  **CI/CD:**
  GitLab CE, Gitea, Forgejo, Gogs, Jenkins, Drone CI, Woodpecker CI, Tekton, ArgoCD, FluxCD, GoCD, TeamCity, Concourse CI

  **Databases:**
  PostgreSQL, MySQL, MariaDB, MongoDB, Redis, InfluxDB, TimescaleDB, CockroachDB, Cassandra, Elasticsearch, OpenSearch, ClickHouse, DuckDB, Valkey, KeyDB, Meilisearch, Typesense, SurrealDB

  **Observability / Monitoring:**
  Grafana, Prometheus, Alertmanager, Loki, Tempo, VictoriaMetrics, Zabbix, Nagios, Checkmk, Uptime Kuma, Netdata, Graylog, OpenTelemetry Collector, Jaeger, Zipkin

  **Security:**
  Vault (HashiCorp), Vaultwarden, Bitwarden, Passbolt, Keycloak, Authelia, Authentik, CrowdSec, Fail2Ban, Wazuh, Trivy, Clair, Falco, OpenVAS

  **Networking / Proxy:**
  Nginx, Nginx Proxy Manager, Traefik, Caddy, HAProxy, Envoy, Istio, Linkerd, Pi-hole, AdGuard Home, WireGuard, Tailscale, Cloudflare WARP, Netbird

  **Storage:**
  MinIO, Nextcloud, Seafile, Syncthing, Rclone, TrueNAS SCALE, OpenMediaVault, Longhorn, Rook/Ceph, Garage

  **CMS / Web:**
  WordPress, Ghost, Strapi, Directus, Payload CMS, Pocketbase, Appwrite, Supabase, Plausible Analytics, Umami, Matomo, Fathom

  **Dev Tools / IDE:**
  Gitea, code-server, Coder, Jupyter, JupyterHub, Gitpod, Windmill, n8n, Node-RED, Temporal, Prefect, Airflow

  **Communication:**
  Mattermost, Rocket.Chat, Matrix Synapse, Element, Zulip, Discourse, Revolt, XMPP (Prosody/ejabberd)

  **Media / Home:**
  Jellyfin, Plex, Emby, Immich, Photoprism, Navidrome, Owncast, Frigate, Home Assistant, OpenWRT

  **Infrastructure:**
  Terraform, OpenTofu, Ansible, Pulumi, Salt, Chef, Puppet, Packer

  **Queue / Messaging:**
  RabbitMQ, Kafka, NATS, Redpanda, Mosquitto, ActiveMQ, ZeroMQ

  **API / Backend:**
  Kong, APISIX, Tyk, Hasura, PostgREST, PocketBase, Hono, Fastify, NestJS

  **Implementation plan:**
  1. Create `/packages/tool-registry/` — JSON files organized by category, loader, TypeScript types
  2. Bundle icon sprites or use a CDN (Simple Icons covers ~90% of logos)
  3. API endpoint: `GET /v1/tool-registry` — returns full list (filterable), cached in memory
  4. UI: ToolPicker component (searchable grid modal)
  5. Wire into "New Monitor" flow as step 1
  6. Auto-populate form fields when tool selected
  7. "Suggest a tool" link → opens GitHub issue template (pre-filled)
  8. Admin can add custom registry entries per instance (private tools)
  9. Periodic community-maintained updates via GitHub PRs to registry JSON

  </details>

- [x] **i18n / Internationalization** — Custom lightweight i18n context (no external dependency). EN + DE translations for landing page and login page. I18nProvider with localStorage persistence + browser locale auto-detection. LocaleSwitcher component in nav and login header. Type-safe message catalog in `lib/i18n/messages.ts`.
- [x] **User profile page improvements** — Display name + timezone fields added. Prisma migration, API /v1/auth/profile PATCH updated, account page shows editable display name, email, timezone dropdown.
- [x] **Admin dashboard improvements** — Show system stats: total monitors, total checks today, error rate, active users. Useful for self-hosted instances.
- [x] **Notification preferences** — Per-user settings: which alert types to receive, quiet hours, notification frequency (instant vs digest). Backend `NotificationsService.shouldNotify()` wired into `AlertsService.notifyMonitorFailure()` — alerts now respect user preferences, quiet hours, and digest frequency. Alert text improved with level-appropriate emoji (🚨/⚠️/✅). 5 new tests added (204 total).
- [x] **Import from Uptime Robot / BetterUptime** — Let users migrate from competitors by importing their monitors via JSON/CSV. Implemented `POST /v1/monitors/import-external` supporting Uptime Robot JSON, BetterUptime JSON, and generic CSV. Frontend modal with source picker + instructions. Duplicate URL detection, disabled monitor support. 6 tests added.
- [x] **Maintenance Windows** — Full CRUD for scheduling maintenance windows (name, description, startsAt, endsAt, monitorIds). Backend: `GET/POST/PATCH/DELETE /v1/maintenance` + `/active` endpoint. Alert suppression during active windows. Frontend: `/maintenance` page with status badges (Active/Upcoming/Past), create/edit modal, calendar icon empty state. Nav item added.
- [x] **TCP, SSL Certificate, Heartbeat monitor types** — Added 3 new monitor types: TCP port check (net.createConnection, latency), SSL certificate expiry (TLS cert days remaining, green >30d / yellow 10-30d / red <10d), Heartbeat (push-based, `POST /v1/heartbeat/:token` public endpoint, configurable timeout window). Prisma enum migration, CSRF exempt prefix, HeartbeatController, frontend form with conditional fields and ping URL copy button.

---

### 🟢 CODE QUALITY / DEVOPS

- [x] **Increase test coverage to >90%** — 706 tests passing. Line coverage at 90.03%, statement coverage 87.79%. auth.service 87%, checks.service 94%, monitors.service 83%, all controllers at 100%. Achieved via systematic subagent coverage sprints across all major services.
- [x] **E2E tests (Playwright)** — `packages/e2e/` with landing, auth, dashboard, monitors test suites. `loggedIn` fixture with storage state reuse. CI workflow `.github/workflows/e2e.yml` with artifact upload. Documented in `docs/E2E.md`.
- [x] **API documentation improvements** — All 95 endpoints have `@ApiOperation`, `@ApiParam`, `@ApiQuery`, `@ApiResponse` decorators (122 response annotations). Swagger UI live at `/api/docs`.
- [x] **Performance profiling** — Profile API under load. Check for slow queries, missing DB indexes (especially on monitor runs table). Add indexes where needed.
- [x] **Log rotation & cleanup** — Docker json-file log driver rotation configured in docker-compose.prod.yml (api: 20MB×5, web: 10MB×5, postgres: 10MB×3) and dev (api: 20MB×3, web: 10MB×3). Logger enhanced with LOG_LEVEL env var filtering (debug/info/warn/error) and process.stdout.write for clean JSON-per-line. Comprehensive docs/LOGGING.md covers PM2, systemd+logrotate, and log aggregation options (Loki, ELK, etc).
- [x] **Helm chart for Kubernetes** — `helm/pulsedock/` with 19 templates (API, Web, Postgres, Redis, Ingress, HPA, ConfigMap, Secret, helpers). Auto-computes DATABASE_URL and REDIS_URL. `helm lint` clean. Full values reference in `docs/HELM.md`.

---

### Blocked/On Hold
- [x] **Fix all npm audit vulnerabilities** — HIGH severity hono vulns resolved upstream (hono updated via @prisma/dev). Remaining: 9 moderate vulns (`file-type` via @nestjs/common, `lodash` via @prisma/dev) — both require breaking changes (NestJS v11 or Prisma downgrade). Monitoring for upstream fixes.

---

### Completed Phases (Reference)

#### Phase 1: Refactor & Harden
✅ **Phase 1: Refactor & Harden** — Tailwind migration, TypeScript strict mode, security (helmet/CORS/CSP), input validation, structured logging, auth hardening
✅ **Phase 2: Landing & Login** — Apple-like design, Framer Motion animations, dark theme, metadata/OG tags, responsive
✅ **Phase 3: Dashboard & App UI** — All 9 pages with CRUD, glassmorphism cards, dark theme, proper layouts
✅ **Phase 4: API & Backend** — 74 tests passing, Swagger docs, health/metrics endpoints, integration tests
✅ **Phase 5: DevOps & Docs** — Docker (dev+prod), GitHub Actions CI/CD, README/CHANGELOG/CONTRIBUTING
✅ **Phase 6: Features** — All notification channels, public status pages, API keys, import/export, dark/light toggle, visual UI/UX audit

## Next Up — In Progress / Todo

### 🔴 PulseDock Agent (HIGH PRIORITY)

- [x] **PulseDock Agent — local version reporter with copy-paste onboarding** — Lightweight agent (Docker container + binary) that reports versions of tools without external APIs.

  **Delivered:**
  - `POST /v1/agent/report` + `GET /v1/agent/status` API endpoints with API key auth
  - `packages/agent/` Node.js package with 16 built-in shell checks (Proxmox, pfSense, OpenWRT, Docker, PostgreSQL, MySQL, nginx, etc.)
  - Agent Dockerfile (multi-stage Alpine) + AGENT_TOOL_IDS env var filtering
  - Frontend tab switcher: **Docker Run** / **Compose** / **Shell Script** — copy button per snippet
  - AGENT_TOOL_IDS pre-filled with registry tool ID
  - 'from registry' badge + readOnly target field when tool is selected
  - Link to /account#api-keys for API key creation
  - 10 AgentService unit tests
  - `docs/AGENT.md` — quick start, config format, built-in checks, security docs
  - `docs/NGINX.md` — nginx reverse proxy including WebSocket/socket.io config

---

## Next Up — Post Tool-Registry

> **WAIT:** Do not start these until the tool registry expansion and Agent feature are done.

### 🟠 UX / Flow Improvements (from 2026-03-16 session)

- [x] **Status Pages — WebSocket through reverse proxy** — Added `docs/NGINX.md` with complete nginx config including `/api/socket.io/` location block with `proxy_http_version 1.1`, `Upgrade` + `Connection` headers, extended read/send timeouts, and `$connection_upgrade` map. Polling fallback remains for environments where WS can't be configured.

- [x] **Versions page — Tool picker instance URL UX** — Step 1 shows required asterisk + dynamic placeholder for instance URL when requiresInstanceUrl=true. Missing URL blocks Next button (validation in `missing[]`). Target field locked (readOnly) with 'from registry' badge when tool is from registry — user can 'Clear tool selection' to edit manually.

- [x] **Status Pages — Create modal slug edge cases** — Added inline validation: red border + error text when slug < 3 chars is manually entered. Submit button disabled until valid.

- [x] **Alert channels modal — Tab focus trap** — Confirmed: alerts page uses `Modal` component which has proper Tab/Shift+Tab focus trap since previous session. No custom modal found.

- [x] **Versions page — Tool header in form** — Steps 0 and 1 now show tool icon + name + description banner when tool is selected from registry.

### 🟡 Features (from 2026-03-16 session)

- [x] **Tool Registry → Versions page integration** — All 5 spec items delivered:
  1. Pre-fills all fields from registry entry (provider, target, interval, versionSource)
  2. Step 1 shows "Your {ToolName} URL" with required indicator + dynamic placeholder
  3. Auto-populates `appVersionEndpoint` from `urlTemplate` (strips `{{instanceUrl}}`)
  4. Target field is readOnly with 'from registry' badge — 'Clear tool selection' to edit
  5. Steps 0 and 1 show tool icon + name + description banner

- [x] **Monitors page — Templates for self-hosted app uptime** — Added 19 self-hosted app templates (Portainer, Gitea, GitLab, Grafana, Nextcloud, ArgoCD, Vault, Mattermost, Jellyfin, Immich, n8n, Traefik, MinIO, Keycloak, Home Assistant, Prometheus, Authentik, Authelia, Plausible). Tab UI: General / Self-Hosted Apps / Version Tracking. Placeholder URL hint shown for self-hosted group.

### 🔵 Infrastructure

- [x] **dind auto-start on container restart** — HEARTBEAT.md step 0 checks pg+redis connectivity and runs `start-dind-services.sh` if needed. Script is idempotent (`docker rm -f` before each run, `|| true` on volume creation). Services running fine and verified each heartbeat.

- [x] **SSH key persistence** — Verified: `~/.ssh/` has active keys (id_ed25519 present). Git push works (all commits pushed successfully this session). No symlink needed — keys persist correctly across container restarts in the current setup.

---

---

## 🔴 STATUS PAGE — Enterprise-Ready (PRIORITY)

> **Instruction from Noah (2026-03-17):** Status pages must be 100% configurable, unlimited widgets, every monitor/group/project/tag displayable, multiple layouts, compete with Uptime Kuma and beyond. 11/10 quality. Continuously improve — add new widgets/features when you see room for improvement.

### P0 — Config Panel + Multi-Monitor + Grid Layout

- [x] **Universal Config Panel for ALL widget types** — Every widget gets full configuration: monitor selection (single/multi/all/by-tag/by-folder/by-type), label override, custom colors, visibility rules, refresh interval, size controls (width cols 1-12, height rows 1-10), border/padding config, responsive behavior (hide/collapse/full-width on mobile), click-action (link to monitor detail/external URL), tooltip text
- [ ] **Multi-Monitor Picker component** — Reusable picker with: checkboxes for multiple monitors, "Select All" button, filter by tag dropdown, filter by folder dropdown, filter by type (HTTP/TCP/SSL/Version/Heartbeat), search input, selected count badge. Used by: Multi-Status Badges, Monitor Group, Version Grid, Check History, Status Badge (multi mode), Response Time Comparison, Uptime Comparison
- [x] **Real CSS Grid Layout on public page** — Replace linear `space-y-4` with actual CSS Grid based on widget x/y/w/h (12-column grid). Responsive: 12-col desktop → 6-col tablet → 1-col mobile. Widgets position correctly in grid cells
- [ ] **Resize Handles in editor** — Drag corners/edges to resize widgets on canvas. Visual resize handles on hover. Minimum size constraints per widget type
- [ ] **Widget Width/Height in Config Panel** — Number inputs for exact col/row sizing (fallback when drag-resize isn't precise enough)

### P0 — Fix Existing Widget Data

- [x] **Uptime Bar with real data** — Implemented via existing per-widget endpoint `GET /v1/public/status/:slug/widget/:widgetId` (returns `uptimePct`, `periodDays`, `total`) and wired into public renderer (no more placeholder percentages).
- [ ] **Uptime Timeline with real data** — Per-day status bars from actual MonitorRun records. Green=all checks OK, yellow=some failed, red=majority failed. API returns day-by-day breakdown
- [ ] **Response Time Chart with real data** — SVG sparkline from actual latencyMs values in MonitorRun. Show last N checks or last N hours
- [ ] **SLA Summary with real data** — Calculate from MonitorRuns: total checks, successful checks, uptime%, compare against configurable SLA target (99.9%, 99.95%, 99.99%)

### P1 — New Widgets (Status & Uptime)

- [ ] **Component Status List** — Per-component status: Operational / Degraded / Partial Outage / Major Outage. Configurable per monitor/group. Color-coded with icons
- [ ] **Service Health Matrix** — Monitors × Environments (prod/staging/dev) or Monitors × Regions matrix table with colored cells
- [ ] **Dependency Map** — Visual service dependency graph (Service A → B → C) with live status on each node. Config: define edges between monitors
- [ ] **Status History Ribbon** — Per monitor: last 90 days as horizontal colored bar (like GitHub status). Compact single-row per monitor
- [ ] **Aggregate Health Score** — Weighted score 0-100 from all monitors. Config: weight per monitor. Shows gauge/circle visualization
- [ ] **Uptime Percentage Card** — Big number display: "99.97%" with trend arrow (↑/↓ vs last period). Configurable period
- [ ] **Multi-Environment Status** — Side-by-side comparison of same services across environments (prod vs staging vs dev). Config: environment tags
- [ ] **Region Status Map** — SVG world map with colored pins per monitor. Config: latitude/longitude or region (EU/US/APAC) per monitor
- [ ] **Third-Party Dependencies** — Show status of external services. Config: URLs to check (GitHub status, AWS health, Cloudflare status etc.)
- [ ] **Rolling Uptime Cards** — Row of cards: 24h / 7d / 30d / 90d / 365d uptime percentages side by side

### P1 — New Widgets (Performance)

- [ ] **Response Time Heatmap** — Hour-of-day × day-of-week latency heatmap (like GitHub contributions). Color scale: green (fast) → red (slow)
- [ ] **Latency Percentiles Card** — P50 / P95 / P99 latency values as big numbers with comparison to previous period
- [ ] **Response Time Comparison** — Multiple monitors as overlay lines on same chart. Config: select N monitors
- [ ] **Performance Trend** — Week-over-week % change in latency with ↑↓ indicators and sparkline
- [ ] **Throughput Counter** — Checks per hour / requests per minute as live counter
- [ ] **Apdex Score** — Application Performance Index (0-1) calculated from response times. Config: satisfied/tolerating thresholds
- [ ] **SSL Certificate Status** — Expiry date, days remaining, issuer, grade. Color: green >30d, yellow 10-30d, red <10d
- [ ] **DNS Resolution Time** — DNS lookup latency tracker (separate from HTTP latency)

### P1 — New Widgets (SLA & Uptime Deep)

- [ ] **SLA Compliance Table** — Multi-monitor table: Monitor | SLA Target | Actual | Status (Pass/Fail) per month. Color-coded rows
- [ ] **Uptime Heatmap** — Hours × days matrix showing up/down status per hour. 7 days × 24 hours = 168 cells
- [ ] **Downtime Log** — Chronological list of all outage events with start time, duration, affected monitors, cause
- [ ] **MTTR / MTTF Cards** — Mean Time to Recovery, Mean Time to Failure calculated from incidents + check data
- [ ] **Uptime Comparison Chart** — Side-by-side bar chart comparing uptime% across monitors for same period

### P1 — New Widgets (Incidents & Maintenance)

- [ ] **Incident Timeline** — Chronological vertical timeline with status update bubbles (Investigating → Identified → Monitoring → Resolved)
- [ ] **Post-Mortem Card** — Shows after incident resolution: RCA summary, duration, affected services, lessons learned
- [ ] **Incident Severity Distribution** — Donut/pie chart: Critical / Major / Minor breakdown over a period
- [ ] **Incident Duration Stats** — Average / Longest / Shortest incident duration cards
- [ ] **Active Incident Count** — Big animated number showing current active incidents (pulses when >0)
- [ ] **Maintenance Calendar** — Month calendar view with maintenance windows highlighted. Click for details
- [ ] **Next Maintenance Countdown** — Timer counting down to next scheduled maintenance window
- [ ] **Maintenance Impact List** — Which services affected by upcoming maintenance + alternative routes

### P1 — New Widgets (Versions)

- [ ] **Version Timeline** — Chronological list of all version updates detected across monitors
- [ ] **Changelog Widget** — Shows release notes from GitHub/GitLab releases for monitored tools
- [ ] **Outdated Components Alert** — Only shows monitors where version != latest, red/yellow severity
- [ ] **Version Comparison Table** — Current vs Latest vs Previous version side-by-side per monitor
- [ ] **Security Advisory Widget** — Checks if current version has known CVEs (via GitHub advisories API)

### P1 — New Widgets (Metrics & Data)

- [ ] **Metric Comparison Row** — N metric cards in horizontal strip (Uptime, Latency, Checks/Day, Incidents/Month)
- [ ] **Custom Metric Chart** — Arbitrary time-series data as line/bar/area chart. Config: data source, aggregation
- [ ] **Gauge / Speedometer** — Circular gauge visualization (0-100%). Config: thresholds for green/yellow/red zones
- [ ] **Sparkline Row** — Multiple mini-charts side by side for quick comparison
- [ ] **Stats Grid** — 2×2 or 3×3 grid of key-value metric cards with icons
- [ ] **Progress Ring** — Circular progress (like Apple Watch rings). For uptime, SLA compliance
- [ ] **Data Table** — Configurable tabular data display with sorting and pagination

### P1 — New Widgets (Content & Branding)

- [ ] **Image / Banner** — Upload custom image or banner. Config: URL, alt text, link, max-height
- [ ] **Announcement Bar** — Full-width colored bar for important messages. Config: type (info/warn/danger), dismissable toggle, expiry date
- [ ] **FAQ / Accordion** — Collapsible Q&A sections. Config: array of {question, answer} pairs
- [ ] **Link List** — External links with icons (Docs, Support, API Status, Changelog). Config: [{label, url, icon}]
- [ ] **Social Links** — Row of social media icons with links (GitHub, Twitter, Discord, etc.)
- [ ] **Embed / iFrame** — Embed external content (Grafana panels, external dashboards). Config: URL, height, sandbox policy
- [ ] **Video Embed** — YouTube/Vimeo embed for tutorials or incident explanations
- [ ] **Code Block** — Display API response or config snippet with syntax highlighting
- [ ] **Subscriber Form** — Email input for status update subscriptions. Backend: subscriber table, email notifications on status change
- [ ] **RSS Feed Widget** — Auto-generated RSS/Atom feed link for incidents and status changes

### P1 — New Widgets (Layout & Navigation)

- [ ] **Tab Container** — Multiple tabs each containing different widget sets. Config: tab names, which widgets per tab
- [ ] **Collapsible Section** — Expandable/collapsible areas with header. Default open/closed configurable
- [ ] **Column Layout** — 2/3/4 column container for sub-widget grouping within a row
- [ ] **Sticky Header** — Stays fixed at top while scrolling. Shows overall status + page title
- [ ] **Table of Contents** — Auto-generated from section/header widgets with anchor links
- [ ] **Page Navigation** — Links to other status pages in the account. For multi-page setups

### P2 — Editor UX

- [ ] **Widget Duplication** — Copy button per widget (same config, auto-placed)
- [ ] **Widget Lock** — Lock toggle to prevent accidental drag/resize
- [ ] **Multi-Select** — Shift+Click to select multiple widgets. Group move/delete/align
- [ ] **Undo/Redo** — Ctrl+Z / Ctrl+Y with 50-step history stack
- [ ] **Snap-to-Grid** — Visual grid lines, magnetic snapping while dragging
- [ ] **Alignment Guides** — Show alignment lines when widgets line up with others
- [ ] **Canvas Zoom** — Zoom in/out (Ctrl+scroll or buttons). Fit-to-screen button
- [ ] **Responsive Preview** — Toggle Desktop/Tablet/Mobile view in editor with accurate widths
- [ ] **Template Gallery** — 10+ preset layouts: Minimal, Full Dashboard, SLA Report, Version Overview, Incident Page, Service Status, Dev/Ops Dashboard, Customer-Facing, Internal Team, Executive Summary
- [ ] **Keyboard Shortcuts** — Del=Delete, Ctrl+D=Duplicate, Ctrl+S=Save, Arrow=Nudge 1px, Shift+Arrow=Nudge 10px, Ctrl+A=Select All, Ctrl+L=Lock
- [ ] **Widget Search in Palette** — Filter palette by name/category
- [ ] **Layer Management** — Z-index ordering, bring to front/send to back
- [ ] **Copy/Paste between Pages** — Ctrl+C/V widgets across different status pages
- [ ] **Version History** — Last 10 saves with preview + one-click restore
- [ ] **Drag from Palette** — Drag widget from sidebar directly onto canvas (already works, improve UX)

### P2 — Page-Level Configuration

- [ ] **Multiple Status Pages** — Already supported, improve page list UX with thumbnails
- [ ] **Page Themes** — Light/Dark/System/Custom. Accent color picker, font selector (Inter/Roboto/System), custom CSS editor (advanced)
- [ ] **Page Header Config** — Logo upload (base64 or URL), title, subtitle, banner image, background gradient
- [ ] **Custom Favicon** — Per status page, override site default
- [ ] **Custom Slug** — Already supported, add availability checker
- [ ] **SEO Config** — Custom meta title, description, OG image URL, robots (index/noindex)
- [ ] **Branding Toggle** — Show/hide "Powered by PulseDock" footer
- [ ] **Auto-Refresh Config** — Interval picker: 10s / 30s / 60s / 5min / off
- [ ] **Password Protection UX** — Improve password set/remove flow in editor
- [ ] **Offline Banner** — Auto-shows when WebSocket/polling connection lost

### P2 — Public Page Rendering

- [ ] **Smooth Data Transitions** — Animate value changes (number count-up, color transitions)
- [ ] **Real-time via WebSocket** — Live data push instead of 60s polling. Instant status updates
- [ ] **Print-friendly CSS** — @media print stylesheet for reporting/PDF export
- [ ] **Full Accessibility** — ARIA labels on all widgets, keyboard navigation, screen reader announcements for status changes
- [ ] **Performance** — Lazy load widgets below fold, code split per widget type, < 2s FCP
- [ ] **Export as Image** — Download current status page as PNG (html2canvas or server-side render)
- [ ] **Export as PDF** — Generate PDF report of current status

### P1 — Tool Registry & Templates Expansion

> Current: 1302 registry tools, 33 monitor templates. Target: 2500+ tools, 100+ templates.

- [ ] **Monitor Templates expansion: 33 → 100+** — Add templates for all major self-hosted apps with verified version endpoints and correct auth settings. New categories: Code Quality, Security Scanning, Backup, VPN, DNS, Mail, Analytics, IoT, AI/ML, Game Servers. Each template must have: correct appVersionEndpoint, correct appAuthType (none/token), correct health endpoint, description. Research each endpoint with curl before adding.

  **Code Quality & Analysis:**
  SonarQube (`/api/system/status`→version, no auth), SonarCloud, Codacy, CodeClimate, Snyk, Semgrep, Checkmarx, Veracode, Fortify, PMD, ESLint (daemon), Prettier (daemon), Stylelint

  **Security & Scanning:**
  Trivy, Clair, Anchore/Grype, Falco, OSSEC/Wazuh, CrowdSec, Fail2Ban (API), OpenVAS/Greenbone, Nessus, Qualys, Lynis, RKHunter, ClamAV (clamd), VirusTotal API

  **Backup & Recovery:**
  Duplicati, Restic (rest-server), Borg (borgmatic API), Velero, Veeam, Bareos, Amanda, Bacula, Urbackup, Kopia, Rclone (rcd), Syncthing

  **VPN & Networking:**
  WireGuard (wg-json), OpenVPN (management), Tailscale (API), Netbird, ZeroTier, Headscale, Netmaker, Firezone, Pritunl, SoftEther, StrongSwan, PiVPN

  **DNS:**
  Pi-hole (`/admin/api.php?summary`), AdGuard Home (`/control/status`), Unbound, CoreDNS, Technitium DNS, PowerDNS, Bind9, Knot DNS, dnsmasq, Blocky

  **Mail:**
  Mailcow (`/api/v1/get/status/version`), Mailu, Stalwart Mail, iRedMail, Postfix (postconf), Dovecot, Roundcube, Rainloop, Mailpit, MailHog, Maddy

  **Analytics & BI:**
  Plausible, Umami, Matomo, PostHog, Fathom, GoAccess, Countly, Mixpanel (self-hosted), Metabase, Redash, Apache Superset, Lightdash, Cube.js

  **AI/ML:**
  Ollama (`/api/version`), LocalAI, text-generation-webui, Stable Diffusion WebUI, ComfyUI, LiteLLM, vLLM, Triton Inference Server, MLflow, Kubeflow, Seldon Core, BentoML, Ray Serve, Hugging Face TGI

  **IoT & Home Automation:**
  Home Assistant (`/api/config`→version, auth required), Node-RED (`/red/`), Mosquitto, EMQX, HiveMQ, OpenHAB, Domoticz, Zigbee2MQTT, ESPHome, Tasmota (HTTP API), ioBroker

  **Game Servers:**
  Pterodactyl (`/api/application/info`), PufferPanel, AMP/CubeCoders, Crafty Controller, MineOS, LinuxGSM (API), GameDig, Pelican Panel

  **Project Management:**
  Vikunja, Focalboard, Taiga, OpenProject, WeKan, Kanboard, Leantime, Plane, Huly

  **Wikis & Docs:**
  Wiki.js, BookStack, Outline, Docusaurus, MkDocs, Gitbook (self-hosted), DokuWiki, MediaWiki, Confluence (DC), XWiki

  **File Sharing & Storage:**
  Nextcloud, Seafile, ownCloud, FileBrowser, ProjectSend, Pydio Cells, Ceph Dashboard, MinIO Console, Garage

  **Dashboards & Portals:**
  Heimdall, Homer, Dashy, Homarr, Organizr, Flame, Fenrus, Glances (web), Cockpit (Linux)

  **Databases (more):**
  PgBouncer, ProxySQL, Percona PMM, phpMyAdmin, pgAdmin, Adminer, CloudBeaver, Redis Commander, RedisInsight, Mongo Express, Elasticsearch HQ

  **Container & Orchestration (more):**
  Yacht, Dockge, Lazydocker (API), Diun, Watchtower, Ouroboros, Podman (API), LXD/Incus, Proxmox VE (`/api2/json/version`), TrueNAS SCALE API

- [ ] **Tool Registry expansion: 1302 → 2500+** — Add all tools from templates above to the registry with: correct latestSource (github-releases/gitlab-releases/docker-hub/npm/pypi), correct versionSource (json-path with urlTemplate + jsonPath + authRequired), correct icon (Simple Icons CDN, verify slug exists), proper category/tags. Deduplicate existing entries. Fix any broken Simple Icons slugs (the 80+ 404s from earlier).

  **ERP & Business:**
  ERPNext, Odoo, Dolibarr, Tryton, Axelor, iDempiere, Metasfresh, Crater (invoicing), InvoiceNinja, Kimai (time tracking), Solidtime

  **E-Commerce:**
  Shopware, PrestaShop, Magento/Adobe Commerce, WooCommerce (REST API), Saleor, Medusa, Vendure, Bagisto, Sylius, Spree Commerce

  **CRM:**
  SuiteCRM, EspoCRM, Monica CRM, Twenty CRM, Corteza, Vtiger, CiviCRM, Chatwoot

  **Identity & SSO:**
  Keycloak, Authentik, Authelia, Zitadel, Casdoor, Logto, SuperTokens, FusionAuth, Gluu, Ory Kratos, Ory Hydra, LLDAP, Kanidm

  **Search Engines:**
  Elasticsearch, OpenSearch, Meilisearch, Typesense, Manticore Search, Sonic, Zinc, Quickwit, Tantivy, Toshi, Qdrant, Weaviate, Milvus, ChromaDB, Pinecone (self-hosted)

  **Vector Databases & AI Infra:**
  Qdrant, Weaviate, Milvus, ChromaDB, pgvector (via PostgreSQL), LanceDB, Marqo, Vespa, Jina, OpenSearch (vector), Chroma

  **Log Management:**
  Graylog, Loki + Grafana, ELK Stack (Elasticsearch+Logstash+Kibana), Fluentd, Fluent Bit, Vector, Alloy, OpenObserve, SigNoz, Seq, Papertrail (self-hosted)

  **APM & Tracing:**
  Jaeger, Zipkin, SigNoz, Uptrace, Grafana Tempo, OpenTelemetry Collector, Datadog Agent (self-hosted), NewRelic Agent, Elastic APM, Sentry (self-hosted), GlitchTip, Highlight.io

  **Secrets Management:**
  HashiCorp Vault, Infisical, Doppler (self-hosted), SOPS, Sealed Secrets, External Secrets Operator, CyberArk Conjur, Bitwarden Secrets Manager, 1Password Connect

  **Service Mesh & API Gateway:**
  Istio, Linkerd, Consul Connect, Cilium Service Mesh, Kong, APISIX, Tyk, KrakenD, Gravitee, Traefik Hub, Emissary-Ingress, Gloo Edge, Ambassador

  **GitOps & Deployment:**
  ArgoCD, FluxCD, Tekton, Spinnaker, Harness, Waypoint, Octopus Deploy, Capistrano, Kamal, Coolify, CapRover, Dokku, PaaS (self-hosted)

  **Streaming & Event Processing:**
  Apache Kafka, Redpanda, Apache Pulsar, NATS JetStream, RabbitMQ Streams, Apache Flink, Apache Spark Streaming, Benthos/Redpanda Connect, Debezium, Kafka Connect, ksqlDB

  **Data Pipeline & ETL:**
  Apache Airflow, Prefect, Dagster, Temporal, n8n, Node-RED, Windmill, Kestra, Apache NiFi, Airbyte, Meltano, Singer, Fivetran (self-hosted agent), dbt

  **Scheduling & Jobs:**
  Rundeck, Cronicle, Ofelia, Jobber, Agenda, Bull/BullMQ Dashboard, Celery Flower, Sidekiq, Faktory, Machinery

  **Testing & QA:**
  Selenium Grid, Playwright (grid), Cypress Dashboard (sorry.cypress), Testkube, Allure TestOps, Reportportal, Zalenium, Moon (Aerokube), Selenoid

  **Documentation & API Docs:**
  Swagger UI, Redoc, Stoplight, ReadMe, Docusaurus, Mintlify, Nextra, VitePress, Starlight, Fumadocs

  **Password Management:**
  Vaultwarden, Bitwarden, Passbolt, Teampass, Psono, Padloc, KeeWeb, AuthPass

  **Media & Streaming (more):**
  Jellyfin, Plex, Emby, Navidrome, Funkwhale, Ampache, Airsonic, Subsonic, Owncast, PeerTube, Ant Media, Janus Gateway, MediaMTX, Frigate, Shinobi, ZoneMinder, Moonlight/Sunshine

  **Photo & Document Management:**
  Immich, PhotoPrism, LibrePhotos, Pigallery2, Lychee, Piwigo, Paperless-ngx, Docspell, Teedy, Stirling PDF, Gotenberg

  **Communication (more):**
  Matrix Synapse, Element, Mattermost, Rocket.Chat, Zulip, Revolt, XMPP (ejabberd/Prosody), Jitsi Meet, BigBlueButton, LiveKit, Mumble, TeamSpeak, Gotify, ntfy, Apprise, Pushover

  **Proxy & Load Balancer (more):**
  Nginx, Nginx Proxy Manager, Traefik, Caddy, HAProxy, Envoy, Varnish, Squid, Pound, Sniproxy, frp, ngrok (self-hosted), rathole, bore, chisel

  **Virtualization & Containers (more):**
  Proxmox VE, XCP-ng, oVirt, Harvester, Rancher, Portainer, Yacht, Dockge, CasaOS, Umbrel, TrueNAS SCALE, Unraid, OpenMediaVault, Cockpit

  **Network Monitoring:**
  LibreNMS, Nagios, Zabbix, Checkmk, Observium, PRTG (self-hosted), Icinga2, NetBox, Netdata, Telegraf, Cacti, Smokeping, UptimeRobot (self-hosted agent), Gatus

  **Compliance & Audit:**
  OpenSCAP, Prowler, ScoutSuite, CloudSploit, Steampipe, InSpec, Drata Agent, Vanta Agent

  **Blockchain & Web3:**
  Ethereum (Geth/Besu/Nethermind), Bitcoin Core, Lightning Network (LND/CLN), IPFS, Filecoin Lotus, Substrate Node, Cosmos (Tendermint), Polygon Edge

  **Education & LMS:**
  Moodle, Canvas LMS, Open edX, Chamilo, ILIAS, Kolibri, LibreTexts

  **Geospatial:**
  GeoServer, MapServer, PostGIS, Nominatim, Pelias, Overpass API, tile38, Martin (vector tiles)

  **Healthcare:**
  OpenMRS, GNU Health, Bahmni, HAPI FHIR Server, Orthanc (DICOM)

  **CDN & Edge:**
  Cloudflare (API), Fastly, Bunny CDN, KeyCDN, StackPath, Varnish, Squid, nginx (caching), Apache Traffic Server, HAProxy (cache mode), Souin, Caddy-cache

  **CI/CD Runners & Build:**
  GitHub Actions Runner, GitLab Runner, Buildkite Agent, Drone Runner, Woodpecker Agent, Jenkins Agent, CircleCI Runner, Semaphore Agent, Earthly Satellite, Dagger Engine, Pants, Bazel Remote Cache, Gradle Enterprise, Nx Cloud, Turborepo Remote Cache

  **Database Tools & Admin:**
  pgAdmin, Adminer, phpMyAdmin, CloudBeaver, DBeaver (server), Bytebase, Atlas (schema), Flyway, Liquibase, SchemaHero, PgHero, Redis Commander, RedisInsight, Mongo Express, Elasticsearch HQ, Kibana, OpenSearch Dashboards, ClickHouse Keeper, CockroachDB Console

  **Observability Collectors:**
  OpenTelemetry Collector, Telegraf, Prometheus Node Exporter, Prometheus Blackbox Exporter, cAdvisor, kube-state-metrics, Thanos, Cortex, Mimir, VictoriaMetrics Agent, Datadog Agent, Grafana Alloy, Grafana Agent, Promtail, Filebeat, Metricbeat, Heartbeat (Elastic)

  **Config Management:**
  Ansible (AWX/Tower), Puppet Server, Chef Infra Server, SaltStack, CFEngine, Rudder, mgmt, Foreman, Katello, Spacewalk

  **Infrastructure as Code:**
  Terraform, OpenTofu, Pulumi, Crossplane, cdktf, AWS CDK, Atlantis, Spacelift, env0, Scalr, Terragrunt, Terramate

  **Kubernetes Tools:**
  Lens, k9s (API), Kubernetes Dashboard, Rancher, KubeSphere, OpenLens, Headlamp, Skooner, Kubeapps, Helm Dashboard, ArgoCD, Flux, kapp-controller, Kyverno, OPA Gatekeeper, Falco, Trivy Operator, Starboard, Polaris, Datree, Kubecost, OpenCost, Goldilocks, VPA, HPA, KEDA, Karpenter, Cluster Autoscaler

  **Storage & Backup (more):**
  Longhorn, OpenEBS, Rook/Ceph, Portworx, StorageOS, Linstor, MinIO, SeaweedFS, JuiceFS, GlusterFS, BeeGFS, Garage (S3), VAST Data, Weka

  **Workflow & Automation:**
  n8n, Node-RED, Windmill, Huginn, Activepieces, Automatisch, Make (self-hosted), Pipedream (self-hosted), StackStorm, Camunda, Zeebe, Flowable, Activiti, Apache Camel

  **Form & Survey:**
  Typebot, Formbricks, LimeSurvey, Survicate (self-hosted), Heyform, OpnForm, Tally (self-hosted), SurveyJS, OhMyForm

  **Notification & Alerting:**
  Gotify, ntfy, Apprise, Pushover (relay), AlertManager, PagerDuty (self-hosted agent), Opsgenie (agent), Grafana OnCall, Cabot, Alerta, ElastAlert, Healthchecks.io (self-hosted), Uptime Kuma, Gatus, Statping-ng

  **Feature Flags & Experimentation:**
  Unleash, FlagSmith, GrowthBook, LaunchDarkly Relay, Split (self-hosted), OpenFeature, Flipt, PostHog (feature flags), ConfigCat (self-hosted)

  **Translation & i18n:**
  Weblate, Pontoon, Traduora, Tolgee, Crowdin (self-hosted agent), Lokalise (CLI)

  **Social & Community:**
  Mastodon, Misskey, Pleroma, Akkoma, Lemmy, Kbin/Mbin, Discourse, Flarum, NodeBB, Vanilla Forums, HumHub, Friendica, Pixelfed, BookWyrm, Mobilizon

  **Calendar & Scheduling:**
  Cal.com, Calendso, Easy!Appointments, Rallly, Schej, Doodle (self-hosted), Radicale, Baikal, DAViCal, SabreDAV

  **Paste & Snippet:**
  PrivateBin, Hastebin, Pastebin (self-hosted), MicroBin, Opengist, Gitea (snippets), SnipBox, Snibox, ByteStash

  **URL Shortener:**
  Shlink, YOURLS, Kutt, Polr, Chhoto, GoShort, Lstu, Dub.co (self-hosted)

  **Status Page (competitors — monitor them!):**
  Uptime Kuma, Gatus, Cachet, Statusfy, Instatus, Cstate, StatPing, Vigil, Staytus, HetrixTools, Upptime, Statuspal

  **PDF & Document Processing:**
  Stirling PDF, Gotenberg, LibreOffice Online, ONLYOFFICE, Collabora Online, CryptPad, Etherpad, HedgeDoc, CodiMD

  **Screenshot & Browser Automation:**
  Browserless, Playwright (service), Puppeteer (service), Selenium Hub, Splash, PhantomJS Cloud, urlbox (self-hosted), Rendertron, Prerender.io (self-hosted)

  **Image Processing:**
  Imgproxy, Thumbor, ImageMagick (API wrapper), Sharp (service), Cloudinary (self-hosted), Kraken.io (agent), TinyPNG (agent)

  **Caching:**
  Redis, Valkey, KeyDB, Dragonfly, Memcached, Garnet, Hazelcast, Apache Ignite, Infinispan

  **Time Series:**
  InfluxDB, TimescaleDB, QuestDB, TDengine, Prometheus, VictoriaMetrics, Thanos, Cortex, Mimir, CrateDB, GridDB, Warp10, ClickHouse (time-series mode)

  **Graph Databases:**
  Neo4j, ArangoDB (graph mode), JanusGraph, Dgraph, TypeDB, Amazon Neptune (compatible), TigerGraph, Memgraph, TerminusDB, SurrealDB (graph mode)

  **Key-Value & Document:**
  Redis, etcd, Consul KV, ZooKeeper, BoltDB/bbolt, BadgerDB, TiKV, FoundationDB, CouchDB, PouchDB, RavenDB, LiteDB, UnQLite, LMDB

  **Embedded & Edge Compute:**
  EdgeX Foundry, KubeEdge, OpenYurt, k3s, MicroK8s, K0s, Akri, Azure IoT Edge, AWS Greengrass, Balena, Mender, UpdateHub

  **Audio & Music:**
  Navidrome, Funkwhale, Ampache, Airsonic-Advanced, LMS (Logitech), Mopidy, Snapcast, Roon Server, Lidarr, Headphones

  **Reading & Books:**
  Calibre-Web, Kavita, Komga, Audiobookshelf, Readarr, LazyLibrarian, Stump, Bookstack (library mode)

  **Download & Torrent:**
  qBittorrent, Transmission, Deluge, rTorrent/ruTorrent, SABnzbd, NZBGet, JDownloader, Aria2 (WebUI), Pyload, Sonarr, Radarr, Lidarr, Readarr, Prowlarr, Bazarr, Overseerr, Jellyseerr, Ombi, Petio

  **Remote Access:**
  Guacamole, RustDesk, MeshCentral, Apache Guacamole, noVNC, Teleport, Boundary, CloudFlare Tunnel, ngrok (self-hosted), frp, rathole, bore, chisel, Tailscale, Netbird

  **Clipboard & Sync:**
  Clipboard (self-hosted), Syncthing, Resilio Sync, Seafile, SparkleShare, Unison, rsync (daemon), Rclone (serve), KDE Connect (server)

  **Diagramming & Whiteboard:**
  Excalidraw, draw.io/diagrams.net, Mermaid Live, PlantUML Server, Lucidchart (self-hosted), Whimsical (self-hosted), tldraw, Miro (self-hosted plugin)

  **Terminal & Shell:**
  ttyd, Wetty, GateOne, Shellinabox, code-server (terminal), Coder, JupyterHub (terminal), WebSSH, sshwifty

  **Fonts & Assets:**
  Fontello, IcoFont, Google Fonts (self-hosted mirror), Bunny Fonts, Font Awesome Kit (self-hosted)

  **Maps & Navigation:**
  Nominatim, Pelias, Photon, OSRM, Valhalla, GraphHopper, OpenRouteService, tile38, Martin, Tileserver GL, MapLibre, Leaflet

  **Scientific & Research:**
  JupyterHub, JupyterLab, RStudio Server, Zeppelin, MATLAB Web (self-hosted), GNU Octave (web), SageMath, CoCalc

  **Print & 3D:**
  OctoPrint, Mainsail, Fluidd, Moonraker, Klipper, Repetier Server, Duet Web Control, CUPS

- [ ] **Tool Registry expansion: 1302 → 5000+** — Add all tools from templates above to the registry with: correct latestSource (github-releases/gitlab-releases/docker-hub/npm/pypi), correct versionSource (json-path with urlTemplate + jsonPath + authRequired), correct icon (Simple Icons CDN, verify slug exists), proper category/tags. Deduplicate existing entries. Fix any broken Simple Icons slugs (the 80+ 404s from earlier).

- [ ] **Fix Simple Icons 404s** — Audit all icon slugs in registry against `https://cdn.simpleicons.org/{slug}`. Replace broken slugs with correct ones or use fallback generic icons. Test each icon URL.

### P0 — Landing Page Rework

> Landing page is the first thing users see. Must be Apple-level quality. Multiple iteration runs until perfect.

- [ ] **Hero section redesign** — Bold headline, animated gradient text, clear value prop in one sentence, CTA buttons (Get Started / Live Demo), hero illustration or animated dashboard mockup, trust badges (open-source, self-hosted, free)
- [ ] **Feature showcase** — 6-8 feature cards with icons + animations on scroll: Version Intelligence, Uptime Monitoring, Status Pages, Alert Channels, Incident Management, Tool Registry (1300+ tools). Each with micro-animation on hover.
- [ ] **How it works section** — 3-step visual flow: 1) Add monitors 2) Get alerts 3) Share status page. Animated connectors between steps.
- [ ] **Live demo / Interactive preview** — Embedded mini-dashboard showing real data (or realistic mock). Animated charts, status dots, version badges. Users see what they get before signup.
- [ ] **Comparison table** — PulseDock vs Uptime Kuma vs Better Stack vs Statuspage vs Pingdom. Feature matrix with checkmarks. Highlight what's unique (version intelligence, tool registry, self-hosted).
- [ ] **Testimonials / Social proof** — Placeholder section for future testimonials. GitHub stars counter, "Used by X developers", open-source badge.
- [ ] **Pricing section** — Free (self-hosted, unlimited), Cloud (coming soon placeholder). Clean card design.
- [ ] **Screenshot gallery** — Dark-themed screenshots of: Dashboard, Monitors, Status Page Builder, Version Checks, Incident Timeline. Smooth carousel or grid.
- [ ] **Footer redesign** — Proper footer: product links, docs link, GitHub link, changelog, social links, newsletter signup placeholder, copyright.
- [ ] **Performance** — Lighthouse 100, zero CLS, <1s FCP, lazy-load below-fold sections, optimized images, preconnect fonts.
- [ ] **SEO deep pass** — Structured data (JSON-LD), proper heading hierarchy, internal links, sitemap, meta descriptions per section.
- [ ] **Animations polish** — Staggered FadeIn on scroll, parallax subtle effects, number count-up for stats, smooth section transitions, reduced motion support.
- [ ] **Mobile landing** — Dedicated mobile layout audit: touch targets, readable text without zoom, no horizontal scroll, fast load on 3G.
- [ ] **i18n landing** — EN + DE fully translated for all landing page content.

### P0 — Documentation & Codebase Cleanup

> All docs must be current, accurate, and well-organized. No stale files. Everything in docs/.

- [ ] **Consolidate all docs into docs/ folder** — Move any scattered .md files (root-level docs, random READMEs in packages) into `docs/`. Create proper structure:
  ```
  docs/
  ├── README.md          (main project docs entry point)
  ├── GETTING-STARTED.md (quick start guide)
  ├── ARCHITECTURE.md    (system architecture, tech stack, data flow)
  ├── API.md             (API reference, link to Swagger)
  ├── DEPLOYMENT.md      (Docker, Kubernetes, bare metal)
  ├── NGINX.md           (reverse proxy config — already exists)
  ├── HELM.md            (Helm chart docs — already exists)
  ├── AGENT.md           (PulseDock agent — already exists)
  ├── CLI.md             (CLI tool — already exists)
  ├── EXTENSION.md       (Browser extension — already exists)
  ├── E2E.md             (E2E testing — already exists)
  ├── LOGGING.md         (Log management — already exists)
  ├── PLUGINS.md         (Plugin system — already exists)
  ├── STATUS-PAGES.md    (Status page builder guide — NEW)
  ├── VERSION-CHECKS.md  (Version monitoring guide — NEW)
  ├── TOOL-REGISTRY.md   (Tool registry guide — NEW)
  ├── SECURITY.md        (Security practices, CSP, CSRF, auth)
  ├── CONTRIBUTING.md    (contribution guide)
  ├── CHANGELOG.md       (release notes — move from root)
  └── TROUBLESHOOTING.md (common issues + fixes)
  ```
- [ ] **Review and update ALL existing docs** — Go through every doc file: fix outdated info, add missing sections, verify all code samples work, update screenshots, ensure consistent formatting (headings, code blocks, tables).
- [ ] **Delete stale/unused files** — Audit entire repo for: unused config files, dead code, orphaned components, test fixtures that aren't imported, duplicate files, build artifacts in git, temporary files. Remove everything that shouldn't be there.
- [ ] **README.md overhaul** — Modern open-source README: logo, badges (build, coverage, version, license), one-paragraph description, screenshot, feature list, quick start (3 commands), links to all docs, contributing section, license.
- [ ] **CONTRIBUTING.md** — Dev setup guide, coding standards, commit conventions, PR process, architecture overview for contributors.
- [ ] **Package READMEs** — Each package (api, web, cli, agent, extension, tool-registry, e2e) gets a README with: what it is, how to develop, how to test, how to build.
- [ ] **Inline code documentation** — Add JSDoc to all service methods, controller endpoints, utility functions. At minimum: @param, @returns, @throws, @example for public APIs.
- [ ] **API documentation audit** — Verify all 95 Swagger endpoints have accurate descriptions, correct request/response examples, proper error codes documented.
- [ ] **Docker documentation** — Update docker-compose files, verify Dockerfiles build correctly, document all env vars, add docker-compose.override.yml example.
- [ ] **.env.example** — Create/update .env.example with all env vars, defaults, and comments explaining each one.

### P2 — Frontend Polish (Enterprise-Grade UI)

- [ ] **Design System Audit** — Ensure every component follows consistent spacing (4px grid), typography scale, color tokens, border-radius, shadow depth. No one-off styles. Extract shared constants.
- [ ] **Animation & Micro-interactions** — Page transitions (fade between routes), skeleton→content transitions, button press feedback, toast slide-in/out, modal enter/exit, hover lift effects on cards, number count-up animations on metrics
- [ ] **Data Tables overhaul** — Sortable columns (click header), resizable columns (drag), column visibility toggle, row expansion, bulk select with shift-click range, sticky header on scroll, export to CSV/JSON, pagination options (10/25/50/100), empty state per table
- [ ] **Charts upgrade** — Replace SVG placeholder sparklines with real chart library (lightweight: uPlot or Chart.js). Support: line, area, bar, stacked bar, donut, heatmap, candlestick. Consistent color palette. Tooltip on hover. Responsive. Dark mode native.
- [ ] **Dashboard page overhaul** — Real-time updating cards, customizable layout (drag to reorder), time range selector (1h/6h/24h/7d/30d), auto-refresh indicator, fullscreen mode
- [ ] **Monitors page overhaul** — Card view toggle (grid vs table), advanced filters panel (type, status, tag, folder, response time range, last checked), saved filter presets, quick actions (hover menu), monitor health sparkline in table row
- [ ] **Mobile UX deep audit** — Test every flow on 375px: create monitor, create alert, create incident, status page editor (simplified mobile mode), navigation drawer, bottom tab bar option, pull-to-refresh, swipe actions
- [ ] **Keyboard-first UX** — Global command palette (Ctrl+K): search monitors, navigate pages, create actions, switch themes. Focus indicators everywhere. Tab order audit.
- [ ] **Notifications center** — In-app notification bell with dropdown: alert fired, incident created, maintenance starting, version update detected. Mark read/unread. Link to relevant page.
- [ ] **Onboarding improvements** — Interactive walkthrough (highlight elements, step-by-step), contextual help tooltips (?), empty state CTAs on every page, sample data option for demo
- [ ] **Breadcrumbs** — Consistent breadcrumb navigation on all sub-pages (Monitor > Edit, Status Page > Editor, Incident > Detail)
- [ ] **Error pages** — Custom 404 with search/navigation suggestions, 500 with retry button, offline page with cached data, session expired with auto-redirect to login
- [ ] **Print / Export views** — Every data page exportable as PDF/CSV. Print-optimized CSS. Report generation (weekly/monthly uptime report)

### P2 — Self-Optimization & Continuous Improvement

> **Standing instruction:** After completing any task, critically evaluate your own work. Ask: "Is this truly enterprise-ready? Would a Fortune 500 company pay for this?" If no — improve until yes.

- [ ] **Automated self-testing cycle** — After every deployment: curl all pages, check for console errors (headless browser), verify API endpoints respond correctly, check response times < 500ms, verify no TypeScript errors, run full test suite
- [ ] **Performance benchmarking** — Measure and track: First Contentful Paint (<1.5s), Time to Interactive (<3s), Lighthouse score (>90), API response times (<200ms p95), bundle size (<500KB gzipped). Set up alerts when metrics degrade.
- [ ] **Code quality metrics** — Track: test coverage (>95%), TypeScript strict compliance, no `any` types, no eslint warnings, no unused exports, no circular dependencies. Run on every commit.
- [ ] **Dependency health** — Weekly: check for outdated deps, security advisories, license compliance. Auto-PR for patch updates. Flag breaking changes.
- [ ] **UX self-review** — After every UI change: screenshot before/after, check on 3 viewports (mobile/tablet/desktop), verify dark mode, check color contrast (WCAG AA), test with keyboard only, check loading states
- [ ] **Architecture review** — Monthly: evaluate if patterns still make sense, identify tech debt, plan refactors. Review: API consistency, DB query performance (EXPLAIN ANALYZE hot paths), caching strategy, error handling completeness
- [ ] **Competitive analysis** — Study: Uptime Kuma, Better Stack, Instatus, Atlassian Statuspage, Pingdom, Datadog, Grafana Cloud. List every feature they have that PulseDock doesn't. Prioritize and build.
- [ ] **User experience testing** — After Noah tests: track every friction point, error, confusion. Fix immediately. Pattern: if Noah reports it → it's P0. If Noah almost reports it → it should've been caught in self-review.

### P2 — Enterprise Features (Beyond Monitoring)

- [ ] **Multi-user / Team support** — Invite team members, role-based access (admin/editor/viewer), per-monitor permissions, audit log per user action
- [ ] **Organization / Workspace** — Multiple organizations per account, switch between workspaces, org-level settings, shared monitors across team
- [ ] **API Keys management** — Multiple API keys per user, scoped permissions (read-only, write, admin), key rotation, usage tracking, rate limit per key
- [ ] **Single Sign-On (SSO)** — SAML, OIDC, Google Workspace, Microsoft Azure AD, Okta, OneLogin, JumpCloud integration
- [ ] **Webhook management UI** — Create/edit/test webhooks, delivery history, retry failed deliveries, payload templates, signature verification config
- [ ] **Scheduled Reports** — Daily/weekly/monthly automated reports via email: uptime summary, incident summary, SLA compliance, version status. PDF + HTML formats.
- [ ] **Data Retention Policies** — Configurable per-monitor: keep raw data for 7d/30d/90d/1y. Auto-aggregate older data into hourly/daily rollups. Storage usage dashboard.
- [ ] **Backup & Restore** — One-click database backup/restore, export all config as JSON, import from backup, migration tool from other platforms
- [ ] **Plugin System v2** — Custom widget types, custom check types, custom alert channels, marketplace for community plugins
- [ ] **White-label** — Remove all PulseDock branding, custom logo/colors throughout, custom email templates, custom domain for dashboard
- [ ] **Billing / License Management** — For SaaS mode: plan limits (monitors, checks/day, team members, status pages), usage tracking, upgrade prompts
- [ ] **Changelog / Release Notes page** — Public changelog showing PulseDock updates, auto-generated from git tags

### P3 — Advanced Data & API

- [ ] **Per-widget data endpoints** — Optimized API per widget type (not one giant payload)
- [ ] **Date Range Picker** — Custom time ranges for all time-based widgets
- [ ] **Public JSON API** — `GET /api/v1/public/status/:slug/json` for third-party integrations
- [ ] **Webhook on Status Change** — Push notifications when overall status changes
- [ ] **Email Subscriber System** — Subscribe to status updates, automated emails on incidents/maintenance
- [ ] **Slack/Discord Integration** — Auto-post status changes to channels
- [ ] **Embeddable Widget** — `<script>` tag to embed single widget on external sites
- [ ] **Status Page Badge** — "Status: Operational" badge for README/websites (already have SVG badges, extend to status page level)
- [ ] **Historical Data Retention** — Configure how long to keep check data (7d/30d/90d/1y)
- [ ] **Aggregation Pipelines** — Pre-compute hourly/daily rollups for fast chart rendering

---

## Status Summary
- **Codebase:** 1349 tests passing (1327 API + 10 CLI + 12 Agent), zero TypeScript errors (strict mode clean in API + Web), dark/light theme toggle, responsive design on all pages + PWA install/offline UX
- **Build:** ✅ Clean builds, all dependencies locked, all pages return 200
- **Deployment:** Live at https://oc-dev-test.no749ah.com — all pages healthy, API v1.0.1 responding
- **Production Readiness:** ~100% — All security gaps closed, full accessibility, incident management, SVG badges, public status page builder, tool registry (1302 tools), all alert channels, TCP/SSL/Heartbeat monitors, maintenance windows, i18n (EN+DE), Helm chart, E2E tests, PulseDock Agent, full nginx docs
- **Version:** v1.0.1 🎉
- **This heartbeat (2026-03-17 21:02 UTC):** Implemented real uptime-bar data wiring on public status pages by fetching per-widget API payloads in SSR and rendering live `uptimePct/period/check-count` in widget UI. Full heartbeat checks green; services restarted and route audits re-run.
- **This heartbeat (2026-03-17 13:02 UTC):** Fixed 4 failing tests (status-pages mock missing incident/maintenanceWindow/recentChecks). Added 5 new findPublic() coverage tests. Branch rotation — merged heartbeat/2026-03-17-maintenance → dev, created heartbeat/2026-03-17-coverage-cleanup. Bumped to v1.0.2 with CHANGELOG. All 1349 tests passing (98.73% stmt, 95.29% branch, 100% line).
- **This heartbeat (2026-03-17 10:02 UTC):** Removed unsupported `allowedHosts` from `apps/web/next.config.mjs` to match Next.js 16 config schema. `npm run build` now runs without invalid-config warnings; restart + local/proxy route audits completed.
- **This heartbeat (2026-03-17 09:02 UTC):** Coverage sweep completed — added edge-branch tests across auth/checks/monitors services (refresh TTL unit parsing, revoked session mapping, reset-password missing-user branch, profile conflict/trim handling, verify-email null-user post-consume path, semver prerelease number/string comparison paths, confirmations null fallback, CSV/import parser gaps). API tests: 1308 → 1327. Full suite: 1349 passing.
- **This heartbeat (2026-03-17 06:02 UTC):** Coverage improvements — auth.service.spec.ts: 4 new tests covering verifyTotpLogin() branches (user not found, inactive user, 2FA not enabled, recovery code no match). monitors.service.spec.ts: 2 new tests covering parseCsv/importExternal gaps (cols[intervalIdx] undefined fallback, !item guard). API tests: 1286 → 1292. Branch coverage: 94.14% → 94.33%.
- **This heartbeat (2026-03-17 05:02 UTC):** Coverage improvements — agent.controller.spec.ts created (4 tests, brings agent controller to 100% branch). agent.service.spec.ts extended (6 new tests: toolId config match, null configJson fallback, agentLastReport filter, numeric reportedAt, toolId fallback). auth.controller.spec.ts extended (7 new tests: setupStatus + setup endpoints, lines 54-88 previously uncovered). Agent branch coverage: 81.25% → 97.91%. 1269 → 1286 API tests. All 1291 total tests passing.
- **This heartbeat (2026-03-17 04:02 UTC):** Coverage improvements — RealtimeGateway now 100% branch coverage (2 new tests: undefined cookie header + JWT payload missing sub). CSV parser branch gap closed (4 total new tests). 1265 → 1269 API tests.
- **Remaining:** 9 moderate npm audit vulns (blocked upstream — Prisma dev dependency chain)
- **Next Project:** v1.0.1 shipped. New project proposal sent to Noah — awaiting repo creation.

### P0 — CI/CD E2E Login Redirect Failures (GitHub Actions)
- [ ] Reproduce `npm run test:e2e` failure locally in CI-like env.
- [ ] Fix login redirect race (`waitForURL("**/dashboard")` timeout) by making auth success deterministic.
- [ ] Ensure login submit handles setup-status/registration-disabled cases correctly in CI seed state.
- [ ] Stabilize Playwright auth fixture (`packages/e2e/fixtures/auth.ts`) to wait on post-login app-ready signal, not only URL.
- [ ] Add regression test for valid login path used in CI (`E2E_EMAIL/E2E_PASSWORD`).
- [ ] Validate full E2E suite green in pipeline.

### P1 — Tool Search Quality + Incremental Tool List UX
- [ ] Improve tool search relevance/ranking (name exact/starts-with > tags > description).
- [ ] Add debounced search + normalization (case/spacing/special chars) for consistent results.
- [ ] Add empty-state suggestions (close matches / top tools in selected category).
- [ ] Keep first render lightweight: show ~50 tools initially.
- [ ] Infinite scroll in tool picker: load +50 on scroll until exhausted.
- [ ] Add quick perf check for large registry filtering in browser.

### P0 — Registry Correctness Overhaul (No Guessing, Verified Only)
- [ ] Alle bestehenden Templates vollständig erneut prüfen (end-to-end Audit, kein Sampling).
- [ ] Für jedes Tool den echten Version-Endpoint im Web/Docs ermitteln und dokumentieren (Evidence-Link pro Tool).
- [ ] Pro Tool explizit markieren: Auth erforderlich **ja/nein** + empfohlener Auth-Typ.
- [ ] Setup UX: Wenn `version-test` mit `401/403 Unauthorized` fehlschlägt, automatisch auf Auth-Modus umschalten (Auth-Toggle + passendes Feld fokussieren).
- [ ] Bei Tools mit mehreren Plattformen/Varianten (z. B. OSS/CE/EE, docker/k8s/cloud, distro-abhängig):
- [ ] Varianten als Tags/Profiles im Registry-Modell pflegen.
- [ ] Im Setup-Dropdown Plattform/Variante auswählbar machen und je Variante korrekte Endpoint/Auth-Defaults anwenden.
- [ ] Duplikate bereinigen: gleiche Tools zusammenführen, Alias-/Synonym-Handling einführen, doppelte IDs/Namen entfernen.
- [ ] Validierungsregeln einführen: kein Template ohne verifizierten Endpoint + Auth-Status + Evidence.
- [ ] CI-Check hinzufügen: Registry-Lint (Duplicates, fehlende Evidence, ungültige Endpoint-Schemas, ungültige jsonPath/Extractor).
- [ ] Tool-Templates auf "verified" vs "experimental" kennzeichnen; standardmäßig nur verified prominent anzeigen.
- [ ] Ziel: Registry muss faktisch korrekt sein (nicht geraten), reproduzierbar und wartbar.
- [ ] "Verified by Runtime" statt nur statisch: Templates regelmäßig gegen echte Instanzen/Mocks testen.
- [ ] Registry-Metadaten speichern: `lastVerifiedAt`, `verifiedOnVersion`, `verificationStatus`.
- [ ] Endpoint-Fallback-Kette pro Tool: geordnete Kandidaten + Abbruchregeln statt nur 1 Endpoint.
- [ ] Extractor-Pipeline einführen: mehrstufige Extraktion statt Single-Path, um False-Negatives zu reduzieren.
- [ ] "Report wrong template" direkt im Setup: One-click Feedback mit Payload (`toolId`, endpoint, HTTP status, error, auth-mode, platform variant), damit fehlerhafte Registry-Einträge schnell korrigiert werden.
