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

## Endpoints

### Health Check

**Endpoint:** `GET /health`

**Authentication:** None

**Response:**
```json
{
  "ok": true,
  "service": "pulsedock-api",
  "runtime": "nestjs"
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
- [START.md](./START.md) — Setup guide
