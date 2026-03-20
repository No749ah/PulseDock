<div align="center">
  <h1>⚡ PulseDock</h1>
  <p><strong>Open-source version intelligence &amp; uptime monitoring for your self-hosted stack</strong></p>

  <p>
    <a href="https://github.com/No749ah/PulseDock/actions"><img src="https://github.com/No749ah/PulseDock/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/No749ah/PulseDock/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
    <img src="https://img.shields.io/badge/tests-1519%20passing-brightgreen" alt="Tests: 1519 passing" />
    <img src="https://img.shields.io/badge/tools-2500%2B-orange" alt="2500+ tools" />
    <img src="https://img.shields.io/badge/self--hosted-free%20forever-success" alt="Self-hosted" />
    <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript strict" />
  </p>

  <p>
    <a href="#quick-start">🚀 Get Started</a> ·
    <a href="./docs">📖 Docs</a> ·
    <a href="./docs/ARCHITECTURE.md">🏗️ Architecture</a> ·
    <a href="https://github.com/No749ah/PulseDock/issues">🐛 Report Bug</a>
  </p>

  <!-- <img src="https://oc-dev-test.no749ah.com" alt="PulseDock Dashboard" width="800" /> -->
</div>

---

## What is PulseDock?

PulseDock is a **self-hosted monitoring tool** with a focus on version intelligence. It not only tells you when your services go down — it tells you when they need updating, tracks SLAs, and lets you build beautiful public status pages.

Think **Uptime Kuma + release tracking + status page builder**, all in one package.

### Why PulseDock?

| Feature | PulseDock | Uptime Kuma | Better Stack | Statuspage |
|---------|-----------|-------------|--------------|------------|
| Open Source | ✅ | ✅ | ❌ | ❌ |
| Self-Hosted | ✅ | ✅ | ❌ | ❌ |
| **Version Tracking** | ✅ | ❌ | ❌ | ❌ |
| **Tool Registry (2500+)** | ✅ | ❌ | ❌ | ❌ |
| Status Pages | ✅ | ✅ | ✅ | ✅ |
| Incident Management | ✅ | ✅ | ✅ | ✅ |
| CLI Tool | ✅ | ❌ | ✅ | ❌ |
| 100% Free | ✅ | ✅ | ❌ | ❌ |

---

## Features

### 🔍 Version Intelligence
- Track version updates for **2500+ self-hosted tools** — auto-configured, no manual setup
- Providers: GitHub Releases, Docker Hub, npm, PyPI, Cargo, Maven, Helm
- **PulseDock Agent** for tools without HTTP APIs (Proxmox, pfSense, OpenWRT, Unraid)
- Semantic version comparison with prerelease awareness

### 📡 Uptime Monitoring
- **HTTP, TCP, SSL Certificate, Heartbeat** monitor types
- Configurable intervals, timeouts, confirmation rounds (reduce alert noise)
- Response time tracking (avg, p95, max) per monitor
- **Body keyword** and **expected status code** assertions for HTTP monitors

### 📊 Public Status Pages
- Drag-and-drop status page **editor** with 70+ widget types
- Widgets: uptime bars, response time heatmaps, incident timelines, SLA summaries, and more
- Real CSS grid layout (12-column, responsive)
- Password protection, custom slugs, subscriber email forms

### 🔔 Smart Alerting
- **6 channels:** Email, Discord, Slack, Telegram, Webhook, Push
- Per-monitor channel assignment + quiet hours + digest frequency
- Maintenance windows with automatic alert suppression
- Incident management with status timeline and severity tracking

### 🛠️ Developer Tools
- **CLI:** `pulsedock check <url>` — one-shot HTTP checks from the terminal
- **Browser Extension:** Chrome MV3, one-click monitor creation from any tab
- **REST API v1 + v2:** Full CRUD, paginated envelopes, Swagger docs at `/api/docs`
- **Plugin System:** Custom monitor types with typed contracts and sandboxed execution

### 🔒 Security
- Helmet, CORS, CSP, strict rate limiting (5 req/min on auth routes)
- 2FA/TOTP, CSRF protection, account lockout, email verification
- Audit log with CSV/JSON export, session activity tracking
- TypeScript strict mode — zero `any` types

---

## Quick Start

### Prerequisites
- Node.js 20+, PostgreSQL 16+, Redis 7+
- Docker (recommended for services)

### 1. Clone & Install

```bash
git clone https://github.com/No749ah/PulseDock.git
cd PulseDock
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL and REDIS_URL (minimum required)
```

### 3. Start

```bash
npm run restart
# API:  http://localhost:4321
# Web:  http://localhost:1234
# Docs: http://localhost:4321/api/docs
```

### 4. Open the app
Navigate to **http://localhost:1234** and complete the first-run setup.

