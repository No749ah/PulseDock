## Status Summary (2026-04-10 05:14 UTC)
- **Build/Test/Audit:** ✅ Full Step-0 bootstrap + Step-1 health checks passed (`git pull origin dev`, `npm run build`, `npm run test`, `npm audit --audit-level=high`), plus post-change build/test/audit rerun passed.
- **Deployment:** ✅ Services restarted via `npm run restart`; post-deploy verification passed (`/health` 200, `/login` 200, local/public `/api/v1/monitors` auth-path checks returned expected `401`).
- **Frontend Audit:** ✅ Step-5 checks all green (`npm run audit:frontend:heads`: 8/8, `npm run audit:frontend:heads:prod`: 16/16, `npm run audit:frontend`: 54/54, `npm run audit:frontend:prod`: 108/108).
- **Branch:** heartbeat/2026-04-08-noon (rotation check skipped at 05:14 UTC via `npm run heartbeat:rotate:if-due`, outside 00:00-00:05 / 12:00-12:05 UTC windows)
- **Last changes (05:14 UTC):**
  - [x] **fix(heartbeat): cap bootstrap timeout env values with explicit upper bounds** — hardened `scripts/heartbeat-bootstrap.sh` with validated limits for SSH and dind socket timeout envs so oversized values fail fast before Step-0 checks run.

## Status Summary (2026-04-10 04:58 UTC)
- **Build/Test/Audit:** ✅ Full Step-0 bootstrap + Step-1 health checks passed (`git pull origin dev`, `npm run build`, `npm run test`, `npm audit --audit-level=high`), plus post-change build/test/audit rerun passed.
- **Deployment:** ✅ Services restarted via `npm run restart`; post-deploy verification passed (`/health` 200, `/login` 200, web/public `/api/v1/monitors` auth-path checks returned expected `401` with Bearer header).
- **Frontend Audit:** ✅ Step-5 checks all green (`npm run audit:frontend:heads`: 8/8, `npm run audit:frontend:heads:prod`: 16/16, `npm run audit:frontend`: 54/54, `npm run audit:frontend:prod`: 108/108).
- **Branch:** heartbeat/2026-04-08-noon (rotation check skipped at 04:58 UTC via `npm run heartbeat:rotate:if-due`, outside 00:00-00:05 / 12:00-12:05 UTC windows)
- **Last changes (04:58 UTC):**
  - [x] **fix(heartbeat): cap Step-1 timeout env values with explicit upper bounds** — hardened `scripts/heartbeat-health.sh` with validated limit env controls for git/build/test/audit timeout values so oversized timeouts fail fast before heartbeat checks run.

## Status Summary (2026-04-10 03:16 UTC)
- **Build/Test/Audit:** ✅ Full Step-0 bootstrap + Step-1 health checks passed (`git pull origin dev`, `npm run build`, `npm run test`, `npm audit --audit-level=high`), plus post-change build/test/audit rerun passed.
- **Deployment:** ✅ Services restarted via `npm run restart`; post-deploy verification passed (`/health` 200, `/login` 200, web/public `/api/v1/monitors` auth-path checks returned expected `401` with Bearer header).
- **Frontend Audit:** ✅ Step-5 checks all green (`npm run audit:frontend:heads`: 8/8, `npm run audit:frontend:heads:prod`: 16/16, `npm run audit:frontend`: 54/54, `npm run audit:frontend:prod`: 108/108).
- **Branch:** heartbeat/2026-04-08-noon (rotation check skipped at 03:16 UTC via `npm run heartbeat:rotate:if-due`, outside 00:00-00:05 / 12:00-12:05 UTC windows)
- **Last changes (03:16 UTC):**
  - [x] **chore(build): harden web build backup cleanup with strict shell mode** — updated `scripts/build-web.sh` to use `set -euo pipefail` and an EXIT trap that always removes temporary static backup directories, preventing stale temp-dir buildup on interrupted builds.

---

## ⚠️ INSTRUCTION FROM NOAH (2026-03-17, updated)

**The project is NOT done. Not even close.**
**Work on this until EVERYTHING is perfect - every enterprise tool in the registry, every widget type implemented, every UI pixel polished.**
**Self-optimize: after every task, critically review your own work. Would a Fortune 500 pay for this? If not, improve.**
**Keep adding to this backlog when you discover gaps. Never stop improving.**
**Do not propose new projects. PulseDock is the focus until it's genuinely world-class.**

---

## Next Up (Priority Order)

### 🔴 P0 - Architecture & Code Quality

- [x] **Refactor monitors.service.ts (9613 lines → modular)** - ✅ Done (2026-03-30). Split into 6 sub-services:
  - `monitors-crud.service.ts` - CRUD, list, clone, bulk operations
  - `monitors-analytics.service.ts` - fleet report, trends, correlation, anomaly, failure prediction, heatmaps
  - `monitors-sla.service.ts` - SLA dashboard, compliance, forecast, error budget, burn rate
  - `monitors-diagnostics.service.ts` - health scores, coverage, check rate, schedule, interval optimizer
  - `monitors-export.service.ts` - export/import, config, OpenAPI import, Docker Compose import
  - `monitors-comparison.service.ts` - compare, latency distribution, period comparison
  - `monitors.service.ts` is now a thin facade. All 1044 monitor tests passing.

