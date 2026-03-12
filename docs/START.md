# Getting Started with PulseDock

Complete setup guide for local development and deployment.

---

## Prerequisites

- **Node.js:** 20.x or later
- **PostgreSQL:** 16 or later
- **Redis:** 7 or later
- **Docker:** (optional, for containerized database)
- **Git:** with SSH configured for GitHub

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone git@github.com:No749ah/PulseDock.git
cd PulseDock
```

### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for both the API (`apps/api`) and Web (`apps/web`) apps via npm workspaces.

### 3. Configure Environment

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env` with your local settings:

```bash
# Database
DATABASE_URL="postgresql://pulsedock:pulsedock@localhost:5432/pulsedock?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Ports
API_PORT=4321
WEB_PORT=1234

# API Configuration
NODE_ENV=development
JWT_ACCESS_SECRET=dev-access-secret-change-in-prod  # Min 24 chars in production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-prod
DEFAULT_ADMIN_EMAIL=admin@pulsedock.dev
DEFAULT_ADMIN_PASSWORD=admin123

# Frontend
NEXT_PUBLIC_API_BASE_URL=/api
API_INTERNAL_URL=http://localhost:4321
```

**Important:** These are dev defaults. For production, use strong, random secrets (32+ chars).

### 4. Start Services

#### Option A: Development Mode (recommended for development)

```bash
# Terminal 1: API (with auto-reload)
cd projects/PulseDock
npm run dev:api

# Terminal 2: Web (with hot reload)
cd projects/PulseDock
npm run dev:web
```

#### Option B: Production Mode

```bash
# Build everything
npm run build

# Restart (kills old, starts new)
npm run restart

# Now running:
# - API: http://localhost:4321
# - Web: http://localhost:1234
```

### 5. Verify Setup

Health checks:

```bash
# API is healthy
curl http://localhost:4321/health
# Expected: {"ok":true,"service":"pulsedock-api","runtime":"nestjs"}

# Web is running
curl -I http://localhost:1234/login
# Expected: HTTP/1.1 200 OK

# API proxy works from web
curl http://localhost:1234/api/v1/monitors \
  -H "Authorization: Bearer invalid" | head -1
# Expected: {"ok":false,"error":{"code":"UNAUTHORIZED"...
```

### 6. Login

Visit **http://localhost:1234/login**

Default credentials:
- **Email:** admin@pulsedock.dev
- **Password:** admin123

After first login, **change your password immediately**.

---

## Database Setup

### Local PostgreSQL

If using local PostgreSQL:

```bash
# Create database and user
psql -U postgres
CREATE USER pulsedock WITH PASSWORD 'pulsedock';
CREATE DATABASE pulsedock OWNER pulsedock;
\c pulsedock
GRANT ALL PRIVILEGES ON SCHEMA public TO pulsedock;
```

### Docker (Recommended)

Use docker-compose to spin up PostgreSQL + Redis:

```bash
# In the project root:
docker-compose up -d

# Wait for services to be healthy
docker-compose logs -f

# When ready, run migrations:
npm run prisma:migrate
```

---

## Port Configuration

| Service | Port | URL | Notes |
|---------|------|-----|-------|
| **API** | 4321 | http://localhost:4321 | NestJS backend |
| **Web** | 1234 | http://localhost:1234 | Next.js frontend |
| **PostgreSQL** | 5432 | localhost:5432 | Database |
| **Redis** | 6379 | localhost:6379 | Cache + sessions |

**Important:** The web app proxies all `/api/*` requests to the API on port 4321 via Next.js rewrites. The browser only talks to port 1234.

---

## Development Workflow

### Making Changes

1. **Edit code** in `apps/api/src` or `apps/web/app`
2. **Dev mode auto-reloads** (ts-node for API, Next.js for web)
3. **Test locally** before committing

### Building

```bash
# Build both apps
npm run build

# Check for TypeScript errors
npm run build  # will fail if errors

# Check security
npm audit

# Test (when added)
npm run test
```

### Committing

Follow conventional commits:

```bash
git add .
git commit -m "feat: add new feature"
git commit -m "fix: resolve issue X"
git commit -m "refactor: improve code"
git commit -m "docs: update README"
```

Push to current heartbeat branch:

```bash
git push origin heartbeat/YYYY-MM-DD-description
```

### Restarting Services

After code changes in production mode:

```bash
npm run restart
```

This:
1. Kills API + Web processes
2. Restarts API (port 4321)
3. Waits 2 seconds
4. Restarts Web (port 1234)

Then **always verify** with health checks (see step 5 above).

---

## Testing Endpoints

### Health Check

```bash
curl http://localhost:4321/health
```

### Login (Create Session)

```bash
curl -X POST http://localhost:4321/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@pulsedock.dev",
    "password": "admin123"
  }'

# Response:
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "...", "email": "...", "role": "admin" }
}
```

### Authenticated Request

```bash
# Use the accessToken from login
TOKEN="eyJ..."

curl http://localhost:4321/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "id": "...",
  "email": "admin@pulsedock.dev",
  "role": "admin"
}
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find process on port 4321
lsof -i :4321

# Kill it
kill -9 <PID>

# Or use npm restart script
npm run restart
```

### Database Connection Error

```
error: connect ECONNREFUSED 127.0.0.1:5432
```

- Check PostgreSQL is running: `sudo systemctl status postgresql`
- Check DATABASE_URL in `.env` is correct
- If using Docker: `docker-compose up -d && docker-compose logs postgres`

### Redis Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

- Check Redis is running: `redis-cli ping` should return `PONG`
- If using Docker: `docker-compose up -d && docker-compose logs redis`

### Migrations Failed

```bash
# Reset database (⚠️ DESTRUCTIVE — dev only!)
npx prisma migrate reset --force

# Then restart
npm run restart
```

### Still Stuck?

Check:
1. All processes running: `ps aux | grep -E "node|next"`
2. All ports listening: `netstat -tlnp | grep -E "1234|4321"`
3. Environment vars: `cat .env | grep DATABASE_URL`
4. Logs: check console output for errors

---

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system design
- See [WORKFLOW.md](./WORKFLOW.md) for the development process
- Check [API.md](./API.md) for endpoint documentation
- Review [GITFLOW.md](./GITFLOW.md) for branching strategy

---

**Happy coding!** 🚀
