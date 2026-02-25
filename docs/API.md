# PulseDock API — Complete Endpoint Reference

Base URL: `http://localhost:4000`

Swagger:
- UI: `http://localhost:4000/docs`
- JSON: `http://localhost:4000/docs-json`

Auth: Bearer JWT (`Authorization: Bearer <accessToken>`) for protected routes.

---

## 0) Health

### `GET /health`
**Response**
```json
{ "ok": true, "service": "pulsedock-api", "runtime": "nestjs" }
```

### `GET /metrics`
Returns runtime counters (JSON): requests/errors/auth login failures/alert send status.

**Manual calls**
```bash
curl http://localhost:4000/health
curl http://localhost:4000/metrics
```

---

## 1) Auth

### `POST /v1/auth/register`
> Public registration is disabled by default (`ALLOW_PUBLIC_REGISTRATION=false`).

**Body**
```json
{ "email": "user@example.com", "password": "strong-password" }
```

### `POST /v1/auth/login`
**Body**
```json
{ "email": "admin@pulsedock.dev", "password": "admin123" }
```

**Response**
```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "user": { "id": "...", "email": "admin@pulsedock.dev", "role": "admin" }
}
```

### `POST /v1/auth/refresh`
**Body**
```json
{ "refreshToken": "<jwt>" }
```

### `POST /v1/auth/invite-info`
Resolve invite metadata by token (server-authoritative email/role).

**Body**
```json
{ "token": "<inviteToken>" }
```

### `POST /v1/auth/accept-invite`
**Body**
```json
{ "token": "<inviteToken>", "password": "new-password" }
```

### `POST /v1/auth/request-password-reset`
**Body**
```json
{ "email": "user@example.com" }
```

### `POST /v1/auth/reset-password`
**Body**
```json
{ "token": "<reset-token>", "newPassword": "new-strong-password" }
```

### `GET /v1/auth/me` (protected)
Returns current auth user.

### `PATCH /v1/auth/profile` (protected)
**Body**
```json
{ "email": "new.email@example.com" }
```

### `POST /v1/auth/change-password` (protected)
**Body**
```json
{ "currentPassword": "old", "newPassword": "new" }
```

### `GET /v1/auth/sessions` (protected)
Lists latest sessions for current user.

### `POST /v1/auth/sessions/revoke` (protected)
**Body**
```json
{ "sessionId": "<session-id>" }
```

### `POST /v1/auth/sessions/revoke-all` (protected)
Revokes all active sessions of current user.

**Manual call flow**
```bash
# login
TOKEN=$(curl -s http://localhost:4000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@pulsedock.dev","password":"admin123"}' | jq -r .accessToken)

# me
curl -s http://localhost:4000/v1/auth/me -H "authorization: Bearer $TOKEN"
```

---

## 2) Dashboard

### `GET /v1/dashboard/overview` (protected)
**Response**
```json
{
  "stats": {
    "totalMonitors": 3,
    "green": 2,
    "yellow": 1,
    "red": 0,
    "uptimePct": 66.67
  },
  "latestRuns": [
    {
      "id": "...",
      "userId": "...",
      "monitorId": "...",
      "checkedAt": "2026-02-17T13:00:00.000Z",
      "ok": true,
      "statusCode": 200,
      "latencyMs": 83,
      "message": "OK",
      "level": "green"
    }
  ]
}
```

---

## 3) Monitors

Monitor types:
- `HTTP`
- `GIT_RELEASE`
- `DOCKER_IMAGE`

### `GET /v1/monitors` (protected)

### `GET /v1/monitors/version-summary` (protected)
Returns version-focused monitor view (`GIT_RELEASE` + `DOCKER_IMAGE`) with latest check status.

### `GET /v1/monitors/:id/runs` (protected)
Returns run history for the selected monitor (latest entries).

### `POST /v1/monitors` (protected)
**Body**
```json
{
  "name": "Main Website",
  "target": "https://example.com",
  "type": "HTTP",
  "intervalSec": 60,
  "timeoutMs": 5000,
  "config": { "warnAfterHours": 336, "critAfterHours": 720 },
  "alertChannelIds": [],
  "folderId": null
}
```

### `PATCH /v1/monitors/:id` (protected)
Update monitor settings.

