# Architecture — PulseDock

PulseDock is a monorepo built on NestJS (API) and Next.js (Web). This document explains the key architectural decisions and how the system fits together.

---

## Repository Layout

```
PulseDock/
├── apps/
│   ├── api/           # NestJS backend (port 4321)
│   └── web/           # Next.js 15 frontend (port 1234)
├── packages/
│   ├── agent/         # Local version reporter daemon
│   ├── cli/           # Command-line tool
│   ├── e2e/           # Playwright end-to-end tests
│   ├── extension/     # Chrome MV3 browser extension
│   └── tool-registry/ # Pre-configured tool catalog (2500+ entries)
├── prisma/
│   ├── schema.prisma  # Single source of truth for DB schema
│   └── migrations/    # SQL migration history
└── docs/              # All documentation
```

---

## Technology Stack

| Layer | Technology | Why |
|---|---|---|
| API framework | NestJS (Node.js) | Modules, DI, Guards, WebSocket out of the box |
| ORM | Prisma | Type-safe queries, auto-migrations, easy schema changes |
| Database | PostgreSQL 15+ | Relational + JSONB for flexible config storage |
| Cache / queues | Redis 7+ | WebSocket presence, rate limiting, session store |
| Frontend | Next.js 15 (App Router) | SSR for status pages, CSR for dashboard |
| Styling | Tailwind CSS | Design tokens, consistent dark theme |
| Animations | CSS keyframes + Intersection Observer | No runtime dependency; React 19 compatible |
| Charts | Recharts (dashboard) + inline SVG (status pages) | Lightweight, dark-mode native |
| Real-time | Socket.io (server) + socket.io-client | Bidirectional push for monitor status |
| Auth | JWT (access 15m + refresh 30d) + bcrypt | Stateless access tokens, rotating refresh tokens |
| 2FA | otplib (TOTP / RFC 6238) | Google Authenticator compatible |
| Email | Nodemailer (SMTP) | Verification, invites, alerts |
| Validation | class-validator + class-transformer | Decorators on DTOs; strict `forbidNonWhitelisted` |
| API docs | Swagger / OpenAPI 3 | Auto-generated from decorators at `/api/docs` |
| Testing | Vitest (unit) + Playwright (E2E) | Fast unit tests, real browser E2E |

---

## Data Flow: Monitor Check Cycle

```
ChecksScheduler.tick()
  └─ Loads all enabled monitors (single findMany + latest run)
  └─ Filters: due monitors (interval elapsed)
  └─ Promise.allSettled() — concurrent dispatch
       └─ ChecksService.runCheck(monitor)
            ├─ HTTP: fetch URL, check status/body/keywords
            ├─ TCP: net.createConnection, measure latency
            ├─ SSL: TLS handshake, extract cert expiry
            ├─ HEARTBEAT: validates last push timestamp
            ├─ GIT_RELEASE: GitHub/GitLab/Docker/npm/PyPI/Cargo
            └─ PLUGIN: sandboxed custom check type
       └─ Writes MonitorRun to DB
       └─ Compares to previous run (level change detection)
       └─ If level changed → AlertsService.notifyMonitorFailure()
            └─ Filters by NotificationPreference, quiet hours
            └─ Dispatches to configured AlertChannels
                 ├─ Email (Nodemailer)
                 ├─ Slack/Discord/Telegram (HTTP webhook)
                 └─ Webhook (generic HTTP POST)
       └─ socket.io emit → all subscribed frontends update live
```

**Scheduler cadence**: `ChecksScheduler` runs every 10 seconds. Each tick computes which monitors are due based on their `intervalSec` and the `checkedAt` timestamp of their latest run.

**N+1 prevention**: All monitors + their latest run are loaded in a single `findMany` with a lateral-style include (sorted by `checkedAt DESC LIMIT 1 per monitor`).

---

## Data Flow: Status Page Rendering

Public status pages use **SSR with no-store cache** for SEO + freshness:

```
GET /status/[slug]  (Next.js SSR)
  └─ fetch /v1/public/status/:slug  (API, no-store)
       └─ Loads page layout (widgets JSON)
       └─ Loads monitors for this user
       └─ Loads incidents, maintenance, recent checks
  └─ For each visible widget:
       └─ fetch /v1/public/status/:slug/widget/:widgetId
            └─ Widget-specific resolver (uptime%, latency, timeline...)
  └─ Renders 12-col CSS Grid matching editor coordinates
  └─ LiveStatusRefresh.tsx joins socket.io room → push updates
```

**WebSocket rooms**: when a check runs and a monitor appears in a published status page layout, `emitToStatusPage()` pushes a `status.updated` event to all clients in `status-page:{slug}` room. No polling needed.

---

## Auth Architecture

```
POST /v1/auth/login
  └─ Verify email + password (bcrypt)
  └─ Check account lock (5 failures → 15min lockout)
  └─ If 2FA enabled → return totp-pending JWT (limited scope)
       └─ POST /v1/auth/totp/verify → full JWT pair
  └─ Return: { accessToken (15m JWT), refreshToken (30d JWT) }
       └─ refreshToken stored as HttpOnly cookie
       └─ accessToken stored in memory (React state)

Subsequent requests:
  Authorization: Bearer <accessToken>

Token refresh:
  POST /v1/auth/refresh
  └─ Reads refreshToken from HttpOnly cookie
  └─ Validates against Session record in DB (allows revocation)
  └─ Returns new accessToken

CSRF protection:
  GET /v1/auth/csrf → sets csrf-token cookie, returns token
  All mutating requests require X-CSRF-Token header (timingSafeEqual)
  API key / Bearer callers exempt
```

