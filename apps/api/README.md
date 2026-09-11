# @pulsedock/api

NestJS backend API for PulseDock. Handles all server-side logic: auth, monitoring, alerts, incidents, status pages, version checks.

## Tech Stack

- **Framework:** NestJS + Fastify
- **Database:** PostgreSQL via Prisma ORM
- **Cache/Queue:** Redis (BullMQ)
- **Auth:** JWT (access + refresh), 2FA/TOTP, CSRF protection
- **Docs:** Swagger UI at `/api/docs`

## Development

```bash
# From repo root
npm run dev:api

# From this directory
npm run start:dev
```

Runs on port `4321`. Swagger UI: `http://localhost:4321/api/docs`

## Build

```bash
# From repo root
npm run build -w @pulsedock/api

# From this directory
npm run build
```

## Tests

```bash
# From repo root
npm run test -w @pulsedock/api

# Watch mode
npm run test:watch -w @pulsedock/api

# With coverage
npm run test:cov -w @pulsedock/api
```

1519 tests (1497 API + 10 CLI + 12 Agent), targeting >90% coverage.

## Environment Variables

Copy `.env.example` to `.env` (or set via Docker). Key vars:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_ACCESS_SECRET` | ✅ | JWT signing secret (generate with `openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | ✅ | Separate secret for refresh tokens |
| `NODE_ENV` | — | `development` or `production` |
| `API_PORT` | — | Default `4321` |
| `CORS_ORIGINS` | — | Comma-separated allowed origins |
| `SMTP_HOST` | — | For email alerts and verification |

See `.env.example` in this directory for the full list.

## Key Modules

| Module | Description |
|--------|-------------|
| `auth/` | JWT auth, 2FA/TOTP, CSRF, audit log, session management |
| `monitors/` | Monitor CRUD, bulk actions, templates, import/export |
| `checks/` | Scheduler, HTTP/TCP/SSL/Heartbeat/Version check runners |
| `alerts/` | Alert channels (Email, Slack, Discord, Telegram, Webhook) |
| `incidents/` | Incident lifecycle, updates, timeline |
| `status-pages/` | Public status page builder, widget data resolvers |
| `maintenance/` | Maintenance windows, alert suppression |
| `versions/v2/` | v2 paginated/filtered API surface |
| `agent/` | PulseDock local agent report endpoint |
| `tool-registry/` | Tool registry search API |
| `tags/` | Monitor tagging |
| `realtime/` | WebSocket gateway (socket.io) for live updates |

## API Versions

- **v1** (`/v1/...`) — Full feature API, stable
- **v2** (`/v2/...`) — Paginated + filtered endpoints for monitors, alerts, checks, system info
- **Public** (`/v1/public/...`) — Unauthenticated status page endpoints

Full documentation: [docs/API.md](../../docs/API.md)
