# @pulsedock/api

NestJS backend API for PulseDock.

## Dev

```bash
npm run dev:api
```

Runs on `:4321`. Swagger docs at `http://localhost:4321/api/docs`.

## Build

```bash
npm run build -w @pulsedock/api
```

## Test

```bash
NODE_ENV=test npm run test -w @pulsedock/api
```

## Key modules

- `auth/` — JWT auth, 2FA, CSRF, audit log
- `monitors/` — CRUD, bulk actions, version discovery
- `checks/` — Scheduled checks, all check types
- `alerts/` — Alert channels, notification delivery
- `incidents/` — Incident management
- `status-pages/` — Public status page builder
- `maintenance/` — Maintenance windows
