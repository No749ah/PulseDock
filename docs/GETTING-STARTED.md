# Getting Started — PulseDock

PulseDock is an open-source version intelligence and uptime monitoring tool. This guide takes you from zero to a running instance in under 5 minutes.

---

## Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| Node.js | 20+ | LTS recommended |
| PostgreSQL | 15+ | For all persistent data |
| Redis | 7+ | WebSocket presence, caching |
| Docker + Compose | latest | Simplest way to run everything |

---

## Option A — Docker (recommended)

The fastest path. All services start with one command.

```bash
# 1. Clone the repository
git clone https://github.com/No749ah/PulseDock.git
cd PulseDock

# 2. Copy and configure environment
cp .env.example .env
# Minimum required changes in .env:
#   JWT_ACCESS_SECRET   → openssl rand -hex 32
#   JWT_REFRESH_SECRET  → openssl rand -hex 32
#   (everything else has safe defaults for Docker)

# 3. Start all services
docker compose up -d

# 4. Wait for startup (~30 seconds)
docker compose logs -f api | grep "Application is running"
```

Open **http://localhost:1234** — you'll see the setup wizard on first visit.

### Default ports

| Service | Port | URL |
|---|---|---|
| Web frontend | 1234 | http://localhost:1234 |
| API | 4321 | http://localhost:4321 |
| PostgreSQL | 5432 | localhost:5432 |
| Redis | 6379 | localhost:6379 |

---

## Option B — Local Development

Use this when you want to edit code with hot reload.

```bash
# 1. Clone
git clone https://github.com/No749ah/PulseDock.git
cd PulseDock

# 2. Install all dependencies (monorepo root)
npm install

# 3. Start PostgreSQL and Redis
#    (or use Docker for just the databases)
docker compose up -d postgres redis

# 4. Configure environment
cp .env.example .env
# Edit .env — minimum required:
#   DATABASE_URL=postgresql://pulsedock:pulsedock@localhost:5432/pulsedock?schema=public
#   REDIS_URL=redis://localhost:6379
#   JWT_ACCESS_SECRET=<generate with: openssl rand -hex 32>
#   JWT_REFRESH_SECRET=<generate with: openssl rand -hex 32>

# 5. Run database migrations
npm run prisma:migrate

# 6. Start development servers (in separate terminals)
npm run api       # API with hot reload on :4321
npm run dev:web   # Next.js dev server on :1234
```

### Useful development scripts

```bash
npm run build          # Build all packages
npm run test           # Run all tests (API + CLI + Agent)
npm run lint           # ESLint across all packages
npm run prisma:studio  # Open Prisma Studio (DB GUI)
npm run registry:lint  # Validate tool registry entries
```

---

## First Run — Setup Wizard

On first visit, PulseDock shows a **setup page** to create your admin account:

1. Enter your email + a strong password (12+ chars, upper/lower/digit/special)
2. Click **Create Admin Account**
3. You're logged in as admin

> If `ALLOW_PUBLIC_REGISTRATION=true` in your `.env`, users can self-register. Default is invite-only.

---

## Your First Monitor

### Uptime Monitor (HTTP)

1. Go to **Monitors** → **New Monitor**
2. Select **HTTP** type
3. Enter a URL (e.g. `https://your-app.com/health`)
4. Set check interval (default: 5 minutes)
5. Click **Create Monitor**

PulseDock will start checking immediately. The monitor card shows live status.

### Version Monitor (GitHub Release)

1. Go to **Version Checks** → **New Version Check**
2. Click **Browse Tool Registry** to pick a known tool (e.g. Portainer, GitLab, Grafana)
   - Or select **Custom** and enter a GitHub repo (`owner/repo`)
3. Enter your current version (e.g. `2.39.0`)
4. PulseDock compares it to the latest release and alerts when a new version drops

---

## Alert Channels

Connect PulseDock to where your team lives:

