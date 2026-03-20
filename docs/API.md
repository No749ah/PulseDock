# API Documentation

Complete reference for PulseDock API endpoints, authentication, and error handling.

---

## Base URL

- **Development:** `http://localhost:4321`
- **Production:** `https://oc-dev-test.no749ah.com/api` (proxied via Next.js)
- **API Version:** v1 (prefix: `/v1/...`)

---

## Authentication

### Login (Get Tokens)

**Endpoint:** `POST /v1/auth/login`

**Request:**
```json
{
  "email": "admin@pulsedock.dev",
  "password": "admin123"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "cuid123",
    "email": "admin@pulsedock.dev",
    "role": "admin",
    "name": "Admin User"
  }
}
```

### Token Usage

Include the access token in all authenticated requests:

```bash
curl http://localhost:4321/v1/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Refresh Token

**Endpoint:** `POST /v1/auth/refresh`

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": { ... }
}
```

### Logout (Revoke Session)

**Endpoint:** `POST /v1/auth/logout`

**Header:**
```
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "ok": true
}
```

---

## Endpoint Overview

PulseDock has **143 endpoints** across 19 controllers. All authenticated endpoints require a Bearer token or API key. Full interactive docs are available at `http://localhost:4321/docs` (Swagger UI).

| Group | Prefix | Methods | Auth |
|-------|--------|---------|------|
| Health | `GET /health` | 1 | None |
| Auth | `POST /v1/auth/...` | 14 | Mixed |
| Monitors | `GET/POST/PATCH/DELETE /v1/monitors` | 22 | Required |
| Checks | `GET /v1/checks` | 3 | Required |
| Alerts | `GET/POST/PATCH/DELETE /v1/alerts` | 7 | Required |
| Incidents | `GET/POST/PATCH/DELETE /v1/incidents` | 6 | Required |
| Maintenance | `GET/POST/PATCH/DELETE /v1/maintenance` | 6 | Required |
| Status Pages | `GET/POST/PATCH/DELETE /v1/status-pages` | 12 | Mixed |
| Public Status | `GET/POST /v1/public/status/...` | 5 | None |
| Tags | `GET/POST/PATCH/DELETE /v1/tags` | 4 | Required |
| Folders | `GET/POST/PATCH/DELETE /v1/folders` | 4 | Required |
| API Keys | `GET/POST/DELETE /v1/api-keys` | 4 | Required |
| Team | `GET/POST/PATCH/DELETE /v1/team` | 8 | Mixed |
| Notifications | `GET/PATCH /v1/notifications` | 2 | Required |
| Settings | `GET/PATCH /v1/settings` | 3 | Required |
| Reports | `GET /v1/reports` | 2 | Required |
| Tool Registry | `GET /v1/tool-registry` | 1 | Required |
| Agent | `POST/GET /v1/agent` | 2 | Required |
| Admin | `GET/POST/PATCH/DELETE /v1/admin` | 12 | Admin role |
| v2 | `GET /v2/...` | 5 | Required |

---

## Endpoints

### Health Check

**Endpoint:** `GET /health`

**Authentication:** None

**Response:**
```json
{
  "ok": true,
  "service": "pulsedock-api",
  "version": "1.0.2",
  "runtime": "nestjs",
  "uptimeMs": 123456,
  "checks": {
    "database": { "status": "ok", "latencyMs": 2 },
    "redis": { "status": "ok" },
    "scheduler": { "queueDepth": 0, "lastCycleMs": 12 }
  }
}
```

### Get Current User