- [x] **Refactor monitors.controller.ts** - ✅ Already split into 10 sub-controllers (2510 lines total across alerts, analytics, comparison, details, diagnostics, export, runs, sla, state + main controller). Each handles its domain routes.

- [x] **Refactor alerts.service.ts** - ✅ Already split into sub-services:
  - `alerts-delivery.service.ts` (1079 lines) - channel dispatch, retry, batching
  - `alerts-routing.service.ts` (683 lines) - routing rules, escalation
  - `alerts.service.ts` (219 lines) - thin facade

- [x] **API integration tests with real database** - ✅ Done (2026-03-30). 57 integration tests across 5 files running against real PostgreSQL:
  - `auth.integration.spec.ts` (9 tests) - registration, login, lockout, token validation
  - `monitors-crud.integration.spec.ts` (12 tests) - full CRUD, types, auth isolation
  - `alerts-channels.integration.spec.ts` (12 tests) - channel CRUD, ownership isolation
  - `incidents.integration.spec.ts` (14 tests) - lifecycle, timeline, insights
  - `check-execution.integration.spec.ts` (6 tests) - check persistence, auto-incidents
  - Also fixed production bug: incidents controller used `req.user.sub` instead of `req.user.id`

- [x] **Database query optimization audit** - ✅ Done (2026-03-30). Added 9 missing @@index([userId]) indexes. Batched SLA service queries (slaDashboard, slaComplianceReport, getSloSummary). Batched health score leaderboard (2N+1 → 2 queries). All hot paths optimized.

- [x] **Fix global search monitor type filtering** - ✅ Done (2026-04-01). Replaced invalid `VERSION_CHECK` literal with proper enum filters (`type: { notIn: [GIT_RELEASE, DOCKER_IMAGE] }` for uptime monitors and `type: { in: [...] }` for version monitors). Added targeted unit coverage + integration coverage for `/v1/search` (auth, limits, isolation, result mapping).

- [x] **Normalize API path expectations in ops checks/docs** - ✅ Done (2026-04-01). `scripts/verify-deployment.sh` is the canonical verification script with all three access paths documented (direct API port 4321, web proxy port 1234, public reverse proxy). Path anti-pattern guard included.

### 🟠 P1 - UX & Polish

- [x] **Visual browser testing** - ✅ Done (2026-04-01). Added rootless runner `scripts/visual-test-docker.sh` + `npm run test:visual:docker`; verified with 90/90 passing screenshots across all target pages × 3 viewports × 2 themes.

- [x] **Unit tests for monitor sub-services (comparison + diagnostics)** - ✅ Done (2026-04-01). 74 new unit tests for MonitorsComparisonService (pearsonCorrelation, compareMonitors, getLatencyDistribution, getPeriodComparison, getStatusTransitions) and MonitorsDiagnosticsService (getHealthScore: all 4 scoring dimensions, grade thresholds A-F). API test total: 4598 → 4672.

- [x] **Status page widget preview coverage** - ✅ Done (2026-04-01). All 82 widget palette types now have editor canvas previews. Fixed 11 missing widget cases + 3 type aliases. Zero fallthrough to default.

- [x] **Status page widget visual audit (browser)** - ✅ Done (2026-04-01). Executed visual sweep (`npm run test:visual:docker`, 90/90 pass), validated widget coverage (`npm run widget:audit`, 82/82), fixed `version-timeline` preview color-dot rendering defect, and documented qualitative findings in `docs/STATUS_PAGE_WIDGET_VISUAL_AUDIT_2026-04-01.md`.

- [x] **Loading performance audit** - ✅ Done (2026-03-30). Dashboard JS reduced 24% (1314KB → 1001KB). Chart.js removed from critical path (lazy-loaded only on monitor detail). Deleted unused BarChartCJS. TTFB <21ms on all pages. Gzipped dashboard JS ~300KB via reverse proxy.

- [x] **Remove invalid Next.js config warning** - ✅ Done (2026-04-01). Removed deprecated/invalid `optimizePackageImports` root key from `apps/web/next.config.mjs` so `npm run build` no longer emits config warnings.

- [x] **Monitor detail page UX** - ✅ Done (2026-03-30). Replaced flat 17-tab scrollbar with primary tabs + "More" dropdown. Extracted MonitorTabBar component. 4 primary tabs always visible, 13 secondary in dropdown.

- [x] **Sidebar navigation UX** - ✅ Done (2026-03-30). Reorganized into categorized sub-sections with labels. Monitoring group: 3 primary + 5 sub-sections (Real-time, Performance, Intelligence, Infrastructure, Versions). Progressive disclosure preserved.

### 🟡 P2 - Features & Enhancements

- [x] **GraphQL monitor improvements** - ✅ Done (2026-03-30). Added: template variable substitution ({{VAR_NAME}}), introspection validation with schema hash, schema change detection (previousSchemaHash comparison), latency threshold support (yellow/degraded). 22 tests covering all features.

