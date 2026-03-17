# Getting Started — PulseDock

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+ (optional, for enhanced features)

## Quick Start (Development)

```bash
# 1. Clone
git clone https://github.com/No749ah/PulseDock.git
cd PulseDock

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

# 4. Run database migrations
npm run prisma:migrate

# 5. Start development servers
npm run api    # API on :4321
npm run dev:web # Web on :1234
```

Open http://localhost:1234

## Quick Start (Docker)

```bash
# 1. Clone
git clone https://github.com/No749ah/PulseDock.git
cd PulseDock

# 2. Start all services
docker compose up -d

# Wait ~30 seconds for startup
open http://localhost:1234
```

## First Steps

1. **Register** at `/login` → click "Create account"
2. **Add a monitor** → Monitors → New Monitor
3. **Add an alert channel** → Alerts → New Alert Channel
4. **Create a status page** → Status Pages → Create Page

## Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for:
- Docker production setup
- Kubernetes/Helm deployment
- Reverse proxy configuration
- Environment variables reference
