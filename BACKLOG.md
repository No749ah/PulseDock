# PulseDock Backlog

## ⚠️ INSTRUCTION FROM NOAH (2026-03-14)

**The project is NOT feature-complete. Stop waiting for a new project.**
**Re-evaluate everything critically. The backlog below has been expanded with all missing items.**
**Work through these systematically, highest priority first. Do not mark the project done until all items below are checked.**

---

## In Progress

_(pick the highest priority unchecked item below and start immediately)_

## Recently Completed

- [x] **Scheduler perf: eliminate N+1 queries + concurrent monitor checks** — Refactored `ChecksScheduler.tick()` to load all enabled monitors with their latest run in a single `findMany` (one DB round-trip instead of N+1). Due monitors now dispatched concurrently via `Promise.allSettled` rather than sequentially. Added structured logger for failed-tick warnings.

- [x] **Fix FadeIn animation component** — Replaced no-op placeholder (caused by framer-motion v12 / React 19 typing incompatibility) with CSS keyframe + Intersection Observer implementation. All scroll-triggered entrance animations on landing, login, dashboard, and monitors pages now work correctly. Dependency-free, performant, React 19 compatible.

- [x] **Browser extension** — Chrome MV3 extension (`@pulsedock/extension`) with one-click monitor creation, context menu integration, dark theme popup, API key auth, settings panel, and dashboard shortcut. Documented in `docs/EXTENSION.md`.
- [x] **CLI tool** — `pulsedock check <url>` one-shot HTTP checker + `monitors list/check` + `config` commands. New package `@pulsedock/cli` with 10 unit tests, fully wired into root build/test, documented in `docs/CLI.md`.
- [x] **Mobile-responsive PWA improvements** — Added contextual loading skeletons for Monitors/Dashboard/Alerts, installability banner (`beforeinstallprompt` + iOS hint), service worker registration, and offline fallback route (`/offline`) with cached offline support.
- [x] **Add proper API versioning strategy** — Implemented v2 API surface: `GET /v2/monitors` (paginated + filtering + sorting), `GET /v2/alert-channels` (paginated + usedByCount + secret redaction), `GET /v2/checks` (paginated check history + date-range + level filters), `GET /v2/system/info`, `GET /v2/system/versions`. v1 unchanged. 89 integration tests passing.
- [x] **Plugin system for custom monitor types** — Delivered plugin contracts/registry/sandbox + plugin execution path, added starter plugin (`http.response-match`), exposed plugin metadata + config UX in Monitors UI, and documented packaging/verification flow (`docs/PLUGINS.md`).
- [x] **Docker Compose / Kubernetes manifests for production** — Added production deployment docs, fixed compose prod env keys, and shipped baseline Kubernetes manifests (`k8s/base` + `k8s/overlays/prod`) with ingress/service/deployment/statefulset resources.
- [x] **WebSocket support for real-time monitor updates** — Added server push for check + alert activity (`monitor.checked`, `alert.triggered`) and frontend live subscriptions on Dashboard/Monitors with immediate UI updates.

## Next Up (Priority Order)

> **NOTE:** Items marked 🔴 are critical for production. Do not skip them.

---

### 🔴 SECURITY — Critical Gaps

- [ ] **2FA / TOTP (Two-Factor Authentication)** — Implement TOTP-based 2FA (e.g. via `otplib`). Add setup flow (QR code + secret), verify endpoint, enforce on login if enabled. Store encrypted TOTP secret per user. Add recovery codes. UI: Account settings page.
- [ ] **CSRF Protection** — Add CSRF token validation for all state-mutating endpoints (POST/PUT/DELETE). Use `csurf` or double-submit cookie pattern. Ensure SameSite cookie flags are set.
- [x] **Account lockout after failed login attempts** — After 5 consecutive failed logins, lock account for 15 minutes. Log lockout events to audit log. Notify user via email.
- [ ] **Email verification on registration** — New users must verify their email before accessing the app. Send verification link via email. Block login until verified.
- [x] **Password strength enforcement** — Enforce minimum 12 chars, complexity rules (upper/lower/digit/special). Show strength indicator in UI. Reject weak passwords at API level.
- [x] **Stricter rate limiting on auth endpoints** — Auth routes (`/auth/login`, `/auth/register`, `/auth/forgot-password`) need much tighter limits (e.g. 5 req/min per IP), separate from the global 120/min limit.
- [ ] **Audit log export (CSV/JSON)** — Users/admins can export their audit log. Useful for compliance. Add export button on audit log page.
- [ ] **Session activity & anomaly detection** — Log IP + user agent per session. Warn user if new login from unknown IP/device. Show in active sessions list.
- [ ] **Secure password reset flow review** — Ensure reset tokens are: single-use, short-lived (15min), invalidated after use, and not exposed in URLs (use POST body instead).
- [x] **Security headers review** — Audit helmet config: ensure `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` all set correctly.
- [ ] **Input sanitization for stored content** — Sanitize all user-provided text that gets rendered in UI (monitor names, descriptions, etc.) to prevent stored XSS.

---

### 🟠 FRONTEND / UX — Major Gaps