- [x] **Webhook signature verification docs** - `docs/WEBHOOKS.md` with payload format, HMAC-SHA256 examples in Node.js, Python, Go, PHP. *(2026-03-30)*

- [x] **Status page custom CSS** - ✅ Already implemented. Custom CSS textarea in status page editor settings panel (max 10,000 chars), injected into public page `<head>` via `<style>`. Works in both live pages and preview mode.

- [x] **Monitor grouping hierarchy** - ✅ Done (2026-03-30). Nested folder hierarchy (max 5 levels) with self-referencing Folder tree. Cycle detection, stats aggregation bubbling up, new `/flat` + `/move` endpoints. Mute/unmute cascades to subfolders. Frontend tree view with indentation + parent selector in create modal. 25 unit tests.

- [x] **Batch notification digest improvements** - Added weekly_digest option (cron: Mon 07:05 UTC). Trend data in digests deferred (requires significant mailer template rework). *(2026-03-30)*

### 🟢 P3 - Maintenance & Cleanup

- [x] **Cap heartbeat Step-0 bootstrap timeout env values with explicit upper bounds** - ✅ Done (2026-04-10). Hardened `scripts/heartbeat-bootstrap.sh` with bounded validation for `HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS`/`HEARTBEAT_PORT_CHECK_TIMEOUT_MS` plus new limit env controls (`HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS_LIMIT`, `HEARTBEAT_PORT_CHECK_TIMEOUT_MS_LIMIT`) so oversized values fail fast before bootstrap checks run.
- [x] **Cap heartbeat Step-1 health-check timeout env values with explicit upper bounds** - ✅ Done (2026-04-10). Hardened `scripts/heartbeat-health.sh` with validated limit env controls (`HEARTBEAT_GIT_PULL_TIMEOUT_SECONDS_LIMIT`, `HEARTBEAT_BUILD_TIMEOUT_SECONDS_LIMIT`, `HEARTBEAT_TEST_TIMEOUT_SECONDS_LIMIT`, `HEARTBEAT_AUDIT_TIMEOUT_SECONDS_LIMIT`) so oversized timeout values fail fast before Step-1 checks run.
- [x] **Harden web build backup cleanup and shell failure handling** - ✅ Done (2026-04-10). Updated `scripts/build-web.sh` to use strict shell mode (`set -euo pipefail`) and added EXIT-trap cleanup for temporary `.next/static` backup directories so interrupted/failing builds cannot leak temp paths.
- [x] **Limit stale Next.js build-process cleanup to long-lived orphans only** - ✅ Done (2026-04-10). Refined `scripts/build-web.sh` stale process detection to only target repo-local `next build` processes older than 10 minutes (`ps etimes > 600`), preventing accidental termination of fresh build wrappers started by the current heartbeat run.
- [x] **Harden static-chunk backup path in web build script to avoid repeated-heartbeat collisions** - ✅ Done (2026-04-10). Updated `scripts/build-web.sh` to back up `.next/static` into a unique `mktemp` directory and merge from that path after build, eliminating fixed `.next/static-prev` destination collisions (`cp: cannot create directory '.next/static-prev': File exists`) during repeated heartbeat runs.
- [x] **Clear stale Next.js build process/lock state before heartbeat web builds** - ✅ Done (2026-04-10). Hardened `scripts/build-web.sh` to terminate orphaned repo-local `next build` processes and delete both `.next/lock` + `.next/build.lock` before invoking `next build --webpack`, preventing false concurrent-build collisions in heartbeat runs.
- [x] **Normalize curl failure status handling in heartbeat/frontend route audits** - ✅ Done (2026-04-09). Fixed `scripts/heartbeat-curl-pages.sh` and `scripts/audit-frontend-pages.sh` to map failed curl executions to a single fallback status (`000` / `000|`) without concatenated `000000` artifacts, restoring correct transient-failure retry behavior and deterministic failure reporting.
- [x] **Reject malformed path segments in heartbeat Step-5 required routes** - ✅ Done (2026-04-09). Hardened `scripts/heartbeat-required-routes.sh` to fail fast when configured routes contain empty path segments (`//`) or dot segments (`/./`, `/../`), preventing implicit path normalization from masking invalid required-route entries.
- [x] **Reject query/fragment and userinfo in Step-5 frontend audit base origins** - ✅ Done (2026-04-09). Hardened `scripts/heartbeat-curl-pages.sh` and `scripts/audit-frontend-pages.sh` `validate_origin_base` checks to fail fast when `WEB_BASE_URL`/`PUBLIC_BASE_URL` include query (`?`), fragment (`#`), or userinfo (`user@host`) components, and to reject empty/malformed host origins that previously slipped past regex-only validation.
- [x] **Cap Step-5 route-audit curl timeout envs with explicit upper bounds** - ✅ Done (2026-04-09). Hardened `scripts/heartbeat-curl-pages.sh` and `scripts/audit-frontend-pages.sh` with validated limit env controls (`HEARTBEAT_HEAD_REQUEST_TIMEOUT_SECONDS_LIMIT`, `HEARTBEAT_HEAD_CONNECT_TIMEOUT_SECONDS_LIMIT`, `FRONTEND_AUDIT_REQUEST_TIMEOUT_SECONDS_LIMIT`, `FRONTEND_AUDIT_CONNECT_TIMEOUT_SECONDS_LIMIT`) so oversized timeout values fail fast before audits run.
- [x] **Validate heartbeat Step-5 frontend audit base URLs as strict origins** - ✅ Done (2026-04-09). Hardened `scripts/heartbeat-curl-pages.sh` and `scripts/audit-frontend-pages.sh` with fail-fast base URL validation to enforce non-empty, whitespace-free `http(s)://host[:port]` origins (no path/query/fragment) for `WEB_BASE_URL`/`PUBLIC_BASE_URL`.
- [x] **Reject query/fragment/whitespace in heartbeat Step-5 required routes** - ✅ Done (2026-04-09). Tightened `scripts/heartbeat-required-routes.sh` validation so route entries fail fast when they include whitespace or URL query/fragment components (`?`, `#`), keeping Step-5 route audits strictly path-only.
- [x] **Validate heartbeat required-route list integrity at source** - ✅ Done (2026-04-09). Hardened `scripts/heartbeat-required-routes.sh` to fail fast on empty/invalid entries (must start with `/`, no trailing slash except `/`) and duplicate routes so Step-5 route audits cannot silently drift or double-check malformed paths.
- [x] **Cap heartbeat Step-5 retry settings with explicit upper bounds** - ✅ Done (2026-04-09). Hardened `scripts/heartbeat-curl-pages.sh` with validated max guardrails (`HEARTBEAT_HEAD_MAX_RETRIES_LIMIT` default `10`, `HEARTBEAT_HEAD_MAX_RETRY_DELAY_SECONDS_LIMIT` default `30`) and fail-fast checks when configured retry counts/delays exceed safe limits.
- [x] **Cap web Vitest worker concurrency for more stable heartbeat/CI test runs** - ✅ Done (2026-04-09). Updated `apps/web/vitest.config.ts` with `minWorkers: 1` and `maxWorkers: 4` so web tests avoid over-parallelism on constrained runners while preserving consistent execution behavior.
- [x] **Prevent timing-breakdown waterfall aggregate width overflow when phase sums exceed total latency** - ✅ Done (2026-04-09). Added `apps/web/app/monitors/timing-breakdown/waterfall.ts` helper to sanitize phase values, compute safe percentages against `max(total, phaseSum)`, and reduce rounded overflow back to 100%; wired `WaterfallBar` to use it and added unit tests for invalid timings, invalid totals, and overflow correction.
- [x] **Clamp timing-breakdown waterfall segment widths when total latency is invalid** - ✅ Done (2026-04-09). Hardened `apps/web/app/monitors/timing-breakdown/page.tsx` to treat non-finite/≤0 totals as safe fallback values and clamp segment percentages to `1..100`, preventing oversized `width` styles for malformed timing data; added matching unit coverage in `apps/web/app/monitors/timing-breakdown/page.spec.ts` for zero/negative totals.
- [x] **Parameterize frontend route/static-asset audit curl timeouts with validated env controls** - ✅ Done (2026-04-09). Updated `scripts/audit-frontend-pages.sh` to support `FRONTEND_AUDIT_REQUEST_TIMEOUT_SECONDS` and `FRONTEND_AUDIT_CONNECT_TIMEOUT_SECONDS`, validate both values, enforce connect-timeout ≤ request-timeout, and apply those bounds across route checks, HTML fetches, and static asset checks.
- [x] **Centralize heartbeat-required frontend routes for Step-5 audits** - ✅ Done (2026-04-09). Added `scripts/heartbeat-required-routes.sh` as the single source of truth for mandatory Step-5 routes and switched both `scripts/audit-frontend-pages.sh` and `scripts/heartbeat-curl-pages.sh` to source it, preventing route-list drift between GET/static-asset and HEAD checks.
- [x] **Decouple root build from implicit web start side effects** - ✅ Done (2026-04-09). Updated root `package.json` so `npm run build` compiles web/api/agent/cli/extension only and no longer runs `scripts/start-web.sh`; this keeps heartbeat Step-1 health checks side-effect free and reserves service restarts for mandatory Step 3.
- [x] **Bound heartbeat bootstrap SSH + dind reachability checks with explicit timeouts** - ✅ Done (2026-04-09). `scripts/heartbeat-bootstrap.sh` now validates `HEARTBEAT_SSH_CONNECT_TIMEOUT_SECONDS` and `HEARTBEAT_PORT_CHECK_TIMEOUT_MS`, applies bounded SSH auth options (`BatchMode`, `ConnectionAttempts=1`, `ConnectTimeout`) for `ssh -T git@github.com`, and uses timeout-backed socket probes for dind PostgreSQL/Redis checks to prevent indefinite hangs.
- [x] **Stabilize heartbeat HEAD curl timeout controls + API integration bootstrap timeout** - ✅ Done (2026-04-09). Added validated env controls for heartbeat HEAD route checks (`HEARTBEAT_HEAD_REQUEST_TIMEOUT_SECONDS`, `HEARTBEAT_HEAD_CONNECT_TIMEOUT_SECONDS`) and limited retries to transient failures only (`000`, `429`, `5xx`) in `scripts/heartbeat-curl-pages.sh`; also set explicit `beforeAll` timeout in `apps/api/src/integration.spec.ts` to reduce bootstrap flake risk in slower CI/dev environments.
- [x] **Bound heartbeat rotation grace to valid minute range** - ✅ Done (2026-04-09). Enforced `HEARTBEAT_ROTATE_WINDOW_GRACE_MINUTES` as integer `0..59` in `scripts/heartbeat-rotate-branch.sh` and `scripts/heartbeat-rotate-if-due.sh` to prevent accidental full-hour rotation windows from oversized values.
- [x] **Harden heartbeat Step-5 HEAD curl checks with retry guardrails** - ✅ Done (2026-04-09). `scripts/heartbeat-curl-pages.sh` now retries transient failures before failing and validates retry env values (`HEARTBEAT_HEAD_MAX_RETRIES`, `HEARTBEAT_HEAD_RETRY_DELAY_SECONDS`) to reduce flaky false negatives during immediate post-restart checks.
- [x] **Auto-prune backlog status summaries during full heartbeat runs** - ✅ Done (2026-04-08). Added `npm run backlog:prune` as an explicit step in both `scripts/heartbeat-check.sh` and `scripts/heartbeat-cycle.sh`, and reduced default summary retention in `scripts/prune-backlog-status.sh` from 10 to 3 to keep `BACKLOG.md` concise while archiving older entries.
- [x] **Harden heartbeat Step-1 git sync with fast-forward-only + timeout guard** - ✅ Done (2026-04-08). `scripts/heartbeat-health.sh` now executes `git pull --ff-only origin dev` through the shared timeout-aware tailed runner and validates `HEARTBEAT_GIT_PULL_TIMEOUT_SECONDS` (default `300`) as a positive integer before execution.
- [x] **Fail heartbeat bootstrap on GitHub SSH auth errors by default** - ✅ Done (2026-04-08). `scripts/heartbeat-bootstrap.sh` now validates `ssh -T git@github.com` output and fails fast when auth does not report success; opt-out warning mode available via `HEARTBEAT_REQUIRE_GITHUB_SSH=false`.
- [x] **Validate heartbeat Step-1 timeout env values before command execution** - ✅ Done (2026-04-08). `scripts/heartbeat-health.sh` now validates `HEARTBEAT_BUILD_TIMEOUT_SECONDS`, `HEARTBEAT_TEST_TIMEOUT_SECONDS`, and `HEARTBEAT_AUDIT_TIMEOUT_SECONDS` as positive integers and fails fast with explicit errors for invalid values.
- [x] **Add timeout guards to heartbeat Step-1 build/test/audit runner** - ✅ Done (2026-04-08). `scripts/heartbeat-health.sh` now supports configurable command timeouts (`HEARTBEAT_BUILD_TIMEOUT_SECONDS`, `HEARTBEAT_TEST_TIMEOUT_SECONDS`, `HEARTBEAT_AUDIT_TIMEOUT_SECONDS`) and surfaces explicit timeout failures instead of hanging indefinitely.
- [x] **Enforce heartbeat git identity during bootstrap** - ✅ Done (2026-04-08). `scripts/heartbeat-bootstrap.sh` now validates global `git config` identity and auto-sets `user.name`/`user.email` to `No749ah` + `no749ah@users.noreply.github.com` (overrideable via `HEARTBEAT_GIT_USER_NAME` / `HEARTBEAT_GIT_USER_EMAIL`) to prevent misattributed automation commits.
- [x] **Block heartbeat health runs on dirty working trees** - ✅ Done (2026-04-08). `scripts/heartbeat-health.sh` now fails fast when `git status --porcelain` is non-empty and prints concise pending changes, preventing `git pull origin dev` conflicts and mixed-state heartbeat validations.
- [x] **Patch nodemailer SMTP command-injection advisory** - ✅ Done (2026-04-08). Upgraded `@pulsedock/api` dependency `nodemailer` from `^8.0.3` to `^8.0.5` and refreshed lockfile, resolving `GHSA-vvjj-xcjg-gr5g` in heartbeat audits.
- [x] **Remove eval execution from heartbeat orchestration runners** - ✅ Done (2026-04-08). Replaced `eval` in `scripts/heartbeat-check.sh` and `scripts/heartbeat-cycle.sh` with direct command invocation (`"$@"`) so each step executes without shell re-parsing and with lower injection risk.
- [x] **Auto-run heartbeat branch rotation only when scheduled** - ✅ Done (2026-04-08). Added `scripts/heartbeat-rotate-if-due.sh` + npm script `heartbeat:rotate:if-due`; integrated with `scripts/heartbeat-cycle.sh` so Step 6 runs automatically at 00:00/12:00 UTC windows and exits cleanly with a skip message off-schedule.
- [x] **Automate explicit heartbeat Step-5 HEAD curl checks for required frontend pages** - ✅ Done (2026-04-08). Added `scripts/heartbeat-curl-pages.sh` plus npm scripts `audit:frontend:heads` / `audit:frontend:heads:prod`; wired both into `scripts/heartbeat-check.sh` and `scripts/heartbeat-cycle.sh` so every full heartbeat run enforces the required `/login /dashboard /monitors /alerts /account /projects /versions /admin` `curl -I` checks locally/publicly.
- [x] **Allow heartbeat rotation in a small scheduled-window grace period** - ✅ Done (2026-04-08). `scripts/heartbeat-rotate-branch.sh` now supports `HEARTBEAT_ROTATE_WINDOW_GRACE_MINUTES` (default `5`) so 00:00/12:00 UTC rotations tolerate scheduler jitter while still blocking off-window runs.
- [x] **Enforce heartbeat branch safety in Step-1 health runner** - ✅ Done (2026-04-08). `scripts/heartbeat-health.sh` now hard-fails on `main`, `dev`, detached HEAD, and non-`heartbeat/*` branches before running pull/build/test/audit.
- [x] **Remove duplicate dind reachability logs in heartbeat bootstrap** - ✅ Done (2026-04-08). `scripts/heartbeat-bootstrap.sh` now runs silent preflight connectivity checks, starts dind services only when needed, then reports PostgreSQL/Redis reachability once with explicit failure output.
- [x] **Wire concise health-check runner into heartbeat check/cycle pipelines** - ✅ Done (2026-04-08). `scripts/heartbeat-check.sh` and `scripts/heartbeat-cycle.sh` now run `npm run heartbeat:health` for Step 1 instead of duplicating separate build/test/audit commands.
- [x] **Add concise heartbeat Step-1 health-check runner** - ✅ Done (2026-04-08). Added `scripts/heartbeat-health.sh` + `npm run heartbeat:health` to run `git pull origin dev`, `npm run build` (tail -3), `npm run test` (tail -5), and `npm audit --audit-level=high` (tail -3) with strict failure propagation.
- [x] **Enforce exact-minute heartbeat rotation schedule checks** - ✅ Done (2026-04-08). `scripts/heartbeat-rotate-branch.sh` now allows scheduled rotation only at exactly `00:00` or `12:00` UTC (minute must be `00`), and includes real current `HH:MM` UTC in off-schedule errors.
- [x] **Make heartbeat Docker bootstrap check configurable** - ✅ Done (2026-04-08). `scripts/heartbeat-bootstrap.sh` now handles missing Docker CLI gracefully by default and supports strict failure via `HEARTBEAT_REQUIRE_DOCKER=true` when hard enforcement is needed.
- [x] **Normalize frontend-audit base URLs before route comparison** - ✅ Done (2026-04-08). `scripts/audit-frontend-pages.sh` now trims trailing `/` from configured base URLs and normalizes effective URLs before route equality checks, preventing false-positive redirect drift failures.
- [x] **Harden deploy-audit CLI argument parsing** - ✅ Done (2026-04-08). `scripts/audit-deploy.sh` now supports explicit `--help` usage output and fails fast on unknown arguments instead of silently ignoring typos.
- [x] **Block heartbeat rotation when target branch already exists** - ✅ Done (2026-04-08). `scripts/heartbeat-rotate-branch.sh` now validates that `NEW_BRANCH` does not already exist locally or on `origin` before switching to `dev` and merging.
- [x] **Validate required heartbeat rotate flag values** - ✅ Done (2026-04-08). `scripts/heartbeat-rotate-branch.sh` now validates non-empty values for `--name` and `--new-branch` and exits with clear usage errors when missing.
- [x] **Gate heartbeat branch rotation to scheduled UTC windows** - ✅ Done (2026-04-08). `scripts/heartbeat-rotate-branch.sh` now enforces execution at 00:00/12:00 UTC by default and requires explicit `--allow-off-schedule` override for manual off-cycle rotations.
- [x] **Automate heartbeat branch rotation workflow** - ✅ Done (2026-04-08). Added `scripts/heartbeat-rotate-branch.sh` + npm script `heartbeat:rotate` to merge current `heartbeat/*` into `dev`, delete old heartbeat branch locally/remotely, and create/push a fresh heartbeat branch from updated `dev`.
- [x] **Enforce heartbeat branch safety in automation scripts** - ✅ Done (2026-04-07). `scripts/heartbeat-check.sh` and `scripts/heartbeat-cycle.sh` now require execution from `heartbeat/*` branches and fail on `dev`, `main`, or detached HEAD.
- [x] **Fail frontend heartbeat audit on redirect drift** - ✅ Done (2026-04-07). `scripts/audit-frontend-pages.sh` now follows redirects and fails when required routes resolve to a different URL (for example, hidden auth fallback to `/login`) even if status remains 200.
- [x] **Automate full heartbeat validation pipeline** - ✅ Done (2026-04-07). Added `scripts/heartbeat-check.sh` with npm scripts `heartbeat:check` and `heartbeat:check:prod` to run build/test/audit + post-deploy + frontend route checks in one command.
- [x] **Add strict-auth mode to heartbeat check pipeline** - ✅ Done (2026-04-07). Enhanced `scripts/heartbeat-check.sh` to support `--strict-auth` (compatible with `--public`) and added npm scripts `heartbeat:check:strict` and `heartbeat:check:strict:prod`.
- [x] **Automate full heartbeat execution pipeline with restart gate** - ✅ Done (2026-04-07). Added `scripts/heartbeat-cycle.sh` + npm scripts `heartbeat:cycle*` to enforce the complete sequence (bootstrap, build, test, audit, mandatory restart, deploy audit, frontend audit), including optional public and strict-auth modes.
- [x] **Make web startup readiness explicit in deployment flow** - ✅ Done (2026-04-07). `scripts/start-web.sh` now waits for `/login` readiness before returning, preventing race conditions right after restart.
- [x] **Enforce `git pull origin dev` inside heartbeat runners** - ✅ Done (2026-04-07). `scripts/heartbeat-check.sh` and `scripts/heartbeat-cycle.sh` now perform repo sync as the first pipeline step.

