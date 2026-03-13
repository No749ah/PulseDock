# PulseDock Backlog

## In Progress

- [ ] **Plugin system for custom monitor types** — Define plugin contracts + safe execution boundary for community monitor extensions. Estimated impact: Medium (extensibility).
  - [x] Added plugin contracts (`MonitorCheckPlugin`) + registry + safe execution boundary (`executePluginSafely` with timeout/output sanitization).
  - [x] Integrated plugin execution path into monitor runs (`config.pluginId`) with fallback to built-in checks.
  - [x] Added starter plugin (`http.response-match`) and sandbox unit tests.
  - [ ] Next: expose plugin metadata/config UX in Web + document community plugin packaging/verification flow.

## Recently Completed

- [x] **Docker Compose / Kubernetes manifests for production** — Added production deployment docs, fixed compose prod env keys, and shipped baseline Kubernetes manifests (`k8s/base` + `k8s/overlays/prod`) with ingress/service/deployment/statefulset resources.
- [x] **WebSocket support for real-time monitor updates** — Added server push for check + alert activity (`monitor.checked`, `alert.triggered`) and frontend live subscriptions on Dashboard/Monitors with immediate UI updates.

## Next Up (Priority Order)

### High Priority
- [ ] **Add proper API versioning strategy** — Implement `/api/v2` alongside `/api/v1`. Plan breaking change management. Estimated impact: Low (current v1 is stable).

### Blocked/In Review
- [ ] **Fix all npm audit vulnerabilities** (**BLOCKED**: 4 HIGH severity in hono <= 4.12.6 via @prisma/dev; npm audit fix --force downgrades prisma to 6.19.2 with breaking changes; waiting on upstream hono/prisma fixes)

### Nice-to-Have
- [ ] **Mobile-responsive PWA improvements** — Add installability prompts, improved offline fallback, and monitor detail skeleton states. Estimated impact: Medium (UX retention).

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
- **Production Readiness:** ~96% — Core features stable, deployment baseline now includes compose + k8s manifests; next major gap is plugin extensibility

## Ideas & Future Work
- Browser extension for quick monitor creation
- CLI tool (`pulsedock check <url>`)
- Mobile-responsive PWA
- Multi-tenant support
- Changelog AI summarization (OpenAI/Anthropic)