---

## Docker Compose

```bash
docker compose -f docker-compose.dev.yml up -d
```

For production deployment, see **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)**.
Kubernetes manifests are in **[k8s/](./k8s)** — Helm chart in **[helm/](./helm/pulsedock)**.

---

## Architecture

```
PulseDock/
├── apps/
│   ├── api/          # NestJS + TypeScript (port 4321)
│   └── web/          # Next.js 16 + React 19 + Tailwind (port 1234)
├── packages/
│   ├── tool-registry/ # 1468+ pre-configured tool definitions
│   ├── agent/         # Local version reporter daemon
│   ├── cli/           # @pulsedock/cli terminal tool
│   ├── extension/     # Chrome MV3 browser extension
│   └── e2e/           # Playwright end-to-end tests
├── prisma/            # Schema + migrations
├── k8s/               # Kubernetes manifests
├── helm/              # Helm chart
└── docs/              # Documentation
```

**Stack:** NestJS · Next.js 16 · React 19 · Tailwind CSS · Framer Motion · Prisma · PostgreSQL · Redis · Socket.io

Full overview: **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**

---

## Key Commands

```bash
# Development
npm run dev:api           # NestJS with hot reload
npm run dev:web           # Next.js dev server
npm run restart           # Restart both services (API → Web)

# Build & Test
npm run build             # Build everything (web + api + cli + extension)
npm run test              # Run all tests (1519+ tests)
npm audit                 # Security vulnerability check

# Database
npm run prisma:migrate    # Run pending migrations
npm run prisma:generate   # Regenerate Prisma client

# CLI (after build)
npx pulsedock check <url>          # Quick HTTP health check
npx pulsedock monitors list        # List your monitors
```

---

## Documentation

| Guide | Description |
|-------|-------------|
| **[GETTING-STARTED.md](./docs/GETTING-STARTED.md)** | Full setup with env vars, ports, and first-run guide |
| **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** | System design, tech decisions, data flow |
| **[API.md](./docs/API.md)** | REST API reference (also at `/api/docs`) |
| **[DEPLOYMENT.md](./docs/DEPLOYMENT.md)** | Docker Compose + Kubernetes production deployment |
| **[SECURITY.md](./docs/SECURITY.md)** | Security practices, CSP, CSRF, auth hardening |
| **[STATUS-PAGES.md](./docs/STATUS-PAGES.md)** | Status page builder guide, widget reference |
| **[VERSION-CHECKS.md](./docs/VERSION-CHECKS.md)** | Version monitoring, provider setup, tool registry |
| **[TOOL-REGISTRY.md](./docs/TOOL-REGISTRY.md)** | Tool registry format, adding tools, verified tools |
| **[AGENT.md](./docs/AGENT.md)** | PulseDock Agent for tools without HTTP APIs |
| **[CLI.md](./docs/CLI.md)** | CLI tool usage and configuration |
| **[EXTENSION.md](./docs/EXTENSION.md)** | Browser extension installation and development |
| **[NGINX.md](./docs/NGINX.md)** | Nginx/OpenResty reverse proxy configuration |
| **[HELM.md](./docs/HELM.md)** | Helm chart values and deployment guide |
| **[PLUGINS.md](./docs/PLUGINS.md)** | Plugin system: contracts, packaging, verification |
| **[E2E.md](./docs/E2E.md)** | End-to-end testing with Playwright |
| **[LOGGING.md](./docs/LOGGING.md)** | Log rotation, aggregation, structured logging |
| **[CONTRIBUTING.md](./CONTRIBUTING.md)** | Development workflow, PR process, standards |
| **[CHANGELOG.md](./CHANGELOG.md)** | Release history |

---

## Contributing

Contributions are welcome! Please read **[CONTRIBUTING.md](./CONTRIBUTING.md)** first.

```bash
# Fork, clone, create a branch
git checkout -b feat/your-feature

# Make changes, ensure tests pass
npm run build && npm run test

# Commit with conventional messages
git commit -m "feat: add your feature"
```

---

## Testing

PulseDock has **1519+ tests** across the full stack:

```bash
npm run test                        # All tests
npm run test -w @pulsedock/api      # API tests only (1497 tests)
npm run test -w @pulsedock/agent    # Agent tests only
npm run test -w @pulsedock/cli      # CLI tests only
```

Coverage: ~90% line coverage on the API (strict mode throughout).

---

## License

[MIT License](./LICENSE) — © 2026 [No749ah](https://github.com/No749ah)

---

<div align="center">
  <strong>Built with ⚡ by <a href="https://github.com/No749ah">No749ah</a></strong>
  <br />
  <sub>Self-hosted · Open source · Free forever</sub>
</div>