- [x] **Automate heartbeat frontend route audit** - ✅ Done (2026-04-07). Added `scripts/audit-frontend-pages.sh` + npm scripts `audit:frontend` and `audit:frontend:prod` to enforce local/public 200 checks for required UI routes.
- [x] **Automate heartbeat frontend static-asset audit** - ✅ Done (2026-04-07). Enhanced `scripts/audit-frontend-pages.sh` to discover and validate Next.js `_next/static` CSS/JS assets from each required route and fail on non-200 asset loads.
- [x] **Detect runtime error pages during heartbeat frontend audit** - ✅ Done (2026-04-07). `scripts/audit-frontend-pages.sh` now inspects route HTML for known Next.js runtime-error markers and fails even when HTTP status is 200.
- [x] **Automate heartbeat environment bootstrap checks** - ✅ Done (2026-04-07). Added `scripts/heartbeat-bootstrap.sh` + npm script `heartbeat:bootstrap`; wired bootstrap as the first step in `heartbeat:check`.
- [x] **Automate optional authenticated heartbeat deploy checks** - ✅ Done (2026-04-07). Enhanced `scripts/audit-deploy.sh` to validate authenticated `/api/v1/monitors` with `HEARTBEAT_AUTH_BEARER_TOKEN`, and added `--strict-auth` plus npm scripts `audit:deploy:strict` and `audit:deploy:strict:prod`.
- [x] **Prune old status summaries from backlog file** - ✅ Done (2026-04-01). Removed redundant top-of-file status blocks and kept a single current status summary. (Note: git commit history itself is immutable and intentionally unchanged.)
- [x] **Automate backlog status-summary pruning + archive** - ✅ Done (2026-04-07). Added `scripts/prune-backlog-status.sh` + `npm run backlog:prune`; keeps latest status summaries in `BACKLOG.md` and archives older summaries to `docs/BACKLOG_STATUS_ARCHIVE.md`.

