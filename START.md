<<<<<<< HEAD
# Start Instructions (Latest)

This file documents the canonical start steps for local development / demo.

IMPORTANT: always control the services from the repository root using the top-level npm scripts below.
These wrappers load .env files, set ports correctly, and centralize logs.

Primary commands (from repo root)

- Start web:  npm run start:web
- Stop web:   npm run stop:web
- Restart web: npm run restart:web

- Start api:  npm run start:api
- Stop api:   npm run stop:api
- Restart api: npm run restart:api

Prereqs:
- Node.js (v16+ recommended) & npm
- Postgres & Redis running (use docker-compose or local services)

Start sequence (from repo root):

1. Load env (examples in projects/PulseDock/.env.example)

2. Start supporting services (Postgres, Redis):
   docker compose up -d postgres redis

3. Start API (dev):
   npm run start:api
   - This uses projects/PulseDock/apps/api/server.js wrapper and respects API_PORT (default 4321)

4. Start Web (prod wrapper):
   npm run start:web
   - This starts the web on WEB_PORT (default 1234)

Logs:
- Workspace logs: ./logs/
- Project logs: projects/PulseDock/logs/

To stop (if needed):
- npm run stop:api
- npm run stop:web

Notes:
- Use ./scripts/run-in-project.sh -- <command> to run commands with .env files loaded.
- We removed the old heavyweight landing hero. The new landing is in projects/PulseDock/apps/web/components/new-landing.tsx

Troubleshooting:
- If start fails with EADDRINUSE, run npm run stop:web then retry npm run start:web.
- If stop fails to connect to the control socket, the stop script will attempt a graceful stop and fall back to killing matching node processes.

If you want these wrappers wired into a system service (systemd / docker-compose), I can create example unit files or a docker-compose service block.
=======
# Start PulseDock

## 1) Start dependencies

```bash
docker compose up -d postgres redis
```

## 2) Apply DB migrations

```bash
DATABASE_URL="postgresql://pulsedock:pulsedock@dind:5432/pulsedock?schema=public" \
  npx prisma migrate deploy --schema=prisma/schema.prisma
```

## 3) Start API

```bash
npm run api
```

## 4) Start Web

```bash
npm run web
```

## Access

- Web: http://localhost:3000
- API: http://localhost:4000
- Swagger: http://localhost:4000/docs
>>>>>>> 79b4607e91823d9f86e37ff62f6e37e41c308b18
