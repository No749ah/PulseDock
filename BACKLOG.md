# PulseDock Backlog

## In Progress
- [x] **Dark/light theme toggle** — ThemeProvider with Context API, Sun/Moon icons in header, CSS variable swapping, localStorage persistence
- [ ] **Visual UI/UX Audit** — Manual visual inspection of all pages. Usability, spacing, field sizes, contrast, empty states, mobile view, inconsistencies. Seiten: Landing, Login, Dashboard, Monitors, Versions, Alerts, Projects, Account, Admin, Status Page, 404.
  - [x] Fixed ConfirmModal Button variant incompatibility (dangervariant removed, using className for red styling)

## Next Up

### Phase 1: Refactor & Harden
- [x] Add Tailwind CSS configuration with dark theme as default
- [x] Start replacing Mantine → Tailwind (landing + login done)
- [x] Remove all inline CSS from remaining pages — extract to Tailwind (2 CSS custom property instances remain for legitimate dynamic styling)
- [x] Complete Mantine → Tailwind migration for all app pages — app-frame.tsx, responsive-table, loading-state migrated. MantineProvider removed from root layout. Zero Mantine/Tabler imports remain.
- [x] Build reusable Tailwind component library (Card, Badge, Button, Table, Modal, Select, TextInput, CopyButton)
- [x] Fix all TypeScript strict mode violations (`any`, missing types, implicit returns) — both apps clean under strict:true
- [x] Add proper error boundaries and loading states to all pages — route-segment loading.tsx + error.tsx on all 8 pages; global error.tsx fixed (no console.error)
- [ ] Fix all npm audit vulnerabilities (**BLOCKED**: 4 HIGH severity in hono <= 4.12.6 via @prisma/dev; npm audit fix --force downgrades prisma to 6.19.2 breaking change; requires deeper prisma/motion-dom investigation)
- [x] Add security headers (helmet, CORS lockdown, CSP, rate limiting per-route)
- [x] Add input validation/sanitization on all API endpoints — class-validator DTOs + global ValidationPipe (whitelist+forbidNonWhitelisted)
- [x] Add proper logging (structured JSON logs, no console.log)
- [x] Audit auth flow: token storage (httpOnly cookies vs localStorage), CSRF, session management — tokens in httpOnly cookies ✅, sameSite:lax ✅, session revocation on logout fixed ✅, token rotation ✅, account lockout ✅

### Phase 2: Landing Page & Login (Apple-style)
- [x] Redesign landing page — Apple-like aesthetic with smooth scroll animations
- [x] Add Framer Motion for entrance animations (fade-up, parallax, stagger)
- [x] Hero section: bold typography, gradient text, floating UI mockup
- [x] Feature sections with scroll-triggered reveals
- [x] Responsive design (mobile-first) for landing + login
- [x] Add proper `<head>` metadata, OG tags, favicon — favicon.svg/ico, apple-touch-icon.png, og-image.png, site.webmanifest updated
- [x] Login page redesign — dark theme, modern inputs, animations
- [x] Implement 404 page with Tailwind

### Phase 3: Dashboard & App UI
- [x] Dark theme dashboard with glassmorphism cards
- [x] Monitor list with live status indicators
- [x] Version diff viewer with syntax highlighting — VersionDiff component: parses semver from run messages, highlights major/minor/patch/pre segments with severity colors. Integrated on versions page (run history rows + main table).
- [x] Alert configuration UI — wizard exists (3-step create + edit modal), per-monitor alert assignment: slide-in panel with add/remove, GET/POST/DELETE /v1/monitors/:id/alerts endpoints
- [x] User settings / account page (settings form)
- [x] Admin panel (user management, system health) — user management + invites + audit logs done; system health widget added (polls /health + /metrics every 30s, shows uptime, DB status/latency, request/error/alert counters)
- [x] Folder/project organization UI — full CRUD with table, pagination, modals
- [x] Monitors page (full CRUD)
- [x] Versions page — full CRUD, multi-step wizard, run history, expandable rows, stats cards
- [x] Projects page — full CRUD with table, pagination, modals
- [x] Alerts page — full CRUD, 3-step wizard, test functionality, all channel types