**Endpoint:** `GET /v1/auth/me`

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "id": "cuid123",
  "email": "admin@pulsedock.dev",
  "role": "admin",
  "createdAt": "2026-03-12T13:25:19.143Z"
}
```

### List Monitors

**Endpoint:** `GET /v1/monitors`

**Authentication:** Required

**Query Parameters:**
- `limit` (optional, default=100): Max results
- `offset` (optional, default=0): Pagination offset
- `folderId` (optional): Filter by folder

**Response:**
```json
[
  {
    "id": "mon123",
    "userId": "user123",
    "name": "API Health Check",
    "type": "HTTP",
    "target": "https://api.example.com/health",
    "intervalSec": 60,
    "timeoutMs": 5000,
    "enabled": true,
    "createdAt": "2026-03-12T13:25:19.143Z"
  }
]
```

### Create Monitor

**Endpoint:** `POST /v1/monitors`

**Authentication:** Required

**Request:**
```json
{
  "name": "API Health Check",
  "type": "HTTP",
  "target": "https://api.example.com/health",
  "intervalSec": 60,
  "timeoutMs": 5000,
  "enabled": true
}
```

**Response:**
```json
{
  "id": "mon123",
  "userId": "user123",
  "name": "API Health Check",
  "type": "HTTP",
  "target": "https://api.example.com/health",
  "intervalSec": 60,
  "timeoutMs": 5000,
  "enabled": true,
  "createdAt": "2026-03-12T13:25:19.143Z"
}
```

### Update Monitor

**Endpoint:** `PATCH /v1/monitors/:id`

**Authentication:** Required

**Request:**
```json
{
  "name": "Updated Name",
  "enabled": false
}
```

**Response:**
```json
{ ... updated monitor ... }
```

### Delete Monitor

**Endpoint:** `DELETE /v1/monitors/:id`

**Authentication:** Required

**Response:**
```json
{
  "ok": true
}
```

### Get Monitor Runs (History)

**Endpoint:** `GET /v1/monitors/:id/runs`

**Authentication:** Required

**Query Parameters:**
- `limit` (optional, default=100): Max results

**Response:**
```json
[
  {
    "id": "run123",
    "monitorId": "mon123",
    "ok": true,
    "status": 200,
    "latencyMs": 145,
    "message": "OK",
    "checkedAt": "2026-03-12T13:25:19.143Z"
  }
]
```

---

### Incidents

**Base:** `GET|POST|PATCH|DELETE /v1/incidents`

**Authentication:** Required

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/incidents` | List all incidents (active first, then resolved) |
| `POST` | `/v1/incidents` | Create incident (`title`, optional `severity`, `monitorIds`) |
| `GET` | `/v1/incidents/:id` | Get incident detail with timeline |
| `PATCH` | `/v1/incidents/:id` | Update title/status/severity/monitorIds |
| `POST` | `/v1/incidents/:id/updates` | Post status update (`body`, `status`) |
| `DELETE` | `/v1/incidents/:id` | Delete incident |

**Severity values:** `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`

**Status values:** `INVESTIGATING`, `IDENTIFIED`, `MONITORING`, `RESOLVED`

```bash
# Create incident
curl -X POST http://localhost:4321/v1/incidents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "API degraded", "severity": "HIGH", "monitorIds": ["mon123"]}'

# Post update
curl -X POST http://localhost:4321/v1/incidents/inc123/updates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"body": "Root cause identified — DB connection pool exhausted", "status": "IDENTIFIED"}'
```

---

### Maintenance Windows

**Base:** `GET|POST|PATCH|DELETE /v1/maintenance`

**Authentication:** Required

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/maintenance` | List all windows (ordered by startsAt) |
| `GET` | `/v1/maintenance/active` | List currently active windows |
| `GET` | `/v1/maintenance/:id` | Get single window |
| `POST` | `/v1/maintenance` | Create window (`name`, `startsAt`, `endsAt`, optional `monitorIds`) |
| `PATCH` | `/v1/maintenance/:id` | Update window (monitorIds replaces all linked monitors) |
| `DELETE` | `/v1/maintenance/:id` | Delete window |

During active windows, alerts for linked monitors are **suppressed**.

```bash
# Schedule maintenance for next weekend
curl -X POST http://localhost:4321/v1/maintenance \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Database migration",
    "startsAt": "2026-03-22T02:00:00Z",
    "endsAt": "2026-03-22T04:00:00Z",
    "monitorIds": ["mon123", "mon456"]
  }'
```

---

### Status Pages

**Base:** `GET|POST|PATCH|DELETE /v1/status-pages`

**Authentication:** Required (management); None (public view)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/status-pages` | ✅ | List my pages |
| `POST` | `/v1/status-pages` | ✅ | Create page |
| `GET` | `/v1/status-pages/:id` | ✅ | Get page + layout |
| `PATCH` | `/v1/status-pages/:id` | ✅ | Update page |
| `POST` | `/v1/status-pages/:id/publish` | ✅ | Toggle publish |
| `DELETE` | `/v1/status-pages/:id` | ✅ | Delete page |
| `GET` | `/v1/status-pages/:id/history` | ✅ | Version history |
| `POST` | `/v1/status-pages/:id/history/:hid/restore` | ✅ | Restore snapshot |
| `GET` | `/v1/status-pages/slug-check` | ✅ | Check slug availability |
| `GET` | `/v1/public/status/:slug` | ❌ | Public page data |
| `POST` | `/v1/public/status/:slug/subscribe` | ❌ | Subscribe to updates |
| `GET` | `/v1/public/status/:slug/widget/:widgetId` | ❌ | Widget live data |
| `GET` | `/v1/public/status/:slug/feed.xml` | ❌ | RSS feed |
| `GET` | `/v1/public/status/:slug/json` | ❌ | JSON status summary |

---

### API Keys

**Base:** `GET|POST|DELETE /v1/api-keys`

**Authentication:** Required

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/api-keys` | List keys (hash never exposed) |
| `POST` | `/v1/api-keys` | Create key — plaintext returned **once only** |
| `POST` | `/v1/api-keys/:id/rotate` | Rotate key — new plaintext returned once |
| `DELETE` | `/v1/api-keys/:id` | Revoke key |

**Scopes:** `read`, `write`, `admin`

```bash
# Create an API key
curl -X POST http://localhost:4321/v1/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "CI/CD pipeline", "scope": "write"}'

