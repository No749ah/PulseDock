# API Path Reference

PulseDock exposes the API through three distinct access paths. Using the wrong
path (e.g., `/api/v1/*` directly against NestJS on port 4321) silently returns
a 404 and is a common source of confusion during heartbeat health checks.

---

## Access Path Topology

```
Browser / curl
     │
     ├─── https://oc-dev-test.no749ah.com/*
     │         nginx/OpenResty reverse proxy
     │         ├─ /* → Next.js (port 1234)
     │         └─ (API reached via Next.js proxy)
     │
     ├─── http://localhost:1234/*           (Next.js dev/prod server)
     │         ├─ /login, /dashboard, …    → Next.js pages (rendered here)
     │         └─ /api/*                   → Route Handler proxy → NestJS (4321)
     │
     └─── http://localhost:4321/*           (NestJS direct)
               ├─ /v1/*                    → v1 REST API
               ├─ /v2/*                    → v2 REST API (paginated)
               ├─ /health                  → health check
               ├─ /docs                    → Swagger UI
               └─ /socket.io/*             → WebSocket
```

---

## URL Mapping Table

| What you want                  | Direct API (4321)              | Via Web Proxy (1234)              | Via nginx (public)                        |
|-------------------------------|-------------------------------|-----------------------------------|-------------------------------------------|
| Health check                   | `GET /health`                  | `GET /api/health`                  | `GET /api/health`                          |
| Swagger UI                     | `GET /docs`                    | *(not proxied)*                    | *(not proxied)*                            |
| List monitors                  | `GET /v1/monitors`             | `GET /api/v1/monitors`             | `GET /api/v1/monitors`                     |
| System info                    | `GET /v2/system/info`          | `GET /api/v2/system/info`          | `GET /api/v2/system/info`                  |
| Tool registry                  | `GET /v1/tool-registry`        | `GET /api/v1/tool-registry`        | `GET /api/v1/tool-registry`                |
| WebSocket                      | `ws://localhost:4321/socket.io`| `ws://localhost:1234/api/socket.io`| `wss://oc-dev-test.no749ah.com/api/socket.io` |

### Key Rule

> **`/api/v1/*`** is a **Next.js Route Handler** path.  
> It does **not** exist on NestJS (port 4321).  
> Probing `http://localhost:4321/api/v1/monitors` returns 404.

---

## Quick Reference for Scripts

```bash
# Correct: probe NestJS directly on its own paths
curl http://localhost:4321/health          # → 200
curl http://localhost:4321/v1/monitors     # → 401 (auth guard)
curl http://localhost:4321/v1/tool-registry # → 200

# Correct: probe via Next.js proxy (tests full stack)
curl http://localhost:1234/api/v1/monitors # → 401 (proxied + auth guard)

# WRONG: /api/* does not exist on port 4321
curl http://localhost:4321/api/v1/monitors # → 404 (don't use this)
```

---

## Environment Variables

| Variable            | Default                    | Used by                          |
|--------------------|----------------------------|----------------------------------|
| `INTERNAL_API_URL`  | `http://localhost:4321`    | Next.js Route Handler proxy      |
| `DIRECT_API_URL`    | `http://localhost:4321`    | `scripts/verify-deployment.sh`   |
| `WEB_BASE_URL`      | `http://localhost:1234`    | `scripts/verify-deployment.sh`   |
| `REVERSE_PROXY_URL` | `https://oc-dev-test.no749ah.com` | `scripts/verify-deployment.sh` |

---

## Verification Script

Use `scripts/verify-deployment.sh` after every deploy to validate all three
access paths and catch routing misconfigurations early:

```bash
# Local only (default)
./scripts/verify-deployment.sh

# Include public reverse proxy check
./scripts/verify-deployment.sh --public
```

The script also checks the anti-pattern guard (ensures `/api/*` on port 4321
returns 404, confirming NestJS is not accidentally serving that path).

See also: [`scripts/smoke-test.sh`](../scripts/smoke-test.sh) for a broader
end-to-end sanity check, and [`scripts/perf-check.sh`](../scripts/perf-check.sh)
for performance benchmarking.