- [ ] **Accessibility (a11y) audit and fixes** — Currently near-zero aria-labels, roles, keyboard navigation. Add: `aria-label` to all icon buttons, `role` attributes, focus rings, keyboard shortcuts for main actions, skip-to-content link. Test with screen reader.
- [ ] **Empty states for all pages** — Every list page (Monitors, Alerts, Projects, etc.) needs a proper empty state with illustration, message, and CTA ("Create your first monitor →"). Currently likely just blank.
- [ ] **Error boundaries and user-friendly error pages** — Ensure all pages have error.tsx with helpful messages. API errors should show toast with actionable info, not just "Something went wrong".
- [ ] **Form validation UX** — All forms should show inline validation errors, not just top-level. Required field indicators. Disable submit until valid.
- [ ] **Onboarding flow for new users** — First login should guide user: create first monitor → set up alert channel → view dashboard. Simple multi-step wizard or checklist widget.
- [ ] **Loading states consistency** — Audit every data-fetching component. Ensure all have proper loading skeletons, not just spinners or blank screens.
- [ ] **Toast / notification system** — Ensure all success/error actions show consistent toasts. No silent failures.
- [ ] **Mobile UX audit** — Test all 9 pages on 375px width. Fix any overflow, unclickable elements, font size issues.
- [ ] **Keyboard navigation** — All interactive elements reachable by Tab. Modals trap focus. Dropdowns closable with Escape.
- [ ] **Dark mode consistency audit** — Check all pages/components for hardcoded colors that don't respect dark mode. Fix any white-on-white or invisible elements.

---

### 🟡 FEATURES — Missing / Incomplete

- [ ] **More version providers** — Add npm (registry.npmjs.org), PyPI (pypi.org/pypi/{pkg}/json), Maven Central, Cargo (crates.io), Helm chart repos. Each needs: fetcher, parser, tests.
- [ ] **Webhook alert channel** — Allow users to configure a webhook URL to receive alerts via HTTP POST with JSON payload. Add signature (HMAC) for verification.
- [ ] **Slack alert channel** — OAuth app or Incoming Webhook URL. Send formatted Slack message on version change/alert.
- [ ] **Discord alert channel** — Discord webhook integration. Send embed on alert.
- [ ] **Telegram alert channel** — Bot token + chat ID. Send message on alert.
- [ ] **Public status page polish** — Review current status page: add uptime percentage, response time chart, incident history, custom domain support.
- [ ] **Monitor groups / tags** — Allow grouping monitors with tags. Filter/search by tag in UI.
- [ ] **Bulk actions** — Select multiple monitors → bulk enable/disable/delete/run now. Useful for power users.
- [ ] **Monitor templates** — Pre-built templates for common checks (GitHub latest release, Docker Hub, npm package). One-click setup.
- [ ] **Response time tracking** — Record and display HTTP response time per check. Show trend chart. Alert if response time exceeds threshold.
- [ ] **Check history charts** — Visual timeline of check results per monitor. Show success/fail over time as a sparkline or bar chart.
- [ ] **i18n / Internationalization** — Add i18n support (at minimum: English + German since Noah is German-speaking). Use `next-intl` or similar.
- [ ] **User profile page improvements** — Avatar upload, display name, timezone setting (affects how times are shown).
- [ ] **Admin dashboard improvements** — Show system stats: total monitors, total checks today, error rate, active users. Useful for self-hosted instances.
- [ ] **Notification preferences** — Per-user settings: which alert types to receive, quiet hours, notification frequency (instant vs digest).
- [ ] **Import from Uptime Robot / BetterUptime** — Let users migrate from competitors by importing their monitors via JSON/CSV.

---

### 🟢 CODE QUALITY / DEVOPS

- [ ] **Increase test coverage to >90%** — Currently 89 tests but coverage % unknown. Add missing unit tests for services, edge cases, auth flows.
- [ ] **E2E tests (Playwright)** — Add basic E2E tests for: login, create monitor, view dashboard, receive alert. Run in CI.
- [ ] **API documentation improvements** — Ensure all endpoints have Swagger descriptions, request/response examples, error codes documented.
- [ ] **Performance profiling** — Profile API under load. Check for slow queries, missing DB indexes (especially on monitor runs table). Add indexes where needed.
- [ ] **Log rotation & cleanup** — Ensure logs don't fill disk on long-running self-hosted instances. Add log rotation config.
- [ ] **Helm chart for Kubernetes** — Proper Helm chart with configurable values for self-hosters deploying to k8s.

---

### Blocked/On Hold
- [ ] **Fix all npm audit vulnerabilities** (**BLOCKED**: 4 HIGH severity in hono <= 4.12.6 via @prisma/dev; npm audit fix --force downgrades prisma to 6.19.2 with breaking changes; waiting on upstream hono/prisma fixes. Re-check periodically.)

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
- **Codebase:** 89 tests passing, zero TypeScript errors, dark/light theme toggle, responsive design on all 9 pages + PWA install/offline UX
- **Build:** ✅ Clean builds, all dependencies locked, Docker setup working
- **Deployment:** GitHub Actions CI/CD running, reverse proxy nginx setup documented
- **Production Readiness:** ~40-50% — Core infrastructure solid, but major security gaps (no 2FA, no CSRF, no email verification, no account lockout), significant frontend UX gaps (no a11y, no empty states, incomplete forms), and many features still missing (alert channels, more providers, charts, etc.)
- **Next Project:** PulsePing is ON HOLD. Focus entirely on PulseDock until it is genuinely production-ready.
