# Deployment Guide

Production deployment for PulseDock using Docker Compose, Kubernetes, or bare metal.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Docker | 24+ |
| Docker Compose | v2 |
| PostgreSQL | 15+ |
| Redis | 7+ |
| Node.js (bare metal) | 22+ |

---

## Option A — Docker Compose (single host, recommended)

The fastest way to get PulseDock running on a single VM or server.

### 1. Clone and prepare environment

```bash
git clone https://github.com/No749ah/PulseDock.git
cd PulseDock
cp .env.example .env.prod
```

Edit `.env.prod` with your values. **Required fields:**

```bash
# Generate strong secrets
openssl rand -hex 32   # use twice, once per JWT secret

POSTGRES_PASSWORD=your-secure-db-password
JWT_ACCESS_SECRET=<generated>
JWT_REFRESH_SECRET=<generated-different-from-above>
APP_URL=https://status.yourcompany.com    # public URL of web frontend
CORS_ORIGINS=https://status.yourcompany.com
```

**Optional but recommended:**

```bash
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-smtp-password
SMTP_FROM="PulseDock <noreply@yourcompany.com>"

GITHUB_TOKEN=ghp_xxx   # raises GitHub API rate limit 60→5000 req/hr
```

See [`.env.example`](../.env.example) for all available variables with descriptions.

### 2. Start services

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

This starts:
- `pulsedock-api` — NestJS API on port `4321`
- `pulsedock-web` — Next.js frontend on port `1234`
- `postgres` — PostgreSQL database
- `redis` — Redis for caching/queues

### 3. Verify

```bash
# API health
curl -f http://localhost:4321/health/live && echo "API OK"

# Web frontend
curl -f http://localhost:1234/login && echo "Web OK"

# Check running containers
docker compose -f docker-compose.prod.yml ps
```

### 4. First login

Navigate to `http://localhost:1234/setup` to create your admin account,
or set `DEFAULT_ADMIN_EMAIL` + `DEFAULT_ADMIN_PASSWORD` in `.env.prod` before starting.

### 5. Reverse proxy (nginx)

```nginx
# /etc/nginx/sites-available/pulsedock
server {
    listen 443 ssl;
    server_name status.yourcompany.com;

    ssl_certificate     /etc/ssl/certs/pulsedock.crt;
    ssl_certificate_key /etc/ssl/private/pulsedock.key;

    # Web frontend
    location / {
        proxy_pass http://localhost:1234;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API proxy (required — same origin)
    location /api/ {
        proxy_pass http://localhost:4321/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
    }

    # WebSocket (required for real-time updates)
    location /api/socket.io/ {
        proxy_pass http://localhost:4321/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

See [`docs/NGINX.md`](./NGINX.md) for the complete nginx configuration.

### Updating

```bash
git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Migrations run automatically on API startup when `RUN_MIGRATIONS_ON_STARTUP=true`.

### Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# API only
docker compose -f docker-compose.prod.yml logs -f pulsedock-api

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100 pulsedock-api
```

### Local development overrides

For local development, use `docker-compose.override.yml` to customise settings without touching the base files:

```bash
# The override file is committed as an example — copy it:
cp docker-compose.override.yml docker-compose.local.yml
# Or use it directly (Docker Compose auto-merges override files)
docker compose up
```

Common local overrides in `docker-compose.override.yml`:
- Switch log level to `debug`
- Point to a local mail catcher (Mailpit) instead of real SMTP
- Expose extra ports (Node inspector, alternative DB port)
- Use a local directory for Postgres data

---

## Option B — Kubernetes (recommended for high availability)

Kubernetes manifests are in `k8s/`.

```
k8s/
├── base/                    # Reusable base manifests
│   ├── api-deployment.yaml
│   ├── web-deployment.yaml
│   ├── postgres-statefulset.yaml
│   ├── redis-deployment.yaml
│   ├── secret.example.yaml  # template — copy and fill in
│   └── kustomization.yaml
└── overlays/
    └── prod/                # Production-specific overrides
        ├── ingress-host.patch.yaml
        └── kustomization.yaml
```

### 1. Create Kubernetes secrets

```bash
cp k8s/base/secret.example.yaml /tmp/pulsedock-secret.yaml
# Edit /tmp/pulsedock-secret.yaml with base64-encoded values:
# echo -n "your-secret" | base64

kubectl create namespace pulsedock
kubectl apply -f /tmp/pulsedock-secret.yaml
```

### 2. Configure ingress host and image tags

```bash
# Set your domain
vim k8s/overlays/prod/ingress-host.patch.yaml