- [x] **Consolidate duplicate API endpoints** - ✅ Done (2026-03-30). Extracted shared v2 types (PaginatedEnvelope, AuthenticatedRequest, parsePagination, buildMeta) into v2/v2.types.ts and common/auth.types.ts. v1 and v2 are complementary (v2 adds pagination), not duplicates. 14 unit tests added.

- [x] **Upgrade path documentation** - `docs/UPGRADING.md` covers all 5 pending major upgrades with risk assessment, breaking changes, and strategy. *(2026-03-30)*

- [x] **CHANGELOG cleanup** - Merged 3 stale "Unreleased" sections into v1.1.0. All 18 releases properly versioned with comparison links. *(2026-03-30)*

- [x] **Web auth session utility coverage** - ✅ Done (2026-04-02). Added `apps/web/components/auth.spec.ts` with 8 tests validating local session persistence/cache hydration, malformed storage tolerance, deprecated token getter behavior, logout API contract, and network-failure-safe `clearSession` semantics.

---

## Completed Features (Reference)

<details>
<summary>Click to expand full completed feature list</summary>

### Core Monitoring
- [x] HTTP/TCP/SSL/Heartbeat/DNS/WHOIS/SMTP/FTP/IMAP/POP3/CT_LOG/GraphQL/Browser monitor types
- [x] Check retries with exponential backoff
- [x] Cron expression scheduling
- [x] Rate limiting & throttling per monitor
- [x] Failure confirmations (debounce alert noise)
- [x] Flapping detection
- [x] Latency anomaly detection (P95 baseline)
- [x] Business hours schedule
- [x] Monitor pinning, cloning, bulk operations
- [x] Monitor priority (P1-P4)
- [x] Check history with CSV export
- [x] Response diff tracking
- [x] Content change detection (SHA-256)
- [x] DNS record change detection
- [x] Geo-region distribution
- [x] HTTP timing breakdown (DNS/TCP/TLS/TTFB/Download)
- [x] HTTP header assertions
- [x] HTTP body/JSON path assertions
- [x] Custom metric capture (JSONPath)
- [x] Redirect chain tracking
- [x] Response size tracking
- [x] Monitor config change history (audit trail)
- [x] Failure pattern analysis
- [x] Status webhooks per monitor
- [x] Public share tokens
- [x] Uptime certificates

