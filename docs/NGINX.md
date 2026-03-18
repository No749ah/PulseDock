# Nginx Reverse Proxy — PulseDock

This document covers the recommended Nginx configuration for running PulseDock behind a reverse proxy, including WebSocket support for real-time updates.

## Basic Configuration

```nginx
server {
    listen 80;
    server_name pulsedock.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pulsedock.example.com;

    ssl_certificate     /etc/letsencrypt/live/pulsedock.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pulsedock.example.com/privkey.pem;

    # Proxy everything to the Next.js web frontend
    location / {
        proxy_pass          http://localhost:1234;
        proxy_http_version  1.1;
        proxy_set_header    Host              $host;
        proxy_set_header    X-Real-IP         $remote_addr;
        proxy_set_header    X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto $scheme;
        proxy_read_timeout  60s;
    }
}
```

## WebSocket Support (Required for Real-Time Updates)

PulseDock uses Socket.io for real-time monitor status updates (dashboard live checks, alert triggers). Socket.io falls back to HTTP long-polling if WebSocket is unavailable, but for the best experience you should configure proper WebSocket proxying.

The Socket.io server is part of the API (port 4321). The web frontend proxies `/api/socket.io/*` to the API. Add these blocks to your Nginx config:

```nginx
server {
    listen 443 ssl http2;
    server_name pulsedock.example.com;

    # ... ssl certs, other config ...

    # WebSocket — Socket.io (real-time updates)
    location ~ ^/api/socket\.io {
        proxy_pass          http://localhost:4321/socket.io/;
        proxy_http_version  1.1;

        # Required for WebSocket upgrade
        proxy_set_header    Upgrade           $http_upgrade;
        proxy_set_header    Connection        "upgrade";

        proxy_set_header    Host              $host;
        proxy_set_header    X-Real-IP         $remote_addr;
        proxy_set_header    X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto $scheme;

        # Longer timeouts for persistent connections
        proxy_read_timeout  86400s;
        proxy_send_timeout  86400s;
        proxy_connect_timeout 60s;
    }

    # Everything else proxied through the web frontend
    location / {
        proxy_pass          http://localhost:1234;
        proxy_http_version  1.1;
        proxy_set_header    Upgrade           $http_upgrade;
        proxy_set_header    Connection        $connection_upgrade;
        proxy_set_header    Host              $host;
        proxy_set_header    X-Real-IP         $remote_addr;
        proxy_set_header    X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto $scheme;
        proxy_read_timeout  60s;
    }
}
```

Add the `$connection_upgrade` map in your `http {}` block (usually `/etc/nginx/nginx.conf`):

```nginx
http {
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    # ... rest of http config ...
}
```

## Complete Example Config

Full production-ready config with SSL, WebSocket, security headers, and gzip:

```nginx
# /etc/nginx/sites-available/pulsedock.conf

upstream pulsedock_web {
    server localhost:1234;
    keepalive 32;
}

upstream pulsedock_api {
    server localhost:4321;
    keepalive 32;
}

server {
    listen 80;
    server_name pulsedock.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pulsedock.example.com;

    # SSL
    ssl_certificate     /etc/letsencrypt/live/pulsedock.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pulsedock.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

    # Upload limit (for status page logos, etc.)
    client_max_body_size 10m;

    # WebSocket — Socket.io path (REQUIRED for real-time updates)
    location ~ ^/api/socket\.io {
        proxy_pass          http://pulsedock_api/socket.io/;
        proxy_http_version  1.1;
        proxy_set_header    Upgrade           $http_upgrade;
        proxy_set_header    Connection        "upgrade";
        proxy_set_header    Host              $host;
        proxy_set_header    X-Real-IP         $remote_addr;
        proxy_set_header    X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto $scheme;
        proxy_read_timeout  86400s;
        proxy_send_timeout  86400s;
        proxy_buffering     off;
    }

    # Main web frontend
    location / {
        proxy_pass          http://pulsedock_web;
        proxy_http_version  1.1;
        proxy_set_header    Upgrade           $http_upgrade;
        proxy_set_header    Connection        $connection_upgrade;
        proxy_set_header    Host              $host;
        proxy_set_header    X-Real-IP         $remote_addr;
        proxy_set_header    X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto $scheme;
        proxy_read_timeout  60s;

        # Static assets — do NOT add proxy_cache here.
        # Next.js already sends correct Cache-Control headers (immutable with content hashes).
        # Adding proxy_cache risks caching error responses (e.g. 500 during restarts)
        # which are then served until the cache expires, even after the origin is fixed.
    }
}
```

## Docker Compose with Nginx

If running PulseDock via Docker Compose, see `docker-compose.prod.yml`. Example Nginx Docker service:

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - web
      - api
```

Inside Docker, replace `localhost:1234` and `localhost:4321` with container names:
- `http://web:1234`
- `http://api:4321`

## Troubleshooting

### WebSocket connections fail (401 / 403 / 426)

Check that your Nginx config has the `Upgrade` and `Connection` headers set correctly in the `/api/socket.io/` block.

### Real-time updates not working but HTTP works

The browser console will show Socket.io transport errors. Check:
1. Nginx config has the `/api/socket.io/` location block
2. The API is running on the expected port (`curl http://localhost:4321/health`)
3. No firewall blocking the WS upgrade

### `upstream prematurely closed connection` errors

Increase `proxy_read_timeout` in the socket.io block — default 60s will time out long-lived connections.

### CORS errors in console

Ensure `CORS_ORIGINS` environment variable is set to your public domain in the API:
```env
CORS_ORIGINS=https://pulsedock.example.com
```

## Known Issues & Prevention

### Socket.io 404 (most common issue)

**Root cause:** Next.js 308-redirects `/api/socket.io/` → `/api/socket.io` (strips trailing slash) before rewrites fire. The generic `/api/:path*` rewrite requires at least one path segment — bare `/api/socket.io` doesn't match, so Next.js returns 404.

**Fix applied (already in codebase):**
1. `realtime.ts`: client path is `/api/socket.io` (no trailing slash) — avoids the redirect
2. `next.config.mjs`: explicit rewrite `/api/socket.io` → `http://localhost:4321/socket.io/` (trailing slash required by engine.io)
3. `next.config.mjs`: `skipTrailingSlashRedirect: true` — prevents the 308 loop
4. nginx: `location ~ ^/api/socket\.io` (regex, matches with or without slash) — routes directly to API, bypasses Next.js entirely in production

**Prevention:** Never change the socket.io client path to `/api/socket.io/` (with trailing slash). Never remove `skipTrailingSlashRedirect`. Never remove the explicit socket.io rewrite rules.

### Stale CSS/JS hash 404 after rebuild

**Root cause:** Browser or Cloudflare served a cached HTML page that references old `_next/static/` chunk hashes. After `npm run build`, new hashes are generated; old filenames no longer exist.

**Fix:** 
- HTML pages are served with `Cache-Control: no-cache, no-store, must-revalidate` — browsers must revalidate on every load
- Static assets (`/_next/static/`) use `immutable` caching (content-hash filenames never change)
- After a deploy, do a hard refresh (Ctrl+Shift+R) if you see stale CSS errors
- Cloudflare: set the cache rule for `*.no749ah.com` to "Bypass" for HTML (non-static) paths, or purge the Cloudflare cache after each deploy

**Never do:** Do not add proxy_cache to the `/` nginx location block. Nginx caching HTML breaks the hash invalidation chain.
