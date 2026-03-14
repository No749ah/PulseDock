# PulseDock

> Open-source version intelligence & uptime monitoring for your applications

PulseDock monitors your apps for version updates, security patches, and uptime — then tells you exactly what changed and why it matters.

**[🚀 Get Started](#quick-start)** • **[📖 Docs](./docs)** • **[🏗️ Architecture](./docs/ARCHITECTURE.md)** • **[🛠️ Development](./docs/WORKFLOW.md)**

---

## Features

✨ **Real-time Monitoring**
- Track version changes across all your apps with live WebSocket status updates
- Automatic changelog summaries and semantic version tracking
- Paginated history via v2 API (`GET /v2/checks`, `GET /v2/monitors`)

🔔 **Multi-channel Alerts**
- Email, Discord, Slack, Telegram, and webhook notification channels
- Per-monitor alert channel assignment
- Alert test endpoint before saving

🔒 **Security First**
- Detect vulnerable versions instantly
- Helmet, CORS, CSP, rate limiting, input validation on all endpoints
- JWT sessions (httpOnly cookies), DB-backed revocation, audit trail

🌐 **Public Status Pages**
- Shareable real-time status pages — one URL per user, no auth required

🔌 **Plugin System**
- Ship custom monitor types as plugins — typed contracts, sandboxed execution
- Starter plugin: `http.response-match` (regex matching on response bodies)
- See [PLUGINS.md](./docs/PLUGINS.md) for packaging and verification

🖥️ **Browser Extension**
- Chrome MV3 extension for one-click monitor creation from any tab
- Context-menu integration, API key auth, dark-themed popup
- See [EXTENSION.md](./docs/EXTENSION.md) for installation

⌨️ **CLI Tool**
- `pulsedock check <url>` — one-shot HTTP health check from the terminal
- `pulsedock monitors list/check` — interact with your monitors via API key
- See [CLI.md](./docs/CLI.md) for usage and configuration

📱 **PWA Support**
- Install banner (Chromium) and Add-to-Home-Screen hint (iOS)
- Service worker with offline fallback page
- Contextual skeleton loading on all major pages

📦 **Self-Hosted**
- Your data stays yours — deploy on your own infra with Docker or Kubernetes
- `docker-compose.prod.yml` and `k8s/` manifests included

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker (for containerized deployment)

### Development

```bash
# Clone and setup
git clone git@github.com:No749ah/PulseDock.git
cd PulseDock
npm install

# Configure environment (see docs/START.md for details)
cp .env.example .env
# Edit .env with your database + Redis credentials

# Run services
npm run restart
# API: http://localhost:4321
# Web: http://localhost:1234
```

### Production

See [Deployment Guide](./docs/DEPLOYMENT.md).
Kubernetes manifests are available in [`k8s/`](./k8s).

---

## Architecture

PulseDock is built with modern, battle-tested tools:

- **Frontend:** Next.js 16 + React 19 + Tailwind CSS + Framer Motion
- **Backend:** NestJS + TypeScript + Prisma ORM
- **Database:** PostgreSQL (versioned data, audit logs)
- **Cache:** Redis (sessions, real-time updates)
- **Security:** Helmet, CORS, CSP, rate limiting, structured logging
- **Monitoring:** Prometheus metrics, health endpoints, request tracking

Full architecture overview: [ARCHITECTURE.md](./docs/ARCHITECTURE.md)

---

## Development Workflow

### Daily Work Cycle

1. **Health Check** — `npm run build && npm audit`
2. **Pick from BACKLOG** — Open `BACKLOG.md`, work on top item
3. **Code & Test** — Write code, run `npm run build`, self-test
4. **Restart Services** — `npm run restart` (API + Web)
5. **Verify** — Health checks, API tests, browser checks
6. **Commit & Push** — Conventional messages to heartbeat branch

### Heartbeat Cycle (Twice Daily)

At **~12:00 UTC** and **~00:00 UTC**:
- Merge `heartbeat/YYYY-MM-DD-*` → `dev`
- Delete old branch
- Create new heartbeat branch from `dev`

See [WORKFLOW.md](./docs/WORKFLOW.md) for details.

---

## Key Commands

```bash
# Development
npm run dev:api      # NestJS with ts-node (watches changes)
npm run dev:web      # Next.js dev server
npm run restart      # Kill and restart both services (API then Web)

# Building
npm run build        # Build web + API for production
npm run build -w @pulsedock/cli   # Build CLI

# Database
npm run prisma:generate   # Generate Prisma client
npm run prisma:migrate    # Run pending migrations

# Testing
npm run test         # All tests (web TS check + API vitest + CLI vitest)
npm audit            # Vulnerability check

# CLI (after build)
node packages/cli/dist/index.js check <url>
node packages/cli/dist/index.js monitors list
```

## API v1 / v2

PulseDock ships two stable API versions:

| Version | Status | Key features |
|---------|--------|-------------|
| `v1` | **stable** | Full CRUD — monitors, alerts, auth, API keys, dashboard, plugins |
| `v2` | **stable** | Paginated envelopes `{ data, meta }` · filtering · sorting · extended system info |

v2 endpoints: `GET /v2/monitors` · `GET /v2/alert-channels` · `GET /v2/checks` · `GET /v2/system/info` · `GET /v2/system/versions`

Both versions run concurrently — v1 is never removed, v2 is additive only.

---

## Project Structure

```
PulseDock/
├── apps/
│   ├── api/              # NestJS API (port 4321)
│   │   └── src/
│   │       ├── auth/         # JWT, sessions, invite flow, password reset
│   │       ├── monitors/     # Monitor CRUD, version checks, export/import
│   │       ├── alerts/       # Alert channels + multi-channel dispatch
│   │       ├── checks/       # Scheduler, plugin sandbox, check history
│   │       ├── apikeys/      # API key management (pdck_* tokens)
│   │       ├── realtime/     # Socket.io gateway, live events
│   │       ├── v2/           # V2 API (paginated envelopes, extended endpoints)
│   │       └── common/       # Prisma, logging, guards, metrics, audit
│   │
│   └── web/              # Next.js 16 Frontend (port 1234)
│       ├── app/
│       │   ├── components/   # Skeleton, Card, Button, Table, Modal, Badge…
│       │   ├── dashboard/    # Stats + realtime activity
│       │   ├── monitors/     # CRUD, plugin config, alert assignment
│       │   ├── alerts/       # Alert channel management
│       │   ├── account/      # Profile, API keys, sessions
│       │   ├── admin/        # User management, audit logs, health widget
│       │   ├── versions/     # Version matrix
│       │   ├── offline/      # PWA offline fallback page
│       │   └── status/       # Public status page
│       └── components/
│           ├── app-frame.tsx       # Sidebar nav shell
│           ├── pwa-install-banner.tsx  # Install prompt
│           └── sw-register.tsx     # Service worker registration
│
├── packages/
│   ├── cli/              # @pulsedock/cli — terminal tool
│   │   └── src/          # check/monitors/config commands, 10 unit tests
│   └── extension/        # @pulsedock/extension — Chrome MV3 extension
│       └── src/          # popup, background worker, context menu
│
├── k8s/                 # Kubernetes manifests (base + prod overlay)
├── prisma/              # Schema + migrations
├── scripts/             # Service control (start/stop/restart/stop-api…)
├── docs/               # Full documentation suite
├── .env                # Root environment (shared by all apps)
├── package.json        # npm workspace config
└── BACKLOG.md          # Development roadmap
```

---

## Documentation

- **[START.md](./docs/START.md)** — Complete setup guide (ports, env vars, databases)
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — System design & tech decisions
- **[API.md](./docs/API.md)** — API endpoints, auth, error handling
- **[DEPLOYMENT.md](./docs/DEPLOYMENT.md)** — Docker Compose + Kubernetes production deployment
- **[WORKFLOW.md](./docs/WORKFLOW.md)** — Heartbeat cycle, branching, development process
- **[GITFLOW.md](./docs/GITFLOW.md)** — Git strategy (main/dev/heartbeat branches)
- **[PROXY_SETUP.md](./docs/PROXY_SETUP.md)** — Nginx reverse proxy configuration
- **[PLUGINS.md](./docs/PLUGINS.md)** — Plugin contracts, packaging, and verification
- **[CLI.md](./docs/CLI.md)** — CLI tool usage and configuration
- **[EXTENSION.md](./docs/EXTENSION.md)** — Browser extension installation and development

---

## Tech Stack

| Component | Tech | Version |
|-----------|------|---------|
| **Frontend** | Next.js | 16.1.6 |
| | React | 19.2.0 |
| | Tailwind CSS | 4.2.1 |
| | Framer Motion | 12.35.2 |
| **Backend** | NestJS | 11.1.6 |
| | Prisma ORM | 7.4.0 |
| | PostgreSQL | 16+ |
| | Redis | 7+ |
| **Node** | Node.js | 20+ |

---

## Security

- ✅ Helmet: HTTP security headers (CSP, HSTS, etc.)
- ✅ Rate limiting: 120 req/min per IP
- ✅ CORS: Configurable, locked down by default
- ✅ Input validation: class-validator on all endpoints
- ✅ JWT: Access + refresh token flow, httpOnly cookies support
- ✅ Logging: Structured JSON logs (no console.log leaks)
- ✅ Audit: Comprehensive audit trail for admin actions

---

## Testing

- ✅ **89 tests** — Vitest unit + integration tests across 7 test files
- ✅ Unit tests for Auth, Monitors, Metrics, Alerts, Plugins, CLI
- ✅ Integration tests for all API endpoints (v1 + v2), auth flows, and input validation
- ✅ TypeScript strict mode — both apps compile cleanly under `strict: true`
- ✅ GitHub Actions CI — runs build + lint + tests on every push and PR

```bash
npm run test          # All tests (web type-check + API vitest)
npm run test -w @pulsedock/api  # API tests only
npm run test -w @pulsedock/cli  # CLI tests only
```

---

## Contributing

Contributions welcome! For details, see [WORKFLOW.md](./docs/WORKFLOW.md).

---

## License

Apache License 2.0 — See [LICENSE](./LICENSE) file.

---

## Community

- **GitHub Issues:** [Report bugs or suggest features](https://github.com/No749ah/PulseDock/issues)
- **GitHub Discussions:** [Ask questions or share ideas](https://github.com/No749ah/PulseDock/discussions)

---

**Built with ⚡ by [No749ah](https://github.com/No749ah)**
