# Changelog

All notable changes to PulseDock are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

### Added
- **API key management** — Programmatic access via `pdck_*` Bearer tokens. Full stack: `PublicStatusPage` + `ApiKey` Prisma models with proper migrations. `ApiKeysService` generates cryptographically secure keys (32-byte random hex, SHA-256 hash storage, prefix for fast lookup). `ApiKeysController` provides `GET/POST/DELETE /v1/api-keys`. `AuthGuard` now accepts both JWT sessions and `pdck_*` API keys transparently. Account page gains an API Keys section: create keys with optional expiry, one-time key reveal modal with copy button, list with last-used timestamps, revoke with confirmation.
- **Admin system health widget** — Real-time dashboard on the `/admin` page polling `/health` and `/metrics` every 30 seconds. Shows API uptime, database status + latency, request/error counters, alert dispatch metrics, and a status banner (green/red). Fully typed, auto-refreshes with manual refresh button.
- **Live monitor/alert stream via WebSockets** — Backend now emits `monitor.checked` and `alert.triggered` events (in addition to monitor CRUD), and Dashboard/Monitors pages subscribe through Socket.io for instant status/activity updates without manual refresh.
- **Production deployment baseline** — Added `docs/DEPLOYMENT.md`, shipped Kubernetes manifests (`k8s/base`, `k8s/overlays/prod`) for namespace/config/service/deployment/statefulset/ingress, and aligned `docker-compose.prod.yml` with real auth env names (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ALLOW_PUBLIC_REGISTRATION`).
- **Plugin metadata + UI configuration flow** — Added plugin metadata endpoint (`GET /v1/monitors/plugins`), expanded plugin contract metadata (`description`, `configFields`), and updated Monitors create/edit modal with plugin selection + config inputs (starter plugin `http.response-match`).
- **Plugin packaging docs** — Added `docs/PLUGINS.md` with contribution flow, verification checklist, and security guidance for community plugin development.
- **Plugin execution foundation for custom monitor types** — Added typed plugin contracts/registry, a guarded execution boundary (`executePluginSafely`) with timeout + output sanitization, integrated `config.pluginId` execution path in `ChecksService`, and shipped a starter plugin (`http.response-match`) with unit coverage.

### Security
- **Logout session revocation** — Logout endpoint now reads the access token cookie, extracts the session ID, and revokes it in the DB. Stolen refresh tokens are immediately invalidated on logout rather than being usable until natural expiry.
- **Auth flow audit complete** — Confirmed: JWTs stored exclusively in httpOnly cookies (never localStorage), `sameSite: lax` CSRF protection, token rotation on every refresh, DB-backed session revocation, account lockout after 5 failed attempts.

### Added
- **Favicon & brand assets** — `favicon.svg` (SVG icon, modern browsers), `favicon.ico` (32×32 ICO fallback), `apple-touch-icon.png` (180×180 for iOS home screen), `og-image.png` (1200×630 OpenGraph card with brand colors), `og-image.svg` (source vector)
- **site.webmanifest** — Updated with correct icons array, theme color `#5EE2B0`, `maskable` icon purpose
- **layout.tsx** — SVG favicon with ICO fallback link tags, OG image already wired up
- **Enhanced health check** — `/health` now includes DB connectivity status + latency, service version, and uptime. New `/health/live` (liveness probe) and `/health/ready` (readiness probe) endpoints. Returns HTTP 503 when DB is unreachable.
- **Production Dockerfiles** — Multi-stage `apps/api/Dockerfile` and `apps/web/Dockerfile` with non-root user, minimal alpine images, and built-in HEALTHCHECK instructions.
- **`docker-compose.prod.yml`** — Full production stack (PostgreSQL + API + Web) with service healthchecks, named volume for data persistence, and `INTERNAL_API_URL` env var for container networking.
- **Next.js standalone output** — `next.config.mjs` now builds in standalone mode for smaller, self-contained Docker images.
- GitHub Actions CI workflow — runs full build, unit tests, TypeScript type-check, and security audit on every push/PR
- `CHANGELOG.md` — structured changelog tracking all notable changes
- Resolved merge conflict in `.env.example`; unified into a single clean template with all required variables

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

[Unreleased]: https://github.com/No749ah/PulseDock/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/No749ah/PulseDock/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/No749ah/PulseDock/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/No749ah/PulseDock/releases/tag/v0.1.0
