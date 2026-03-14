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

- [x] **2FA / TOTP (Two-Factor Authentication)** — Implement TOTP-based 2FA (e.g. via `otplib`). Add setup flow (QR code + secret), verify endpoint, enforce on login if enabled. Store encrypted TOTP secret per user. Add recovery codes. UI: Account settings page.
- [x] **CSRF Protection** — Double-submit cookie pattern implemented. `GET /v1/auth/csrf` issues non-httpOnly cookie + returns token. `CsrfMiddleware` validates `X-CSRF-Token` header against cookie on all mutating routes (timingSafeEqual). Web `api.ts` auto-injects token. API key / Bearer callers exempt.
- [x] **Account lockout after failed login attempts** — After 5 consecutive failed logins, lock account for 15 minutes. Log lockout events to audit log. Notify user via email.
- [x] **Email verification on registration** — New users must verify their email before accessing the app. Send verification link via email. Block login until verified.
- [x] **Password strength enforcement** — Enforce minimum 12 chars, complexity rules (upper/lower/digit/special). Show strength indicator in UI. Reject weak passwords at API level.
- [x] **Stricter rate limiting on auth endpoints** — Auth routes (`/auth/login`, `/auth/register`, `/auth/forgot-password`) need much tighter limits (e.g. 5 req/min per IP), separate from the global 120/min limit.
- [x] **Audit log export (CSV/JSON)** — Users/admins can export their audit log. Useful for compliance. Add export button on audit log page.
- [x] **Session activity & anomaly detection** — Log IP + user agent per session. Warn user if new login from unknown IP/device. Show in active sessions list.
- [x] **Secure password reset flow review** — Ensure reset tokens are: single-use, short-lived (15min), invalidated after use, and not exposed in URLs (use POST body instead).
- [x] **Security headers review** — Audit helmet config: ensure `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` all set correctly.
- [x] **Input sanitization for stored content** — Sanitize all user-provided text that gets rendered in UI (monitor names, descriptions, etc.) to prevent stored XSS.

---

### 🟠 FRONTEND / UX — Major Gaps

- [x] **Accessibility (a11y) audit and fixes** — Added skip-to-content link, global focus-visible ring (CSS), `role="dialog"` + `aria-modal` + `aria-labelledby` + focus-trap (Tab/Shift+Tab) to both Modal components, `aria-label` on all icon-only buttons (Edit/Delete in alerts/projects tables, pagination prev/next), `aria-live="polite"` on pagination counters, `aria-label` on navigation + user menu button, `id="main-content"` + `role="main"` on main layout area.
- [x] **Empty states for all pages** — Every list page (Monitors, Alerts, Projects, etc.) needs a proper empty state with illustration, message, and CTA ("Create your first monitor →"). Currently likely just blank.
- [x] **Error boundaries and user-friendly error pages** — Ensure all pages have error.tsx with helpful messages. API errors should show toast with actionable info, not just "Something went wrong".
- [x] **Form validation UX** — All forms should show inline validation errors, not just top-level. Required field indicators. Disable submit until valid.
- [x] **Onboarding flow for new users** — 3-step "Get Started" checklist on dashboard: create monitor → set up alert channel → explore dashboard. Progress bar, per-user localStorage dismiss, all-done celebration banner. Auto-marks steps complete from real API data.
- [x] **Loading states consistency** — Audit every data-fetching component. Ensure all have proper loading skeletons, not just spinners or blank screens.
- [x] **Toast / notification system** — Ensure all success/error actions show consistent toasts. No silent failures.
- [x] **Mobile UX audit** — Audited all 9 pages at 375px. Fixed: monitors/versions table columns progressively hidden at sm/md/lg breakpoints (Name+Status+Action always visible), versions page header buttons responsive text (New vs Create version check), admin metrics grid-cols-1 sm:grid-cols-3. All 8 pages return 200, no horizontal overflow.
- [x] **Keyboard navigation** — Modals (both Modal.tsx and modal-framework.tsx) now trap focus with Tab/Shift+Tab cycle and close on Escape. Skip-to-content link visible on first Tab press. Global focus-visible ring ensures all interactive elements show keyboard focus indicator.
- [x] **Dark mode consistency audit** — Check all pages/components for hardcoded colors that don't respect dark mode. Fix any white-on-white or invisible elements.

---

### 🟡 FEATURES — Missing / Incomplete

- [x] **More version providers** — Added npm (registry.npmjs.org), PyPI (pypi.org/pypi/{pkg}/json), Cargo (crates.io). Maven Central + Helm TBD.
- [x] **Webhook alert channel** — Webhook URL config + HTTP POST with JSON payload implemented in `alerts.service.ts`. UI supports create/edit/test flow.
- [x] **Slack alert channel** — Slack incoming webhook URL config implemented. UI + backend complete.
- [x] **Discord alert channel** — Discord webhook URL config + embed payload implemented. UI + backend complete.
- [x] **Telegram alert channel** — Bot token + chat ID implemented via Telegram Bot API. UI + backend complete.
- [ ] **Public status page polish** — Review current status page: add uptime percentage, response time chart, incident history, custom domain support.
- [ ] **Monitor groups / tags** — Allow grouping monitors with tags. Filter/search by tag in UI.
- [ ] **Bulk actions** — Select multiple monitors → bulk enable/disable/delete/run now. Useful for power users.
- [ ] **Monitor templates** — Pre-built templates for common checks (GitHub latest release, Docker Hub, npm package). One-click setup.
- [x] **Response time tracking** — Record and display HTTP response time per check. Show trend chart. Alert if response time exceeds threshold.
- [x] **Check history charts** — Visual timeline of check results per monitor. Show success/fail over time as a sparkline or bar chart.
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
- **Codebase:** 108 tests passing (98 API + 10 CLI), zero TypeScript errors, dark/light theme toggle, responsive design on all 9 pages + PWA install/offline UX
- **Build:** ✅ Clean builds, all dependencies locked, Docker setup working
- **Deployment:** GitHub Actions CI/CD running, reverse proxy nginx at https://oc-dev-test.no749ah.com (all 8 pages 200)
- **Production Readiness:** ~65-70% — All security gaps closed (2FA, CSRF, lockout, rate limiting, password strength, audit log, session anomaly detection, input sanitization), full accessibility foundation (focus traps, aria roles, skip-to-content, focus-visible rings), form validation UX on monitors, all alert channels (discord/slack/telegram/webhook) working
- **Remaining:** Onboarding flow, loading states audit, mobile UX audit, dark mode audit, more version providers, response time tracking, check history charts, performance profiling, E2E tests, i18n
- **Next Project:** PulsePing is ON HOLD. Focus entirely on PulseDock until it is genuinely production-ready.
