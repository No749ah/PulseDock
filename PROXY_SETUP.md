# Reverse Proxy Setup (nginx)

## Problem

When running PulseDock behind an nginx reverse proxy, Next.js static assets (`/_next/static/chunks/*.css|js`) were returning 404 errors. This occurred because:

1. The Next.js development/production server serves static files with specific cache headers
2. After a rebuild, CSS/JS file hashes change
3. If the reverse proxy or Next.js server cache layers interfere, old hashes are referenced in HTML but new files exist on disk
4. **Solution:** Restart the Next.js server after every build to resync manifest hashes

## nginx Configuration

Add a dedicated `location` block for Next.js static assets in your upstream server configuration:

```nginx
upstream pulsedock_web {
    server localhost:1234;
}

server {
    listen 443 ssl http2;
    server_name oc-dev-test.no749ah.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Enable gzip for static assets
    gzip on;
    gzip_types text/css application/javascript application/json text/javascript;
    gzip_min_length 1000;

    # Cache busting: static assets with hash in filename never change
    location ~* /_next/static/.+\.(js|css|webp|woff2|svg|png|jpg|jpeg|gif|ico)$ {
        proxy_pass http://pulsedock_web;
        # ONLY cache successful responses — never cache 4xx/5xx
        proxy_cache_valid 200 206 301 302 365d;
        proxy_cache_key "$scheme$host$request_uri";
        # Re-validate if origin returns an error (don't serve stale 5xx)
        proxy_cache_use_stale error timeout invalid_header updating;
        proxy_cache_background_update on;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Cache-Status $upstream_cache_status;
        add_header X-Served-By $host;
    }

    # Public folder assets (favicon, og-image, etc.)
    location ~* /\.(ico|png|jpg|jpeg|gif|webp|svg|woff2|woff|ttf|eot)$ {
        proxy_pass http://pulsedock_web;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Main application (no caching for HTML, CSS-in-JS routes)
    location / {
        proxy_pass http://pulsedock_web;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Don't cache HTML pages
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # API routes (no caching)
    location /api/ {
        proxy_pass http://pulsedock_web;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

## Key Points

1. **Hashed static files** (`/_next/static/chunks/2c73a9e8f3f278f3.css`) are cached **forever** (365 days) with `immutable` directive — they never change by design
2. **Non-hashed assets** (favicon, og-image) are cached **long-term** but *can* change, so you may need cache busting if you update them
3. **HTML pages** are never cached — every request fetches fresh from the backend
4. **API routes** are never cached

## After Deploying Changes

**Always restart the Next.js web server after running `npm run build`:**

```bash
cd projects/PulseDock
npm run restart:web
```

This ensures:
- New CSS/JS file hashes are loaded into the Next.js server's manifest
- HTML pages reference the correct hash filenames
- nginx proxy can correctly serve new static files

## Debugging

If static assets still return 404:

```bash
# Check if the expected file exists locally
ls projects/PulseDock/apps/web/.next/static/chunks/

# Curl the CSS directly from Next.js
curl -v http://localhost:1234/_next/static/chunks/2c73a9e8f3f278f3.css

# Check what CSS hash the HTML page is actually referencing
curl http://localhost:1234/ | grep -o '_next/static/chunks/[^"]*\.css'

# If they don't match, restart the server
npm run restart:web
```

## Troubleshooting

### Symptom: CSS/JS returns 500 error

**Cause:** Next.js server restarted but HTML wasn't regenerated, old hashes still in memory

**Fix:** Restart web server again

```bash
npm run restart:web
```

### Symptom: Static assets return 404 through proxy but 200 locally

**Cause:** Proxy caching stale 404s, or cache headers are preventing revalidation

**Fix:** 
1. Clear nginx proxy cache: `sudo rm -rf /var/cache/nginx/*`
2. Restart nginx: `sudo systemctl restart nginx`
3. Verify proxy config has `proxy_cache_bypass` directive

### Symptom: CSS loads but styles don't apply

**Cause:** CSS file served as text/plain instead of text/css

**Fix:** Check Content-Type header:

```bash
curl -I https://oc-dev-test.no749ah.com/_next/static/chunks/2c73a9e8f3f278f3.css
# Should be: Content-Type: text/css
```

If it's text/plain, the Next.js server is misconfigured. Restart it.

## Monitoring

Add this check to your heartbeat to catch static asset issues early:

```bash
# Test public page loads without 500 errors
curl -sI https://oc-dev-test.no749ah.com | grep "^HTTP"
# Should be: HTTP/2 200

# Verify CSS loads
curl -sI https://oc-dev-test.no749ah.com/_next/static/chunks/*.css | grep "^HTTP"
# Should all be: HTTP/2 200
```

If you see any 500s, restart the web server immediately.
