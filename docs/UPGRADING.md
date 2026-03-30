# Upgrade Guide

This document tracks upcoming major dependency upgrades and their impact on PulseDock. All are currently pinned at their last stable minor versions.

## Pending Major Upgrades

### Prisma 6 → 7

**Current:** `6.12.0` | **Latest:** `7.x`

**Breaking changes to evaluate:**
- New migration format — existing migrations may need re-baseline
- `@prisma/adapter-pg` API changes
- Client API changes (query engine updates)
- `Prisma.JsonNull` vs `null` handling may differ

**Upgrade strategy:**
1. Create a git branch `upgrade/prisma-7`
2. Update `prisma`, `@prisma/client`, `@prisma/adapter-pg` simultaneously
3. Run `npx prisma generate` — fix any schema errors
4. Run full test suite — fix broken mocks (many specs mock Prisma)
5. Test all migrations apply cleanly on a fresh database
6. Test rollup/retention jobs that use raw queries

**Risk:** High — Prisma is deeply embedded (92 migrations, 9600-line service, every spec mocks it)

**When safe:** After Prisma 7 reaches 7.2+ (initial .0 releases often have regressions)

---

### React 18 → 19

**Current:** `18.3.1` | **Latest:** `19.x`

**Breaking changes to evaluate:**
- `forwardRef` deprecated (use ref as prop)
- `useContext` → `use(context)`
- Server Components are the default
- `react-dom/server` API changes
- Some third-party libs may not support React 19 yet

**Upgrade strategy:**
1. Upgrade `react` and `react-dom` together
2. Run `npx next build` — Next.js 16 already supports React 19
3. Fix any `forwardRef` deprecation warnings
4. Test all client components that use context providers
5. Verify `dnd-kit` still works with React 19 (drag-and-drop editor)

**Risk:** Medium — Next.js 16 is designed for React 19, but `dnd-kit` + custom components may need updates

**When safe:** After verifying `@dnd-kit/*` packages support React 19

---

### TypeScript 5 → 6

**Current:** `5.9.3` | **Latest:** `6.x`

**Breaking changes to evaluate:**
- Stricter type narrowing (may surface new errors)
- `--isolatedDeclarations` behavior changes
- Config file format updates
- Decorator emit changes

**Upgrade strategy:**
1. Update `typescript` across all workspaces
2. Run `npx tsc --noEmit` in both `apps/api` and `apps/web`
3. Fix any new type errors surfaced by stricter checks
4. Verify Vitest + SWC transform compatibility

**Risk:** Low-Medium — TypeScript major bumps usually add errors, not remove valid code

**When safe:** After TS 6.1 (initial .0 usually needs patch fixes)

---

### lucide-react 0.x → 1.0

**Current:** `0.577.0` | **Latest:** `1.x`

**Breaking changes to evaluate:**
- Icon naming convention changes
- Import path changes
- Tree-shaking differences
- Some icons may be renamed or removed

**Upgrade strategy:**
1. Update `lucide-react`
2. Run `npx next build` — check for missing icon imports
3. Search codebase for any renamed icons
4. Verify icon rendering on all 71 pages

**Risk:** Low — Icons are simple, but we import 50+ icons across the app

**When safe:** Anytime — lucide-react 1.0 is stable

---

### class-validator 0.14 → 0.15

**Current:** `0.14.4` | **Latest:** `0.15.x`

**Breaking changes to evaluate:**
- Validator behavior changes
- Decorator API changes
- `whitelist` / `forbidNonWhitelisted` behavior

**Upgrade strategy:**
1. Update `class-validator`
2. Run full API test suite
3. Test all DTO validation paths (create/update for monitors, alerts, incidents, etc.)

**Risk:** Low — Minor version with deprecation fixes

**When safe:** Anytime after confirming NestJS compatibility

---

## Upgrade Order Recommendation

1. **lucide-react 1.0** — Lowest risk, just icon renames
2. **class-validator 0.15** — Minor API changes
3. **TypeScript 6** — May surface new errors to fix
4. **React 19** — Medium risk, needs dnd-kit verification
5. **Prisma 7** — Highest risk, save for last

## General Upgrade Process

```bash
# 1. Create upgrade branch
git checkout dev && git pull
git checkout -b upgrade/<package-name>

# 2. Update the package
npm install <package>@latest --workspace=apps/api  # or apps/web

# 3. Build
npm run build

# 4. Test
npm run test

# 5. Verify deployment
npm run restart
curl http://localhost:4321/health
curl -sI http://localhost:1234/login

# 6. Push and merge
git add -A && git commit -m "chore: upgrade <package> to <version>"
git push origin upgrade/<package-name>
```
