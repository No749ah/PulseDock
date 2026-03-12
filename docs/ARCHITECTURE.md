# Architecture

High-level overview of PulseDock's design, tech stack, and key decisions.

---

## System Design

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Browser                            │
│            (https://oc-dev-test.no749ah.com)                │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Nginx Reverse Proxy                        │
│              (192.168.0.202, external VM)                   │
│                                                              │
│  server oc-dev-test.no749ah.com {                           │
│    location / {                                             │
│      proxy_pass http://192.168.0.202:1234;                 │
│    }                                                        │
│  }                                                          │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Docker Container                          │
│              (OpenClaw, 192.168.0.202:1234)                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Next.js Web App (port 1234)                │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │  Landing Page, Login, Dashboard, Monitors   │    │  │
│  │  │  Dark Theme + Tailwind CSS + Framer Motion  │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  │           ↓ /api rewrites to 4321                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        NestJS API Server (port 4321)                │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │  Authentication, Monitors, Alerts, Checks   │    │  │
│  │  │  Helmet, Rate Limiting, Structured Logging  │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  │           ↓ ORM                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└────┬─────────────────────────────────────────────────┬──────┘
     │                                                  │
     ▼ TCP 5432                                        ▼ TCP 6379
┌─────────────────────┐                         ┌──────────────┐
│  PostgreSQL 16      │                         │  Redis 7     │
│  (dind container)   │                         │  (dind)      │
│                     │                         │              │
│  • Users            │                         │  • Sessions  │
│  • Monitors         │                         │  • Real-time │
│  • Runs & Alerts    │                         │  • Cache     │
│  • Audit Logs       │                         │              │
└─────────────────────┘                         └──────────────┘
```

---

## Technology Stack

### Frontend

| Layer | Tech | Version | Purpose |
|-------|------|---------|---------|
| **Framework** | Next.js | 16.1.6 | React SSR + static generation |
| **Runtime** | React | 19.2.0 | UI components + hooks |
| **Styling** | Tailwind CSS | 4.2.1 | Dark-first, utility-first CSS |
| **Animations** | Framer Motion | 12.35.2 | Smooth scroll reveals, transitions |
| **Icons** | Lucide React | 0.577.0 | Clean, minimal icon set |
| **Linting** | ESLint | Latest | Code quality + style rules |
| **Build** | TypeScript | 5.7.2 | Type safety |

**Design System:**
- **Colors:** Dark theme (`#050a0e` background, `#58a6ff` accent)
- **Typography:** Inter font, system-ui fallback
- **Components:** Card, Badge, Button, Table, Modal, Select (reusable Tailwind-based)
- **Animations:** Fade-in on scroll, stagger, parallax effects (Framer Motion)

### Backend

| Layer | Tech | Version | Purpose |
|-------|------|---------|---------|
| **Framework** | NestJS | 11.1.6 | Modular, scalable Node server |
| **Runtime** | Node.js | 20+ | JavaScript server runtime |
| **Language** | TypeScript | 5.7.2 | Type-safe development |
| **ORM** | Prisma | 7.4.0 | Database abstraction + migrations |
| **Validation** | class-validator | 0.14.3 | DTO validation + sanitization |
| **Security** | Helmet | Latest | HTTP security headers |
| **Auth** | @nestjs/jwt | 11.0.2 | JWT token handling |
| **Testing** | Vitest | 4.0.18 | Unit test framework |
| **Linting** | ESLint | Latest | Code quality |

**Key Middleware:**
- **Helmet:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options, XSS filter
- **Rate Limiting:** 120 requests/minute per IP (ThrottlerModule)
- **Validation:** Automatic DTO validation + input sanitization
- **Logging:** Structured JSON logs (service, requestId, userId, action, duration)
- **CORS:** Configurable, restricted by default
- **Exception Filter:** Standardized error responses with requestId tracking

### Data Layer

| Component | Tech | Version | Purpose |
|-----------|------|---------|---------|
| **Database** | PostgreSQL | 16+ | Relational data + ACID transactions |
| **Cache** | Redis | 7+ | Sessions, real-time updates, cache |
| **Migrations** | Prisma Migrate | 7.4.0 | Schema versioning |

---

## Key Architectural Decisions

### 1. API Proxy via Next.js Rewrites

**Decision:** Frontend proxies `/api/*` requests to backend via Next.js rewrites (not direct HTTP calls).

**Why:**
- Single-domain deployment (no CORS complexity)
- nginx only needs one `proxy_pass` location
- Browser never knows about port 4321
- Security: API port is internal-only

**How:**
```javascript
// next.config.mjs
async rewrites() {
  return [
    {
      source: '/api/:path*',
      destination: 'http://localhost:4321/:path*',
    },
  ];
}
```

Browser: `GET /api/v1/monitors` → Next.js → API: `GET /v1/monitors`

### 2. Unified Environment Configuration

**Decision:** Single `.env` file at project root, shared by both API and Web.

**Why:**
- Reduces configuration drift
- Easier to reason about (one source of truth)
- Better for Docker (single volume mount)
- Avoids accidental env var leaks to frontend

**How:**
- API: `node --env-file=../../.env` (loads root .env)
- Web: Next.js automatically loads root `.env` + `.env.local`

### 3. Production Build for Stability

**Decision:** Always run production builds in deployment (not dev mode).

**Why:**
- No Turbopack/HMR overhead
- Content-hashed assets (automatic cache busting)
- Smaller bundle size
- No source maps in production

**How:**
```bash
npm run build     # Compiles both apps
npm run restart   # Kills + starts production versions
```

### 4. Structured JSON Logging

**Decision:** All logs are JSON (no `console.log`).

**Why:**
- Machine-readable for log aggregation (ELK, Splunk, DataDog)
- Includes context: requestId, userId, action, duration
- Searchable + filterable
- No sensitive data leakage

**Format:**
```json
{
  "timestamp": "2026-03-12T13:25:19.143Z",
  "level": "info",
  "message": "http_request",
  "requestId": "130829c4-8a1a-40af-8b9a-729e69a4c0cd",
  "method": "GET",
  "path": "/v1/monitors",
  "status": 401,
  "durationMs": 5
}
```

### 5. JWT + Session Management

**Decision:** Tokens stored in localStorage (browser), sessions tracked in database.

**Why:**
- Token-based for stateless API
- Session revocation possible (security)
- Audit trail of active sessions
- User can see + revoke their sessions

**How:**
- Access token: 15 minutes (short-lived)
- Refresh token: 30 days (long-lived, revocable)
- Refresh token stored in database + Redis cache

### 6. Modular NestJS Structure

**Decision:** Service-based architecture (auth, monitors, alerts, checks).

**Why:**
- Each service is independently testable
- Clear boundaries and responsibilities
- Easy to add new features (new module + service)
- Guards + decorators for auth/roles

**Structure:**
```
src/
├── auth/          Auth service + controllers
├── monitors/      Monitor CRUD + health checks
├── alerts/        Alert channels + dispatch
├── checks/        Scheduler for version monitoring
├── users/         User management + admin
├── common/        Shared: Prisma, logging, guards, middleware
└── types.ts       Shared TypeScript types
```

---

## Data Model (Prisma Schema)

**Key Entities:**
- **User:** Email, password hash, role (admin/user), session history
- **Monitor:** Target URL/repo, check interval, enabled status, run history
- **MonitorRun:** Result of a check (status, latency, message)
- **AlertChannel:** Email/Discord/Slack destination for notifications
- **Folder:** Organization of monitors by user
- **AuditLog:** Record of admin actions (GDPR-compliant)

See `prisma/schema.prisma` for full schema.

---

## Security Model

### Authentication
- JWT tokens (HS256 signing)
- Access + refresh token flow
- Tokens tied to sessions (revocable)
- Failed login counting + account lockout

### Authorization
- Role-based access control (RBAC): admin vs. user
- Decorators: `@Roles(Role.admin)` on protected endpoints
- Guards: AuthGuard + RolesGuard on all protected routes

### Network Security
- Helmet: CSP, HSTS, clickjacking protection, MIME sniffing protection
- Rate limiting: 120 req/min per IP
- CORS: Configurable, restrictive defaults
- Input validation: DTO validation + sanitization on all endpoints

### Data Security
- Passwords: bcryptjs with salting
- Secrets: environment variables (never in code)
- Audit logs: immutable records of admin actions
- Session revocation: instant logout possible

---

## Deployment Architecture

### Development
```
localhost:1234 (Next.js dev + reloads)
localhost:4321 (NestJS with ts-node)
localhost:5432 (PostgreSQL)
localhost:6379 (Redis)
```

### Staging/Production
```
Docker container:
- Next.js production build on port 1234
- NestJS compiled to dist/ on port 4321

External:
- PostgreSQL on dind:5432
- Redis on dind:6379
- Nginx reverse proxy on separate VM

SSL/TLS: Nginx handles HTTPS
```

---

## Performance Considerations

### Frontend
- **Code splitting:** Next.js automatic (per-route)
- **Asset hashing:** Content-hashed filenames (cache busting)
- **Images:** Optimized via Next.js Image component
- **CSS:** Tailwind tree-shaking (only used utilities in bundle)
- **JavaScript:** No client-side routing overhead (Server Components by default)

### Backend
- **Database:** Connection pooling via Prisma
- **Caching:** Redis for sessions + frequent queries
- **Rate limiting:** Prevents abuse + overload
- **Request timeout:** 5-second default (configurable per endpoint)
- **Async processing:** Event-driven for long operations

### Network
- **Compression:** gzip enabled
- **Keep-alive:** HTTP/1.1 with connection reuse
- **Proxy buffering:** Disabled (streaming responses)

---

## Scalability

### Horizontal
- **Stateless API:** Multiple instances possible behind load balancer
- **Session store:** Redis allows shared sessions across API instances
- **Database:** PostgreSQL handles concurrent connections

### Vertical
- **Memory:** TypeScript + Node.js typically 100–200MB per instance
- **CPU:** Lightweight - suitable for 1–2 CPU allocation
- **Disk:** Database size depends on data volume (usually <100GB for most setups)

### Monitoring
- **Health endpoints:** `/health` for liveness checks
- **Metrics:** Prometheus-compatible endpoint (planned)
- **Logs:** Structured JSON for aggregation

---

## Future Extensibility

- **Plugin system:** Custom monitor types via modules
- **Webhooks:** Real-time notifications to external systems
- **API versioning:** Ready for v2 endpoints
- **Multi-tenancy:** User isolation + org-level management (planned)
- **Kafka/PubSub:** Event streaming for high-scale alerts (future)

---

See also:
- [GITFLOW.md](./GITFLOW.md) — Version control strategy
- [WORKFLOW.md](./WORKFLOW.md) — Development process
- [API.md](./API.md) — Endpoint documentation
