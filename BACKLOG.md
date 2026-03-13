# PulseDock Backlog

## In Progress

- [ ] **WebSocket support for real-time monitor updates** — Socket.io foundation added (`/realtime` gateway + user-room subscriptions) and monitor CRUD events (`monitor.created|updated|deleted`) now emitted server-side. Remaining: alert/check status push + frontend live subscriptions.

## Next Up (Priority Order)

### High Priority
- [ ] **Docker Compose / Kubernetes manifests for production** — k8s deployment manifests, helm charts or docker-compose production variant. Estimated impact: High (deployment readiness).
- [ ] **Plugin system for custom monitor types** — Allow community-contributed monitor types. Plugin registry, validation, sandboxing. Estimated impact: Medium (extensibility).

### Blocked/In Review
- [ ] **Fix all npm audit vulnerabilities** (**BLOCKED**: 4 HIGH severity in hono <= 4.12.6 via @prisma/dev; npm audit fix --force downgrades prisma to 6.19.2 with breaking changes; waiting on upstream hono/prisma fixes)

### Nice-to-Have
- [ ] **Add proper API versioning strategy** — Implement `/api/v2` alongside `/api/v1`. Plan breaking change management. Estimated impact: Low (current v1 is stable).

---

### Completed Phases (Reference)

#### Phase 1: Refactor & Harden
✅ **Phase 1: Refactor & Harden** — Tailwind migration, TypeScript strict mode, security (helmet/CORS/CSP), input validation, structured logging, auth hardening
✅ **Phase 2: Landing & Login** — Apple-like design, Framer Motion animations, dark theme, metadata/OG tags, responsive
✅ **Phase 3: Dashboard & App UI** — All 9 pages with CRUD, glassmorphism cards, dark theme, proper layouts
✅ **Phase 4: API & Backend** — 74 tests passing, Swagger docs, health/metrics endpoints, integration tests
✅ **Phase 5: DevOps & Docs** — Docker (dev+prod), GitHub Actions CI/CD, README/CHANGELOG/CONTRIBUTING
✅ **Phase 6: Features** — All notification channels, public status pages, API keys, import/export, dark/light toggle, visual UI/UX audit

## Status Summary
- **Codebase:** 74 tests passing, zero TypeScript errors, dark/light theme toggle, responsive design on all 9 pages
- **Build:** ✅ Clean builds, all dependencies locked, Docker setup working
- **Deployment:** GitHub Actions CI/CD running, reverse proxy nginx setup documented
- **Production Readiness:** ~90% — Core features stable, missing WebSocket real-time + k8s manifests

## Ideas & Future Work
- Browser extension for quick monitor creation
- CLI tool (`pulsedock check <url>`)
- Mobile-responsive PWA
- Multi-tenant support
- Changelog AI summarization (OpenAI/Anthropic)
