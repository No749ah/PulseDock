# Troubleshooting — PulseDock

## Common Issues

### Login doesn't work / "CSRF token missing"

**Cause:** Cookies not sent correctly — usually a reverse proxy issue.

**Fix:** Ensure `trust proxy` is set. In the default config this is already enabled. If using nginx, make sure it forwards `X-Forwarded-Proto`:
```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```
Also clear browser cookies and re-login.

---

### Static assets (JS/CSS) return 500

**Cause:** Usually a proxy caching issue or Next.js host validation.

**Fix:**
1. Clear nginx/proxy cache: `sudo find /var/cache/nginx -type f -delete`
2. Restart nginx: `sudo systemctl restart nginx`
3. Ensure `allowedHosts` in `next.config.mjs` includes your domain

---

### Version check shows "fetch failed"

**Cause:** Empty `gitlabHost` field or network issue.

**Fix:** If using GitLab, ensure the Host field is set (e.g. `gitlab.com` or your instance hostname without `https://`).

---

### Socket.io timeouts / real-time not working

**Cause:** Socket.io connecting directly to `:4321` instead of through the proxy.

**Fix:** Ensure nginx has the socket.io location block (see [NGINX.md](./NGINX.md)).

---

### Database connection fails

**Cause:** PostgreSQL not running or wrong credentials.

**Fix:**
```bash
# Check PostgreSQL
psql postgresql://pulsedock:pulsedock@localhost:5432/pulsedock -c "SELECT 1"

# Run migrations
npx prisma migrate deploy
```

---

### Build fails with TypeScript errors

**Fix:**
```bash
npm run build 2>&1 | grep "error TS"
```
Most common: missing type annotations or incompatible versions. Check CHANGELOG for breaking changes.

---

### Monitor shows wrong version after update

**Cause:** Version key is case-sensitive (e.g. `Version` vs `version`).

**Fix:** This is handled automatically — PulseDock uses case-insensitive key extraction. Click **Run** to re-check. If still wrong, verify the `appVersionEndpoint` returns the correct JSON.

---

---

### Email / SMTP not sending

**Cause:** SMTP credentials missing or wrong port.

**Fix:**
```bash
# Verify env vars are set
grep SMTP apps/api/.env

# Test SMTP from the server (requires curl with SMTP support or swaks)
swaks --auth --server smtp.gmail.com --port 587 --au your@gmail.com --ap apppassword -t recipient@example.com
```

If using Gmail: enable "App Passwords" (required when 2FA is on). Set `SMTP_PORT=587` and `SMTP_SECURE=false`.

---

### API returns 401 after password change

**Cause:** Old access tokens are invalidated on password change.

**Fix:** Log out completely (clear localStorage), then log back in. All existing refresh tokens are also revoked automatically.

---

### Redis connection errors

**Cause:** Redis not running or wrong URL.

**Fix:**
```bash
# Check Redis
redis-cli -u redis://localhost:6379 ping
# Should return: PONG

# For Docker Compose, use the service name:
REDIS_URL=redis://redis:6379
```

---

### Agent not reporting / "Unauthorized"

**Cause:** API key is expired, revoked, or has insufficient scope.

**Fix:**
1. Go to **Account → API Keys** and create a new key with `write` scope
2. Update `PULSEDOCK_API_KEY` in the agent's environment
3. Restart the agent container: `docker restart pulsedock-agent`

---

### Status page widgets show no data

**Cause:** Widgets are not linked to a monitor, or the monitor has no runs yet.

**Fix:**
1. Click a widget in the editor → check **Monitor** selection in the config panel
2. Ensure the linked monitor has run at least once (check Monitors page)
3. For version widgets: the monitor must be a "Version Check" type

---

### Playwright E2E tests fail locally

**Cause:** Services not running or wrong base URL.

**Fix:**
```bash
# Start services first
cd projects/PulseDock && npm run dev

# Then in another terminal
cd packages/e2e && PLAYWRIGHT_BASE_URL=http://localhost:1234 npx playwright test
```

---

### `npm run build` OOM (out of memory)

**Cause:** Next.js build requires ~2GB RAM. TypeScript registry parsing is memory-intensive.

**Fix:**
```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

---

### `prisma migrate dev` fails with "drift"

**Cause:** Migration history is out of sync with the database state.

**Fix:**
```bash
# Reset development DB (WARNING: destroys all data)
npx prisma migrate reset

# Or manually resolve drift:
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

---

## Getting Help

- GitHub Issues: https://github.com/No749ah/PulseDock/issues
- API logs: `docker compose logs pulsedock-api -f`
- Web logs: `docker compose logs pulsedock-web -f`
- Check API health: `curl http://localhost:4321/health`