1. Go to **Alerts** → **New Alert Channel**
2. Choose a channel type:

| Channel | Setup |
|---|---|
| **Email** | SMTP settings in `.env` |
| **Slack** | Incoming webhook URL from Slack app |
| **Discord** | Webhook URL from Discord server settings |
| **Telegram** | Bot token + chat ID (via BotFather) |
| **Webhook** | Any HTTP endpoint — POST with JSON payload |

3. Click **Test** to verify delivery
4. Attach the channel to any monitor via **Monitor** → **Edit** → **Alert Channels**

---

## Public Status Pages

Build a public-facing status page your users can bookmark:

1. Go to **Status Pages** → **Create Page**
2. Give it a name and slug (e.g. `my-company`)
3. Open the editor — drag widgets from the palette onto the canvas
4. Configure each widget (select monitors, set labels, adjust size)
5. Click **Publish** — your page is live at `/status/my-company`

### Sharing your status page

- **Direct link**: `https://yourhost/status/my-company`
- **SVG badge**: click the Badge button on the Status Pages list → copy Markdown/HTML
- **Embed widget**: use the RSS feed for incident updates
- **Webhook**: configure a webhook URL in Page Settings → get notified on status changes

---

## Production Deployment

For a hardened production setup see [DEPLOYMENT.md](./DEPLOYMENT.md).

Quick checklist before going live:

- [ ] Strong unique `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- [ ] `NODE_ENV=production`
- [ ] `ALLOW_PUBLIC_REGISTRATION=false` (unless you want open signups)
- [ ] `REQUIRE_EMAIL_VERIFICATION=true` (if SMTP is configured)
- [ ] SMTP configured for alerts and invites
- [ ] Reverse proxy (nginx/Caddy/Traefik) with TLS — see [NGINX.md](./NGINX.md)
- [ ] Log rotation configured — see [LOGGING.md](./LOGGING.md)

### Kubernetes

See [HELM.md](./HELM.md) for the official Helm chart. Supports HPA, ingress, TLS, and separate PostgreSQL/Redis pods.

---

## CLI Tool

```bash
# One-shot HTTP check
npx @pulsedock/cli check https://your-app.com

# List monitors
npx @pulsedock/cli monitors list --api-url http://localhost:4321 --api-key YOUR_KEY

# Run a specific monitor now
npx @pulsedock/cli monitors check MONITOR_ID --api-url http://localhost:4321 --api-key YOUR_KEY
```

See [CLI.md](./CLI.md) for full reference.

---

## Local Agent

The PulseDock Agent runs on your servers and reports tool versions without external API calls:

```bash
docker run -d \
  -e PULSEDOCK_URL=https://yourhost \
  -e PULSEDOCK_API_KEY=your_key \
  -e AGENT_TOOL_IDS=portainer,gitlab-ce,redis \
  ghcr.io/no749ah/pulsedock-agent:latest
```

See [AGENT.md](./AGENT.md) for full setup, Docker Compose example, and tool ID reference.

---

## Browser Extension

Install the Chrome extension to create monitors with one click from any webpage:

1. Build: `cd packages/extension && npm run build`
2. Load `dist/` as an unpacked extension in Chrome
3. Click the PulseDock icon on any page → **Monitor This URL**

See [EXTENSION.md](./EXTENSION.md) for full setup.

---

## Architecture Overview

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a deep dive into:
- How the scheduler dispatches checks
- WebSocket real-time push
- The tool registry format
- Plugin system for custom check types

---

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues:
- Database connection errors
- JWT errors
- Email not sending
- WebSocket not connecting through reverse proxy
- Version checks returning wrong data

---

## Getting Help

- **GitHub Issues**: [github.com/No749ah/PulseDock/issues](https://github.com/No749ah/PulseDock/issues)
- **Docs**: [docs/](.) folder in this repo
- **API Reference**: `/api/docs` on any running instance (Swagger UI)