---

## Module Structure (API)

Each NestJS module is self-contained with controller + service + spec:

```
src/
├── auth/          # Login, register, 2FA, invite, password reset
├── monitors/      # CRUD, bulk actions, templates, version summary
├── checks/        # Check execution, plugin system, scheduler
├── alerts/        # Alert channels, notification dispatch
├── status-pages/  # Public pages, widget resolvers, webhooks
├── incidents/     # Incident CRUD, timeline, linked monitors
├── maintenance/   # Maintenance windows, alert suppression
├── dashboard/     # Aggregated stats, public JSON API
├── apikeys/       # API key management
├── agent/         # Agent report ingestion
├── team/          # Invite management, team members
├── users/         # Admin user management
├── settings/      # Backup/restore, notification preferences
├── tags/          # Monitor tagging
├── folders/       # Monitor grouping
├── realtime/      # Socket.io gateway
└── common/        # AuthGuard, RolesGuard, CsrfMiddleware, AuditService, PrismaService
```

---

## Tool Registry

The tool registry (`packages/tool-registry/`) is a TypeScript static catalog of 2500+ self-hosted tools. Each entry defines:

```typescript
{
  id: "portainer",
  name: "Portainer",
  category: "Container",
  icon: "https://cdn.simpleicons.org/portainer",
  versionSource: {
    type: "json-path",
    urlTemplate: "{{instanceUrl}}/api/status",
    jsonPath: "$.Version"
  },
  latestSource: {
    type: "github-releases",
    target: "portainer/portainer"
  },
  requiresInstanceUrl: true,
  verified: true
}
```

The API serves this at `GET /v1/tool-registry` (filterable by q + category). The Versions page uses it as step 1 of the monitor create flow — pick a tool, auto-fill the form.

**Adding a new tool**: add an entry to `REGISTRY_PART*` in `src/registry.ts`, run `npm run registry:lint` to validate, and submit a PR.

---

## Plugin System

Custom check types can be loaded as plugins. A plugin implements the `MonitorPlugin` interface:

```typescript
interface MonitorPlugin {
  id: string;                          // unique identifier
  name: string;
  configSchema: Record<string, unknown>; // JSON Schema for config
  execute(target: string, config: unknown): Promise<PluginExecutionResult>;
}
```

Plugins run in a sandboxed context. See [PLUGINS.md](./PLUGINS.md) for authoring, packaging, and verification flow.

---

## WebSocket Events

Socket.io namespace: `/` (same port as API)

| Event | Direction | Payload |
|---|---|---|
| `subscribe` | client → server | `{ userId }` |
| `monitor.checked` | server → client | `{ run: MonitorRun }` |
| `alert.triggered` | server → client | `{ alert: AlertEvent }` |
| `status-page:join` | client → server | `{ slug }` |
| `status-page:leave` | client → server | `{ slug }` |
| `status.updated` | server → client | `{ slug, level, monitors }` |

---

## Database Schema Highlights

Key models and their purpose:

| Model | Purpose |
|---|---|
| `User` | Auth, profile, 2FA, sessions |
| `Monitor` | Check definition (type, target, interval, config) |
| `MonitorRun` | Individual check result (ok, latency, level, message) |
| `AlertChannel` | Destination config (email/slack/discord/etc) |
| `MonitorAlert` | Links monitor ↔ alert channel + notifyOn setting |
| `Incident` | Incident report with severity, timeline updates |
| `MaintenanceWindow` | Scheduled downtime with affected monitors |
| `PublicStatusPage` | Status page with layout JSON (widgets) |
| `StatusPageHistory` | Snapshot of layout before each save (last 10) |
| `ApiKey` | Bearer tokens for programmatic access |
| `AuditLog` | Immutable action log (actor, target, meta) |
| `Tag` + `MonitorTag` | Many-to-many monitor tagging |
| `Folder` | Monitor grouping |
| `InviteToken` | One-time invite links |
| `PasswordResetToken` | Single-use, 15min TTL |
| `Session` | Refresh token store (enables revocation) |

---

## Performance Considerations

- **Scheduler**: concurrent `Promise.allSettled()` dispatch — one slow check doesn't block others
- **DB indexes**: `MonitorRun` indexed on `(monitorId, checkedAt DESC)` for fast latest-run lookups
- **Widget resolvers**: each widget endpoint queries only the data it needs, no over-fetching
- **SSR caching**: status page SSR uses `cache: "no-store"` — always fresh data, no stale builds
- **Registry**: tool registry loaded into memory on startup, never queried per-request
- **Rate limiting**: 120 req/min global, 5 req/min on auth endpoints (stricter)

---

## Security Model

See [SECURITY.md](./SECURITY.md) for the full security posture. Key points:

- All mutations require CSRF token (double-submit cookie)
- JWT access tokens are short-lived (15 min); refresh tokens are DB-backed (revocable)
- Passwords: bcrypt (cost factor 10), minimum 12 chars, complexity enforced
- Account lockout after 5 failed logins (15 min)
- Email verification required (configurable)
- Helmet for security headers (HSTS, CSP, X-Frame-Options, etc.)
- Input sanitization on all stored user content
- Audit log for all sensitive admin and auth actions