### Alerting
- [x] Webhook, Slack, Discord, Telegram, Email, PagerDuty, OpsGenie, SMS (Twilio), Teams, Mattermost, Zulip, Rocket.Chat, ntfy, Gotify, Apprise channels
- [x] Alert routing rules (conditional)
- [x] Alert acknowledgement & monitor muting
- [x] Alert grouping/correlation
- [x] Alert batching/digest mode
- [x] Per-channel active schedules
- [x] Custom message templates
- [x] Alert noise analysis
- [x] Alert response time analytics
- [x] Alert storm protection
- [x] SLA burn rate alerts (Google SRE model)
- [x] REPEAT_EVERY_N alert mode
- [x] Alert delivery CSV export

### Incidents
- [x] Full CRUD with timeline updates
- [x] Post-mortem auto-generation
- [x] Incident playbooks with step tracking
- [x] MTTR/MTTF analytics
- [x] Incident insights (hour/DOW heatmap, severity distribution)
- [x] SVG status badges

### Status Pages
- [x] Drag-and-drop editor (dnd-kit)
- [x] 70+ widget types across 9 categories
- [x] Real CSS grid layout (12-col responsive)
- [x] Widget resize, lock, duplicate, multi-select
- [x] Undo/redo, zoom, alignment guides, layer management
- [x] Template gallery (7 presets)
- [x] Version history (10 saves, one-click restore)
- [x] Page themes (light/dark/system, fonts, accent color, backgrounds)
- [x] SEO config, custom favicon, branding toggle
- [x] Password protection
- [x] WebSocket real-time updates
- [x] Email subscriber system
- [x] Slack/Discord status change notifications
- [x] Embeddable widget (iframe/JSON/script-tag)
- [x] Status page badge (SVG)
- [x] Print/export (PDF, PNG)

