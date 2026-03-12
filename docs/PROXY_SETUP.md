# Reverse Proxy Configuration

How to configure nginx to expose PulseDock via a public domain.

---

## Architecture Reminder

```
nginx reverse proxy
  ↓ (HTTPS)
  ↓ (example: https://oc-dev-test.no749ah.com)
  ↓
API + Web running on Docker
  ↓ (port 1234)
  ↓ (Next.js handles /api → 4321 rewrite)
  ↓
Single location block: proxy_pass http://192.168.0.202:1234
```

---

## Nginx Configuration

**File:** `/etc/nginx/sites-available/oc-dev-test.no749ah.com` (or your domain)

```nginx
upstream pulsedock_backend {
    server 192.168.0.202:1234;
}

server {
    listen 80;
    listen [::]:80;
    server_name oc-dev-test.no749ah.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name oc-dev-test.no749ah.com;

    # SSL Certificates (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/oc-dev-test.no749ah.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oc-dev-test.no749ah.com/privkey.pem;

    # SSL Configuration (modern, secure)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS (optional but recommended)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Single location block for all traffic
    location / {
        proxy_pass http://pulsedock_backend;
        
        # Required headers for proper proxying
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support (if added later)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Don't buffer responses (stream them as-is)
        proxy_buffering off;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Optional: Deny direct access to internal endpoints
    # location /api/admin {
    #     deny all;
    # }
}
```

---

## Setup Steps

### 1. Create Config File

```bash
sudo vim /etc/nginx/sites-available/oc-dev-test.no749ah.com
```

Copy the config above, update:
- `server_name` → your domain
- `upstream` → your VM IP + port
- SSL paths → your Let's Encrypt certs

### 2. Enable the Site

```bash
sudo ln -s /etc/nginx/sites-available/oc-dev-test.no749ah.com \
  /etc/nginx/sites-enabled/oc-dev-test.no749ah.com
```

### 3. Get SSL Certificates

Use Let's Encrypt (free):

```bash
sudo apt install certbot python3-certbot-nginx

sudo certbot certonly --standalone -d oc-dev-test.no749ah.com
# Follow prompts, certs saved to /etc/letsencrypt/live/...
```

Or use existing wildcard certs if you have them.

### 4. Test Config

```bash
sudo nginx -t
# Output: nginx: configuration file test is successful
```

### 5. Reload Nginx

```bash
sudo systemctl reload nginx
# or
sudo nginx -s reload
```

### 6. Verify

```bash
# HTTPS works
curl https://oc-dev-test.no749ah.com/login -I

# API proxy works
curl https://oc-dev-test.no749ah.com/api/health

# Both should return 200/success
```

---

## Key Settings Explained

| Setting | Why |
|---------|-----|
| `proxy_http_version 1.1` | Keep-alive + performance |
| `proxy_set_header Host` | Tell backend the public domain |
| `X-Forwarded-For` | Backend sees client IP (logging) |
| `X-Forwarded-Proto https` | Backend knows it's HTTPS (for redirects) |
| `proxy_buffering off` | Stream responses (no buffering) |
| `Upgrade` + `Connection` | WebSocket support (future) |

---

## Testing

```bash
# 1. Test HTTP → HTTPS redirect
curl http://oc-dev-test.no749ah.com/login -I
# Should see: 301 -> https://...

# 2. Test HTTPS works
curl https://oc-dev-test.no749ah.com/login -I

# 3. Test API proxy
curl https://oc-dev-test.no749ah.com/api/health

# 4. Test in browser
open https://oc-dev-test.no749ah.com/login
```

---

## Troubleshooting

### 502 Bad Gateway

The backend is unreachable. Check:
```bash
# Is the app running?
ps aux | grep -E "next|node"

# Is port 1234 listening?
netstat -tlnp | grep 1234

# Can nginx reach it?
curl http://192.168.0.202:1234/login

# Check nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### 500 Internal Server Error

The backend returned an error. Check:
```bash
# Are both API + Web running?
curl http://localhost:4321/health
curl http://localhost:1234/login

# Check app logs
# (depends on where you're running OpenClaw)
```

### Certificate Expired

```bash
# Renew Let's Encrypt cert
sudo certbot renew

# Or manually
sudo certbot certonly --force-renewal -d oc-dev-test.no749ah.com
```

### Slow Requests

Check:
```bash
# Is the backend slow?
curl -w "Time: %{time_total}s\n" http://localhost:1234/login

# Are there network issues?
mtr 192.168.0.202

# Check nginx access/error logs
tail -f /var/log/nginx/access.log
```

---

## SSL/TLS Best Practices

```bash
# Test your SSL config
curl https://oc-dev-test.no749ah.com -v | grep -E "SSL|TLS"

# Online SSL checker
# https://www.ssllabs.com/ssltest/analyze.html?d=oc-dev-test.no749ah.com
```

---

## Advanced: Load Balancing

If running multiple backend instances:

```nginx
upstream pulsedock_backend {
    server 192.168.0.202:1234;
    server 192.168.0.203:1234;  # 2nd instance
    server 192.168.0.204:1234;  # 3rd instance
}
```

Nginx will round-robin across them.

---

## References

- [Nginx Reverse Proxy](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Let's Encrypt](https://letsencrypt.org/)
- [Mozilla SSL Config Generator](https://ssl-config.mozilla.org/)

---

See also:
- [START.md](./START.md) — Local setup
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System design