# Use API key instead of Bearer token
curl http://localhost:4321/v1/monitors \
  -H "X-API-Key: pd_live_abc123..."
```

---

### Team

**Base:** `GET|POST|PATCH|DELETE /v1/team`

**Authentication:** Mixed

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/team/invite/:token` | ❌ | Preview invite (for accept page) |
| `POST` | `/v1/team/invite/:token/accept` | ✅ | Accept invite |
| `GET` | `/v1/team/members` | ✅ | List members |
| `GET` | `/v1/team/invites` | ✅ | List pending invites |
| `POST` | `/v1/team/invite` | ✅ | Invite member (`email`, `role`) |
| `PATCH` | `/v1/team/members/:id` | ✅ | Update member role |
| `DELETE` | `/v1/team/members/:id` | ✅ | Remove member |
| `DELETE` | `/v1/team/invites/:id` | ✅ | Cancel invite |

**Roles:** `VIEWER`, `EDITOR`, `ADMIN`

---

## Error Responses

### Standard Error Format

All errors return this format:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "status": 400
  },
  "requestId": "130829c4-8a1a-40af-8b9a-729e69a4c0cd",
  "timestamp": "2026-03-12T13:25:19.143Z",
  "path": "/v1/monitors",
  "method": "GET"
}
```

### Common Status Codes

| Code | Meaning | Common Cause |
|------|---------|--------------|
| **200** | Success | Request completed |
| **201** | Created | Resource created |
| **400** | Bad Request | Invalid input (validation error) |
| **401** | Unauthorized | Missing/invalid token |
| **403** | Forbidden | Insufficient permissions |
| **404** | Not Found | Resource doesn't exist |
| **409** | Conflict | Duplicate/constraint violation |
| **429** | Too Many Requests | Rate limit exceeded (120 req/min) |
| **500** | Server Error | Internal error (check logs) |

---

## Rate Limiting

- **Limit:** 120 requests per minute per IP
- **Header:** `X-RateLimit-Remaining`
- **Response on exceed:** 429 Too Many Requests

```bash
curl http://localhost:4321/v1/monitors \
  -H "Authorization: Bearer ..." \
  -i

# Headers show:
# HTTP/1.1 200 OK
# X-RateLimit-Remaining: 119
```

---

## Request ID Tracking

Every response includes a `requestId` for debugging:

```bash
curl http://localhost:4321/v1/monitors \
  -H "Authorization: Bearer ..." \
  -H "X-Request-ID: my-custom-id"

# If you set X-Request-ID, it's used.
# Otherwise, a UUID is generated.
# Include this ID in bug reports.
```

---

## CORS

**Allowed Origins:** `*` (configurable)

**Allowed Methods:** GET, POST, PATCH, DELETE, OPTIONS

**Allowed Headers:** Content-Type, Authorization, X-Request-ID

---

## Examples

### Complete Login Flow

```bash
# 1. Login
TOKEN=$(curl -s http://localhost:4321/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pulsedock.dev","password":"admin123"}' \
  | jq -r .accessToken)

# 2. Create monitor
curl -X POST http://localhost:4321/v1/monitors \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GitHub API",
    "type": "HTTP",
    "target": "https://api.github.com/status",
    "intervalSec": 300
  }' | jq .

# 3. List monitors
curl http://localhost:4321/v1/monitors \
  -H "Authorization: Bearer $TOKEN" | jq .

# 4. Logout (revoke session)
curl -X POST http://localhost:4321/v1/auth/logout \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## Testing with curl

### Helper Script

```bash
#!/bin/bash

API="http://localhost:4321"
EMAIL="admin@pulsedock.dev"
PASSWORD="admin123"

# Login
echo "Logging in..."
RESPONSE=$(curl -s "$API/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$RESPONSE" | jq -r .accessToken)
echo "Token: $TOKEN"

# Get user
echo "Getting current user..."
curl -s "$API/v1/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq .

# List monitors
echo "Listing monitors..."
curl -s "$API/v1/monitors" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Save as `test-api.sh`, run with `bash test-api.sh`.

---

## Swagger Docs

Interactive API docs available at:

```
http://localhost:4321/docs
```

Use Swagger UI to:
- Explore all endpoints
- Test requests directly
- See response schemas
- Authorize with Bearer token

---

## References

- [REST API Best Practices](https://restfulapi.net/)
- [HTTP Status Codes](https://httpwg.org/specs/rfc9110.html#status.codes)
- [JWT Tokens](https://jwt.io/)

---

See also:
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System design
- [GETTING-STARTED.md](./GETTING-STARTED.md) — Setup guide
