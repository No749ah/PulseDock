# PulseDock

> Open-source version intelligence & uptime monitoring for your applications

PulseDock monitors your apps for version updates, security patches, and uptime — then tells you exactly what changed and why it matters.

**[🚀 Get Started](#quick-start)** • **[📖 Docs](./docs)** • **[🏗️ Architecture](./docs/ARCHITECTURE.md)** • **[🛠️ Development](./docs/WORKFLOW.md)**

---

## Features

✨ **Real-time Monitoring**
- Track version changes across all your apps with live status updates
- Automatic changelog summaries and semantic version tracking
- Realtime alerts via email, Discord, Slack, webhooks

🔒 **Security First**
- Detect vulnerable versions instantly
- Never miss a critical security patch
- Audit logs for compliance

🌐 **Public Status Pages**
- Share beautiful, real-time status pages with your team or stakeholders
- Shareable URLs, customizable per project

📦 **Self-Hosted**
- Your data stays yours
- Deploy on your infrastructure with Docker
- PostgreSQL + Redis backend

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
npm run restart      # Kill and restart both services

# Building
npm run build        # Build both API and Web for production
npm run dev          # Show available commands

# Database
npm run prisma:generate   # Generate Prisma client
npm run prisma:migrate    # Run pending migrations

# Testing
npm run test         # Run all tests (add this — currently missing!)
npm audit            # Check for vulnerabilities
```

---

## Project Structure

```
PulseDock/
├── apps/
│   ├── api/              # NestJS API (port 4321)
│   │   ├── src/
│   │   │   ├── auth/     # Authentication, JWT, sessions
│   │   │   ├── monitors/ # Monitor CRUD + health checks
│   │   │   ├── alerts/   # Alert channels + dispatch
│   │   │   ├── checks/   # Scheduled version checks
│   │   │   ├── users/    # User management, admin controls
│   │   │   └── common/   # Prisma, logging, guards, middleware
│   │   └── package.json
│   │
│   └── web/              # Next.js Frontend (port 1234)
│       ├── app/
│       │   ├── components/    # Reusable Tailwind components
│       │   ├── dashboard/     # Main app pages
│       │   ├── login/         # Auth flow
│       │   └── account/       # User settings
│       ├── lib/              # API client, auth helpers
│       └── package.json
│
├── prisma/              # Database schema + migrations
├── scripts/             # Service control (start/stop/restart)
├── docs/               # Documentation (see below)
├── .env                # Root environment (shared by both apps)
├── package.json        # Workspace config + npm scripts
└── BACKLOG.md          # Development roadmap
```

---

## Documentation

- **[START.md](./docs/START.md)** — Complete setup guide (ports, env vars, databases)
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — System design & tech decisions
- **[API.md](./docs/API.md)** — API endpoints, auth, error handling
- **[WORKFLOW.md](./docs/WORKFLOW.md)** — Heartbeat cycle, branching, development process
- **[GITFLOW.md](./docs/GITFLOW.md)** — Git strategy (main/dev/heartbeat branches)
- **[PROXY_SETUP.md](./docs/PROXY_SETUP.md)** — Nginx reverse proxy configuration

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

Currently:
- ESLint + Prettier (code style)
- Vitest configured (unit tests)
- TypeScript strict mode

TODO:
- Add comprehensive unit tests (>80% coverage)
- Add integration tests for API endpoints
- Add e2e tests for critical user flows

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
