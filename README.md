# PulseDock

Open-source platform for uptime checks, version monitoring, and status pages.

## Stack

- **API:** NestJS (`apps/api`)
- **Web:** Next.js + Mantine (`apps/web`)
- **DB:** PostgreSQL + Prisma
- **Cache/Queue helper:** Redis

## Quick start

```bash
npm install --include=dev
cp .env.example .env

# Optional sanity check — ensures canonical ports (3000,4000) are free before starting dev servers
npm run dev:check || echo "Ports in use — if intentional, update .env.example and README to match."

docker compose up -d postgres redis
npm run api
npm run web
```

- Web: http://localhost:3000
- API: http://localhost:4000
- Swagger: http://localhost:4000/docs
- Version endpoint: http://localhost:4000/version

Notes
- Ensure NEXT_PUBLIC_API_BASE_URL is set in your .env so the web frontend targets the correct API host for browser requests. By default .env.example sets NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
- If your local environment intentionally runs the API on a different port (e.g., :4001), update .env and README accordingly so dev:check matches your setup.

## Default first login

- Email: `admin@pulsedock.dev`
- Password: `admin123`

On first login, password change is required.

## Core endpoints

- `GET /health`
- `GET /version`
- `GET /v1/system/version`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `GET /v1/monitors/version-summary`
- `GET/POST/PATCH/DELETE /v1/monitors`
- `GET /v1/public/overview/:userId`

## Version monitor notes

- Supports providers: GitHub, GitLab, Docker, APT
- App endpoint discovery supports token auth and OpenVPN auth mode
- `latest*` fields are ignored for deployed/current version detection
