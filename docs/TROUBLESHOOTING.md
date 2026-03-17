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

## Getting Help

- GitHub Issues: https://github.com/No749ah/PulseDock/issues
- Check the logs: `~/.openclaw/workspace/log/pulsedock_*.log`