### Analytics & Reports
- [x] Fleet health report (grade A-F)
- [x] Monitor trends (week-over-week)
- [x] Monitor comparison view
- [x] Failure prediction (regression-based risk scoring)
- [x] Failure correlation (Jaccard similarity + union-find clusters)
- [x] Uptime heatmap, latency heatmap
- [x] Reliability trends, incident insights
- [x] SLA dashboard, compliance report, by-tag, error budget forecast
- [x] Downtime cost tracking
- [x] Check schedule overview, interval optimizer
- [x] Security headers fleet dashboard
- [x] Monitor anomaly report
- [x] Operations digest
- [x] Assertion stats, tag analytics
- [x] Health score leaderboard
- [x] Latency budget tracking, benchmarking
- [x] Monitor infrastructure topology (SVG graph)
- [x] Deployment events & CI/CD integration
- [x] Maintenance window effectiveness
- [x] Alert channels health dashboard

### Version Intelligence
- [x] 5000+ tools in registry (17 categories)
- [x] npm, PyPI, Cargo, Maven, Helm, Docker Hub, GitHub providers
- [x] 144 monitor templates
- [x] Version drift report
- [x] PulseDock Agent (local version reporter)
- [x] Browser extension (Chrome MV3)
- [x] CLI tool

### Security
- [x] 2FA/TOTP with recovery codes
- [x] CSRF protection (double-submit cookie)
- [x] Account lockout (5 attempts → 15min)
- [x] Email verification
- [x] Password strength enforcement (12+ chars)
- [x] Strict rate limiting on auth endpoints
- [x] Audit log with CSV/JSON export
- [x] Session activity & anomaly detection
- [x] OAuth SSO (GitHub + Google)
- [x] Input sanitization
- [x] Security headers (helmet)

