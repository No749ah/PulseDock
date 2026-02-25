# Start Instructions (Latest)

This file documents the canonical start steps for local development / demo.

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

To stop:
- npm run stop:api
- npm run stop:web

Notes:
- Use ./scripts/run-in-project.sh -- <command> to run commands with .env files loaded.
- We removed old / heavyweight landing hero. The new landing is in projects/PulseDock/apps/web/components/new-landing.tsx
