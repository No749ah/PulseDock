# MEMORY.md - Long-Term Knowledge

## User Profile
- **Name:** No749ah
- **Timezone:** (assumed UTC or EU, ask if wrong)
- **Main Project:** PulseDock (version checker → world-leading)
- **Goal:** Build unique projects that don't exist yet, make them the best

## Projects
### PulseDock (Active)
- **Status:** In development, pushing to GitHub locally
- **Vision:** World-leading version checker for multiple programs
- **Next:** Autonomous heartbeat analysis every 2h (via mini/haiku model)
- **Repo:** Local + GitHub (token available)

## Setup & Preferences
- **Docker:** compose with `openclaw-gateway` + `openclaw-cli`
- **Models:** 
  - Primary: Haiku (cheap, fast)
  - Escalation: Sonnet/Opus (only when needed)
  - Heartbeat: gpt-5-mini (micro tokens)
  - Code-heavy: Codex
- **Bootstrap:** 6000/25000 chars (lean, token-efficient)
- **Heartbeat:** Every 2h, analyzes `projects/PulseDock/` (gaps, next steps, quick wins)
- **DMs:** Pairing configured ✅
- **PulseDock URLs:**
  - Frontend dev: http://localhost:3000
  - Frontend prod: https://oc-web-test.no749ah.com
  - API (remote, not local): https://oc-api-test.no749ah.com
  - Frontend .env: NEXT_PUBLIC_API_BASE_URL=https://oc-api-test.no749ah.com ✅

## Project Port Mapping (User instruction)
- This project is mapped to port **4000** for API and proxying during development.
- New canonical dev URL: https://oc-test-4000.no749ah.com/ (use this for project-specific testing).
- There are similar hostnames for port 3000, but for this project **always use 4000**.
- Notes: Frontend rewrites /api to http://localhost:4000 during local dev; in production set NEXT_PUBLIC_API_BASE_URL to the canonical URL.

## Operational Rules
1. **Task Delegation:** Mini/Haiku → if too big → create Task for Sonnet/Opus
2. **Heartbeat:** Autonomous project analysis + optional commits
3. **CLI:** Use `docker compose exec -T openclaw-gateway` (no `run --rm`)
4. **Workspace:** Live in `~/.openclaw/workspace/` — read SOUL.md, AGENTS.md, daily logs
5. **After finishing work:** Restart the PulseDock project services (web/api) to ensure the latest version is actually running.

## Fixes Applied (2026-02-19 15:41)
- ✅ API URL routing: Removed `inferApiBaseFromLocation()`, now always uses `NEXT_PUBLIC_API_BASE_URL`
- ✅ LoginPage hydration: Changed `<Stack component="form">` to native `<form>` (Server/client parity)
- ✅ Avatar hydration: Extracted UserProfile as dynamic component with `ssr: false`
- ✅ Swagger docs: Updated main.ts with world-leading description + server URLs

## Known Issues (PulseDock)
1. **WebSocket HMR failures:** Trying to connect to `wss://oc-web-test.no749ah.com/_next/webpack-hmr` (DNS/tunnel issue, non-critical for dev)

## Status Page Builder MVP (in progress)
- **Schema:** PublicStatusPage model added to Prisma ✅
- **API endpoints:** CRUD + publish/unpublish + public read endpoint ✅
- **Web builder UI:** Status page list + create form ✅ (no DnD yet)
- **Public endpoint:** `/v1/public/status-page/:slug` partially working (needs runtime debugging)
- **Known issue:** Old API process still running on 4001; need to clean up before next session
- **Next:** Fix port conflict, test full end-to-end flow (create, publish, view public)

## Gaps / TODOs (for future sessions)
- [ ] Fix port conflict (kill old API, restart fresh)
- [ ] Test public status page endpoint end-to-end
- [ ] Implement DnD block reordering (Release 2)
- [ ] Add stats/uptime stats (Release 3)
- [ ] Set up production env vars (RESEND_API_KEY, DISCORD_BOT_TOKEN)
- [ ] Add Playwright mobile smoke tests
- [ ] Fix Mantine hydration warnings (use dynamic imports or skip SSR for client components)
- [ ] Analyze PulseDock deeply (understand uniqueness, roadmap)
- [ ] Set up GitHub Actions / auto-release flow (if PulseDock needs it)

## Notes
- User values **autonomy** — he wants me to identify and create Tasks, not ask permission
- User values **progress** — each heartbeat should move the needle
- User is building a **portfolio of world-class projects** (one at a time)
- DMs work now ✅ Can use all channels

---

_Updated: 2026-02-19. Next review: after first Heartbeat run._