### Enterprise
- [x] Multi-user/team with RBAC (Owner/Admin/Editor/Viewer)
- [x] Organizations/workspaces
- [x] API keys with scoped permissions
- [x] Scheduled email reports
- [x] Data retention policies with rollup
- [x] Backup & restore
- [x] Billing/plan management
- [x] White-label support
- [x] Grafana datasource plugin
- [x] i18n (EN + DE)

### Infrastructure
- [x] Docker Compose (dev + prod)
- [x] Kubernetes manifests + Helm chart
- [x] GitHub Actions CI/CD
- [x] Prometheus metrics endpoint
- [x] WebSocket real-time updates
- [x] Redis caching layer
- [x] Historical data retention (configurable)
- [x] Aggregation rollups

### Code Quality
- [x] 5350+ tests (4571 API + 757 web + 12 agent + 10 CLI)
- [x] Zero `any` types, zero TODO/FIXME, zero console.log
- [x] Zero TS errors (API + web)
- [x] Zero npm audit vulnerabilities
- [x] API p95 <15ms, Web TTFB <130ms
- [x] 19 comprehensive docs in docs/
- [x] Swagger/OpenAPI with 143 endpoints documented
- [x] JSDoc on all service methods
- [x] Performance + smoke test scripts
- [x] Code quality automation (8 checks)

</details>
