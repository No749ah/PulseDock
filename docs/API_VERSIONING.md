# PulseDock API Versioning Strategy

## Overview

PulseDock uses **URI-based versioning** (`/v1/`, `/v2/`, ...). All API versions run concurrently — upgrading to a newer version is always opt-in. Old versions are never removed without a 180-day deprecation notice.

## Current Versions

| Version | Status | Base Path | Notes |
|---------|--------|-----------|-------|
| v1 | **Stable** | `/v1/` | Production API. No breaking changes planned. |
| v2 | **Stable** | `/v2/` | Enhanced API with pagination and envelope format. |

## Version Differences

### v1 → v2 Changes

| Feature | v1 | v2 |
|---------|----|----|
| Response format | Raw array / object | `{ data, meta }` envelope |
| Pagination | Not supported | `page`, `limit`, `pages`, `total` |
| Filtering | Not supported | `type`, `enabled`, `search` |
| Sorting | Fixed (createdAt desc) | `sortBy`, `sortDir` |
| Response envelope | Raw array / object | `{ data, meta }` |
| Breaking changes | — | None (v1 unmodified) |

### v2 New Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /v2/monitors` | Paginated monitor list with filtering + sorting |
| `GET /v2/system/info` | Extended API metadata (versions, features, links) |
| `GET /v2/system/versions` | Full version compatibility matrix |

## Response Envelope (v2)

All list endpoints in v2 return a consistent envelope:

```json
{
  "data": [ ...items ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "pages": 3
  }
}
```

## Pagination (v2)

Query parameters for paginated endpoints:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number (1-based) |
| `limit` | integer | `20` | Items per page (max 100) |
| `sortBy` | string | `createdAt` | Sort field: `name`, `createdAt`, `type`, `intervalSec` |
| `sortDir` | string | `desc` | Sort direction: `asc`, `desc` |
| `type` | string | — | Filter by monitor type: `HTTP`, `GIT_RELEASE`, `DOCKER_IMAGE` |
| `enabled` | string | — | Filter by enabled state: `true`, `false` |
| `search` | string | — | Full-text search on `name` and `target` |

## Breaking Change Policy

1. **Deprecation Notice** — At least 180 days before any breaking change, the affected version is marked deprecated. This appears in:
   - The `GET /v2/system/info` response (`apiVersions.deprecated`)
   - A `Sunset` response header on all deprecated routes
   - The CHANGELOG and GitHub releases

2. **Sunset Period** — Deprecated versions stay available for at least 365 days from their initial deprecation notice.

3. **No Silent Breaks** — v1 stays exactly as-is. New features go to new versions. Additive changes (new optional fields, new endpoints) may be added to any version without a version bump.

## Versioning Rules

- ✅ **Allowed in existing versions:** Adding optional response fields, adding new endpoints, relaxing validation constraints
- ❌ **Not allowed (requires new version):** Removing fields, renaming fields, changing response structure, adding required parameters, changing status codes

## Swagger Docs

The Swagger UI at `/docs` documents all API versions. Filter by tag:
- `Monitors` — v1 monitors
- `Monitors v2` — v2 paginated monitors
- `System` — v1 health/metrics
- `System v2` — v2 API info and version matrix

## Example: Migrating from v1 to v2

**v1 request:**
```http
GET /v1/monitors
Authorization: Bearer <token>
```
```json
[
  { "id": "...", "name": "My Monitor", ... }
]
```

**v2 request:**
```http
GET /v2/monitors?page=1&limit=20&type=HTTP
Authorization: Bearer <token>
```
```json
{
  "data": [
    { "id": "...", "name": "My Monitor", "updatedAt": "2025-06-01T00:00:00Z", ... }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "pages": 1 }
}
```
