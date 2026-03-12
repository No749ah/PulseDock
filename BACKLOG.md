# PulseDock Backlog

## In Progress
- [ ] **Full project refactor** — Audit all code, remove dead code, fix patterns, enforce strict types, proper error handling, no `any`

## Next Up

### Phase 1: Refactor & Harden
- [ ] Remove all inline CSS from pages — extract to CSS modules or Tailwind
- [ ] Replace Mantine with Tailwind CSS + shadcn/ui components (modern, customizable)
- [ ] Add Tailwind CSS configuration with dark theme as default
- [ ] Fix all TypeScript strict mode violations (`any`, missing types, implicit returns)
- [ ] Add proper error boundaries and loading states to all pages
- [ ] Fix all npm audit vulnerabilities (replace transitive deps where possible)
- [ ] Add security headers (helmet, CORS lockdown, CSP, rate limiting per-route)
- [ ] Add input validation/sanitization on all API endpoints
- [ ] Add proper logging (structured JSON logs, no console.log)
- [ ] Audit auth flow: token storage (httpOnly cookies vs localStorage), CSRF, session management

### Phase 2: Landing Page (Apple-style)
- [ ] Redesign landing page — Apple-like aesthetic with smooth scroll animations
- [ ] Add Framer Motion for entrance animations (fade-up, parallax, stagger)
- [ ] Hero section: bold typography, gradient text, floating UI mockup
- [ ] Feature sections with scroll-triggered reveals
- [ ] Responsive design (mobile-first)
- [ ] Add proper `<head>` metadata, OG tags, favicon

### Phase 3: Dashboard & App UI
- [ ] Dark theme dashboard with glassmorphism cards
- [ ] Monitor list with live status indicators
- [ ] Version diff viewer with syntax highlighting
- [ ] Alert configuration UI
- [ ] User settings / account page
- [ ] Admin panel (user management, system health)
- [ ] Folder/project organization UI

### Phase 4: API & Backend
- [ ] Add comprehensive unit tests for all services (>80% coverage)
- [ ] Add integration tests for API endpoints
- [ ] Add proper API versioning strategy
- [ ] Swagger/OpenAPI docs with examples
- [ ] Add health check endpoint with DB/Redis connectivity status
- [ ] Add metrics endpoint (Prometheus-compatible)
- [ ] WebSocket support for real-time monitor updates

### Phase 5: DevOps & Docs
- [ ] Production Dockerfile (multi-stage, minimal image)
- [ ] Docker Compose for development (app + postgres + redis)
- [ ] Docker Compose / Kubernetes manifests for production
- [ ] GitHub Actions CI/CD (lint, test, build, docker push)
- [ ] README.md — professional, with screenshots, quick start, architecture diagram
- [ ] CHANGELOG.md — semver releases
- [ ] CONTRIBUTING.md — how to contribute
- [ ] LICENSE (MIT or similar)

### Phase 6: Features
- [ ] Plugin system for custom monitor types
- [ ] Notification channels (email, Discord, Slack, webhook)
- [ ] Public status page (per-user, shareable URL)
- [ ] API key management for programmatic access
- [ ] Import/export monitors (JSON/YAML)
- [ ] Dark/light theme toggle

## Done
- [x] Initial project setup (NestJS + Next.js + Prisma)
- [x] Auth system (login, register, JWT, refresh tokens)
- [x] Monitor CRUD API
- [x] Alert channels API
- [x] Folder organization API
- [x] Admin user management API
- [x] Invite system
- [x] Audit logging
- [x] ESLint + Vitest setup
- [x] Single root .env configuration
- [x] Next.js /api proxy to backend
- [x] SSH deploy key for GitHub
- [x] Merged all 95 old heartbeat branches

## Ideas
- Browser extension for quick monitor creation
- CLI tool (`pulsedock check <url>`)
- Mobile-responsive PWA
- Multi-tenant support
- Changelog AI summarization (OpenAI/Anthropic)