### Phase 4: API & Backend
- [x] Add unit tests for core services — AppController, MetricsService, AuthService, MonitorsService, AlertsService (45 tests, vitest). AlertsService: multi-channel dispatch, retry logic with fake timers, user ownership guard, all channel types.
- [x] Add integration tests for API endpoints — 22 integration tests across auth, health, monitors, metrics, Swagger, input validation (supertest + @nestjs/testing)
- [ ] Add proper API versioning strategy
- [x] Swagger/OpenAPI docs with examples — @ApiTags/@ApiOperation/@ApiResponse on all 9 controllers, live at /docs
- [x] Add health check endpoint with DB/Redis connectivity status — /health (DB latency), /health/live, /health/ready. Returns 503 when DB down.
- [x] Add metrics endpoint (Prometheus-compatible) — /metrics (JSON) + /metrics/prometheus (text/plain exposition format v0.0.4)
- [ ] WebSocket support for real-time monitor updates

### Phase 5: DevOps & Docs
- [x] Production Dockerfile (multi-stage, minimal image) — apps/api/Dockerfile + apps/web/Dockerfile + docker-compose.prod.yml
- [x] Docker Compose for development (app + postgres + redis) — docker-compose.dev.yml with hot reload, apps/api/Dockerfile.dev (ts-node-dev), apps/web/Dockerfile.dev (next dev), named volumes for node_modules isolation
- [ ] Docker Compose / Kubernetes manifests for production
- [x] GitHub Actions CI/CD — full pipeline: build + test + tsc typecheck + security audit
- [x] README.md — professional, with quick start, architecture, tech stack, testing sections
- [x] CHANGELOG.md — semver releases initialized (v0.1.0 → v0.3.0 + Unreleased)
- [x] CONTRIBUTING.md — how to contribute
- [x] LICENSE (MIT)

### Phase 6: Features
- [ ] Plugin system for custom monitor types
- [x] Notification channels (email, Discord, Slack, webhook) — All implemented: webhook, Discord, Slack, Telegram via fetch; email via MailerService (SMTP). AlertsService uses structured Logger instead of console.error.
- [x] Public status page (per-user, shareable URL) — /status/[userId]: per-monitor breakdown (operational/degraded/outage), live status banner with animated dot, recent events table, loading/error segments, 404 on unknown user.
- [x] API key management for programmatic access
- [x] Import/export monitors (JSON/YAML) — GET /v1/monitors/export + POST /v1/monitors/import with Export/Import buttons on monitors page
- [x] Dark/light theme toggle — ThemeProvider with Context API, Sun/Moon icons in header, CSS variable swapping, localStorage persistence

## Done
- [x] Initial project setup (NestJS + Next.js + Prisma)
- [x] Auth system (login, register, JWT, refresh tokens)
- [x] Monitor CRUD API
- [x] Alert channels API
- [x] Folder organization API
- [x] Admin user management API
- [x] Invite system
- [x] Audit logging
- [x] ESLint + Vitest setup
- [x] Single root .env configuration
- [x] Next.js /api proxy to backend
- [x] SSH deploy key for GitHub
- [x] Merged all 95 old heartbeat branches
- [x] Added root workspace test runner (`npm run test`) with package-level TypeScript checks
- [x] Fixed Prisma client generation issue after npm audit fix (requires explicit DATABASE_URL env var)

## In Progress
- [ ] **Visual UI/UX Audit** — Manuell jede Seite mit Browser visuell durchklicken. Usability, Spacing, Feldgrößen, Kontrast, leere Zustände, mobile Ansicht, Inkonsistenzen. Fix alle visuellen Issues direkt. Seiten: Landing, Login, Dashboard, Monitors, Versions, Alerts, Projects, Account, Admin, Status Page, 404.
  - [x] Pagination footer mobile polish (Alerts/Projects/Versions): stacked layout on small screens to prevent cramped controls/overflow.

## Ideas
- Browser extension for quick monitor creation
- CLI tool (`pulsedock check <url>`)
- Mobile-responsive PWA
- Multi-tenant support
- Changelog AI summarization (OpenAI/Anthropic)