### `DELETE /v1/monitors/:id` (protected)
Delete monitor.

### `POST /v1/monitors/run` (protected)
**Body**
```json
{ "monitorId": "<id>" }
```

**Manual calls**
```bash
# create monitor
curl -s http://localhost:4000/v1/monitors \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Main Website","target":"https://example.com","type":"HTTP","intervalSec":60}'

# run monitor
curl -s http://localhost:4000/v1/monitors/run \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"monitorId":"<id>"}'
```

---

## 4) Alert Channels

Types:
- `discord`, `webhook`, `slack`, `telegram`, `email`

### `GET /v1/alert-channels` (protected)

### `POST /v1/alert-channels` (protected)
**Body example (discord)**
```json
{
  "name": "Ops Discord",
  "type": "discord",
  "config": { "webhookUrl": "https://discord.com/api/webhooks/..." }
}
```

### `PATCH /v1/alert-channels/:id` (protected)
Update channel settings.

### `DELETE /v1/alert-channels/:id` (protected)
Delete channel.

### `POST /v1/alert-channels/test` (protected)
**Body**
```json
{ "channelId": "<id>" }
```

---

## 5) Folders

### `GET /v1/folders` (protected)
### `POST /v1/folders` (protected)
**Body**
```json
{ "name": "Production" }
```
### `PATCH /v1/folders/:id` (protected)
Update folder.

### `DELETE /v1/folders/:id` (protected)
Delete folder.

---

## 6) Admin Users

### `GET /v1/admin/users` (admin)
### `PATCH /v1/admin/users/role` (admin)
**Body**
```json
{ "userId": "<id>", "role": "user" }
```

### `PATCH /v1/admin/users/status` (admin)
**Body**
```json
{ "userId": "<id>", "isActive": false }
```

### `PATCH /v1/admin/users/update` (admin)
Update editable user fields.

**Body**
```json
{ "userId": "<id>", "email": "updated@example.com", "role": "admin", "isActive": true }
```

### `GET /v1/admin/audit-logs` (admin)
Returns latest security/business audit records.

### `GET /v1/admin/password-resets` (admin)
Returns active (non-expired, non-consumed) password reset links for admin fallback workflows.

### `DELETE /v1/admin/password-resets/:id` (admin)
Revokes a password reset link immediately.

---

## 7) Admin Invites

### `GET /v1/admin/invites` (admin)
Returns current invite tokens.

### `POST /v1/admin/invites` (admin)
**Body**
```json
{ "email": "new.user@company.com", "role": "user", "expiresInHours": 48 }
```

### `DELETE /v1/admin/invites/:id` (admin)
Revoke/delete an invite token.

**Response**
```json
{
  "id": "...",
  "email": "new.user@company.com",
  "role": "user",
  "inviteUrl": "http://localhost:3000/login?invite=...",
  "expiresAt": "2026-02-19T13:00:00.000Z"
}
```

---

## 8) Public Status

### `GET /v1/public/overview/:userId`
Public endpoint for shareable status page.

**Manual call**
```bash
curl http://localhost:4000/v1/public/overview/<userId>
```

---

## Security/operations notes

- Global rate limiting enabled via Nest Throttler.
- Auth endpoints have stricter limits.
- Disabled users are blocked at auth-guard level.
- First seeded admin has `mustChangePassword=true` until password update.
- Audit logs capture key admin/auth/monitor actions.
- Password reset tokens are one-time and expire automatically.
- Password policy enforced: min 12 + upper/lower/number/special.
- Login brute-force protection: temporary lock after repeated failures.
- Invite/reset emails are sent via SMTP when configured.
- API errors now return a consistent envelope with `requestId` and `error.code`.

## Frontend coverage matrix

- `/login` → login, invite acceptance
- `/dashboard` → health, auth/me, auth/sessions list/revoke/revoke-all, overview, monitors list/create/run, channels list, folders list, profile update, password change
- `/alerts` → channels list/create/update/delete/test
- `/folders` → folders list/create/update/delete
- `/monitors` → monitors list/update/delete/run
- `/versions` → version-centric monitor tracking (current vs latest, run now)
- `/admin` → users list/update/role/status + invites list/create + audit log
- `/status/[userId]` → public overview

All API endpoints now have either direct page interaction or session-internal interaction (refresh flow).