# Set image tags (e.g. ghcr.io/no749ah/pulsedock-api:v1.0.2)
vim k8s/overlays/prod/kustomization.yaml
```

### 3. Deploy

```bash
kubectl apply -k k8s/overlays/prod
```

### 4. Verify

```bash
kubectl -n pulsedock get pods
kubectl -n pulsedock get ingress
kubectl -n pulsedock logs deploy/pulsedock-api --tail=100
```

### In-cluster service names

| Service | Internal host | Port |
|---------|--------------|------|
| API | `pulsedock-api` | `4321` |
| Web | `pulsedock-web` | `1234` |
| PostgreSQL | `postgres` | `5432` |
| Redis | `redis` | `6379` |

### Helm chart

A Helm chart is available at `helm/pulsedock/`. See [`docs/HELM.md`](./HELM.md).

```bash
helm install pulsedock ./helm/pulsedock \
  --namespace pulsedock \
  --create-namespace \
  --set postgresql.password=your-db-pass \
  --set jwtAccessSecret=$(openssl rand -hex 32) \
  --set jwtRefreshSecret=$(openssl rand -hex 32) \
  --set ingress.host=status.yourcompany.com
```

---

## Option C — Bare Metal / PM2

For development or light production without Docker.

### 1. Install dependencies

```bash
node --version   # must be 22+
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, JWT secrets
```

### 3. Run database migrations

```bash
cd apps/api
npx prisma migrate deploy
npx prisma db seed   # optional — creates demo data
```

### 4. Build

```bash
npm run build
```

### 5. Start with PM2

```bash
npm install -g pm2

pm2 start npm --name pulsedock-api -- run start:api
pm2 start npm --name pulsedock-web -- run start:web

pm2 save
pm2 startup   # enable auto-start on reboot
```

---

## Environment Variables Reference

All variables are documented in [`.env.example`](../.env.example).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | ✅ | — | Redis connection string |
| `JWT_ACCESS_SECRET` | ✅ | — | JWT signing secret (access tokens, 15m TTL) |
| `JWT_REFRESH_SECRET` | ✅ | — | JWT signing secret (refresh tokens, 30d TTL) |
| `APP_URL` | ✅ | — | Public URL of web frontend (used in emails) |
| `CORS_ORIGINS` | ✅ | — | Comma-separated allowed origins |
| `NODE_ENV` | — | `development` | Set to `production` in prod |
| `LOG_LEVEL` | — | `info` | `debug` \| `info` \| `warn` \| `error` |
| `ALLOW_PUBLIC_REGISTRATION` | — | `false` | Allow anyone to register (vs invite-only) |
| `REQUIRE_EMAIL_VERIFICATION` | — | `false` | Require email verification before login |
| `SMTP_HOST` | — | — | SMTP server hostname |
| `SMTP_PORT` | — | `587` | SMTP port |
| `SMTP_USER` | — | — | SMTP username |
| `SMTP_PASS` | — | — | SMTP password |
| `SMTP_FROM` | — | — | Sender address for outbound emails |
| `GITHUB_TOKEN` | — | — | GitHub PAT for higher rate limits (5000/hr vs 60/hr) |
| `GITLAB_TOKEN` | — | — | Default GitLab token for version checks |

---

## Health Checks

| Endpoint | Expected | Description |
|----------|----------|-------------|
| `GET /health/live` | `200 OK` | API is alive |
| `GET /health/ready` | `200 OK` | DB + Redis connected |
| `GET /login` | `200 OK` | Web frontend responding |

---

## Troubleshooting

**API won't start — database connection refused**
```bash
# Check PostgreSQL is running
docker compose -f docker-compose.prod.yml ps postgres

# Test connection manually
docker compose -f docker-compose.prod.yml exec pulsedock-api \
  node -e "require('net').connect(5432,'postgres').on('connect',()=>console.log('OK'))"
```

**"Migrations failed" on startup**
```bash
# Run migrations manually
docker compose -f docker-compose.prod.yml exec pulsedock-api \
  npx prisma migrate deploy
```

**WebSocket not working (real-time dashboard)**
Make sure your reverse proxy has proper WebSocket upgrade headers. See [`docs/NGINX.md`](./NGINX.md).

**Email not sending**
Verify SMTP credentials and check API logs:
```bash
docker compose -f docker-compose.prod.yml logs pulsedock-api | grep -i "smtp\|mail\|email"
```

See [`docs/TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) for more.
