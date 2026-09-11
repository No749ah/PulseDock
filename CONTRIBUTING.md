# Contributing to PulseDock

Thanks for your interest in contributing! PulseDock is an open-source version intelligence & uptime monitoring tool. Contributions of all kinds are welcome — bug fixes, new features, docs, tests.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for local services)
- Git

### Local Setup

```bash
# Clone the repo
git clone https://github.com/No749ah/PulseDock.git
cd PulseDock

# Copy env template
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Edit both files with your local database/redis credentials

# Start PostgreSQL + Redis (Docker Compose)
docker compose -f docker-compose.services.yml up -d

# Install dependencies (monorepo root)
npm install

# Run database migrations
npx prisma migrate dev --schema=apps/api/prisma/schema.prisma

# Start API + Web in dev mode
npm run dev
```

API runs at `http://localhost:4321`  
Web runs at `http://localhost:1234`  
Swagger docs at `http://localhost:4321/api/docs`

## Architecture Overview

PulseDock is a TypeScript monorepo with the following structure:

```
PulseDock/
├── apps/
│   ├── api/               NestJS backend (port 4321)
│   │   ├── src/
│   │   │   ├── auth/      JWT auth, 2FA, CSRF, sessions
│   │   │   ├── monitors/  Monitor CRUD, bulk actions, templates
│   │   │   ├── checks/    Scheduler, HTTP/TCP/SSL/HB runners
│   │   │   ├── alerts/    Email, Slack, Discord, Telegram, Webhook
│   │   │   ├── incidents/ Incident lifecycle + timeline
│   │   │   ├── status-pages/  Public status page builder + widgets
│   │   │   ├── maintenance/   Maintenance windows + alert suppression
│   │   │   ├── realtime/      WebSocket gateway (socket.io)
│   │   │   ├── agent/         PulseDock agent report endpoint
│   │   │   └── common/        Logger, CSRF middleware, filters
│   │   └── prisma/        Database schema + migrations
│   └── web/               Next.js 15 frontend (port 1234)
│       ├── app/           App Router pages
│       │   ├── (landing)  Public marketing page
│       │   ├── monitors/  Monitor list + detail
│       │   ├── status/    Public status pages
│       │   └── ...        All other app pages
│       └── components/    Shared components + chart library
├── packages/
│   ├── tool-registry/     Pre-configured tool library (2500+ tools)
│   ├── cli/               pulsedock CLI tool
│   ├── agent/             Local version reporter daemon
│   ├── extension/         Chrome browser extension
│   └── e2e/               Playwright E2E test suite
└── docs/                  All project documentation
```

### Key Concepts

**Monitor Scheduler**: `ChecksScheduler` runs every 10s, loads all enabled monitors, dispatches due checks concurrently via `Promise.allSettled`. Supports HTTP, TCP, SSL, Heartbeat, and version checks.

**Alert Delivery**: `AlertsService.sendWithRetry()` handles exponential backoff (1s/2s/4s) for webhook/Slack/Discord/Telegram channels. Every attempt is logged to `AlertDeliveryLog`.

**Status Pages**: JSON-based drag-and-drop layout stored in `StatusPage.layout`. Public renderer reads widget coordinates (x/y/w/h in 12-col grid) for layout. Per-widget data resolved server-side via `GET /v1/public/status/:slug/widget/:widgetId`.

**WebSocket Updates**: `RealtimeGateway` emits `monitor.checked` and `alert.triggered` events. Status pages join `status-page:{slug}` rooms for targeted push updates.

**Tool Registry**: Static registry split across `packages/tool-registry/src/registry.ts` (PART1–PART9). Each entry defines `id`, `name`, `category`, `versionSource` (url + jsonPath), `latestSource` (github/docker/npm/pypi), and `icon` (Simple Icons slug).

## Branching

| Branch | Purpose |
|---|---|
| `main` | Stable releases only |
| `dev` | Integration — all PRs target here |
| `feat/<name>` | New feature branches |
| `fix/<name>` | Bug fix branches |

Always branch from `dev`. Open PRs targeting `dev`.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add discord webhook notifications
fix: handle null currentVersion in version check
refactor: extract token refresh logic into helper
docs: update README setup instructions
test: add unit test for MonitorsService.runNow
chore: bump nestjs dependencies
```

## Code Standards

- **TypeScript strict mode** — no `any`, no implicit types
- **No `console.log`** — use the structured logger from `apps/api/src/common/logger.ts`
- **Error handling** — catch at service boundaries, throw typed NestJS exceptions
- **Validation** — all API inputs must use class-validator DTOs
- **Tests** — unit tests required for new services; run `npm run test` before pushing
- **Lint** — `npm run lint` must pass
- **Build** — `npm run build` must succeed

## Testing

```bash
# Run all tests (API + CLI + Agent)
npm run test

# Watch mode (from package directory)
cd apps/api && npm run test:watch

# Type-check only
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit

# Coverage report
cd apps/api && npm run test:cov
```

Tests live in `*.spec.ts` files next to the code they test. We use [Vitest](https://vitest.dev/).

Current: **1490+ API tests**, **10 CLI tests**, **12 Agent tests**.

## Adding a New API Endpoint

1. Create/update a service method in the appropriate module
2. Add a controller method with `@ApiOperation`, `@ApiResponse` decorators
3. Create/update DTOs with class-validator decorators in `*.dto.ts`
4. Add unit tests in `*.spec.ts`
5. If it changes database schema: create a Prisma migration (`npx prisma migrate dev --name <name>`)

## Adding a Status Page Widget

1. Add widget type to `apps/api/src/status-pages/status-pages.service.ts` resolver map
2. Create frontend component in `apps/web/app/status-pages/components/widgets/`
3. Register in `apps/web/app/status/[slug]/widgets/index.tsx`
4. Add palette entry in `apps/web/app/status-pages/[id]/edit/page.tsx` (PALETTE array)
5. Add config panel section for configurable properties

## Adding a Tool to the Registry

1. Find the correct version endpoint (verify with curl — no guessing)
2. Add entry to `packages/tool-registry/src/registry.ts` in the appropriate PART file
3. Verify the Simple Icons slug at `https://unpkg.com/simple-icons@latest/icons/<slug>.svg`
4. Test with `GET /v1/tool-registry?q=<toolname>` locally
5. Mark entry as `verified: true` only if endpoint confirmed working

## Submitting a Pull Request

1. Fork the repo and create your branch from `dev`
2. Make your changes with conventional commits
3. Ensure `npm run build && npm run test && npm run lint` all pass
4. Open a PR to the `dev` branch
5. Describe what you changed and why
6. Link any related issues

## Reporting Bugs

Open a [GitHub Issue](https://github.com/No749ah/PulseDock/issues) with:

- PulseDock version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs or screenshots

## Feature Requests

Open an issue with the `enhancement` label. Describe the use case — what problem does it solve? How does it fit PulseDock's scope?

## Security

Found a vulnerability? **Do not open a public issue.** Email `noah.bourgnon@gmail.com` directly with details. We'll acknowledge within 48 hours.

See [docs/SECURITY.md](docs/SECURITY.md) for our full security policy.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
