# Git Flow Strategy

PulseDock uses a simple, effective branching strategy optimized for continuous development.

---

## Branch Structure

```
main (production releases)
 ↑
 └── release pull requests only
      ↓
     dev (integration, always deployable)
      ↑
      └── heartbeat/YYYY-MM-DD-description (working branch)
           ↓ merge 2x daily
```

---

## Branch Rules

### `main`
- **Purpose:** Production releases only
- **Protection:** No direct commits; PR-only
- **Triggers:** Release tags (v1.0.0, v1.0.1, etc.)
- **Stability:** Always stable, always deployable
- **Frequency:** Deploy when `dev` is tested and ready

### `dev`
- **Purpose:** Integration branch, daily merge point
- **Source:** Merges from `heartbeat/*` branches
- **Frequency:** 2 merges daily (~12:00 and ~00:00 UTC)
- **Stability:** Should always compile and pass tests
- **Deploy:** Yes, to staging/dev environments

### `heartbeat/YYYY-MM-DD-*`
- **Purpose:** Your working branch
- **Naming:** `heartbeat/2026-03-12-refactor-auth` or `heartbeat/2026-03-12-monitoring`
- **Created from:** `dev` (fresh each heartbeat)
- **Lifespan:** 1–24 hours (until merged back to `dev`)
- **Delete after:** Merge to `dev`

---

## Workflow

### Create Your Heartbeat Branch

```bash
git checkout dev
git pull origin dev
git checkout -b heartbeat/2026-03-12-feature-name
git push origin heartbeat/2026-03-12-feature-name
```

### Make Commits

```bash
# Work, test, commit
git add .
git commit -m "feat: add feature"

# Push to your branch
git push origin heartbeat/2026-03-12-feature-name
```

### Merge to `dev` (Twice Daily)

```bash
# Switch to dev
git checkout dev
git pull origin dev

# Merge with --no-ff (creates merge commit)
git merge --no-ff heartbeat/2026-03-12-feature-name \
  -m "chore: merge heartbeat/2026-03-12-feature-name → dev

- Added feature X
- Added unit tests
- Updated BACKLOG.md"

# Push dev
git push origin dev

# Delete heartbeat branch
git branch -d heartbeat/2026-03-12-feature-name
git push origin --delete heartbeat/2026-03-12-feature-name
```

### Release to Production

When `dev` is tested + stable:

```bash
git checkout main
git pull origin main
git merge --no-ff dev -m "chore: release v1.1.0"
git tag -a v1.1.0 -m "Version 1.1.0 — [description]"
git push origin main
git push origin v1.1.0

# Update dev after release (if main has any hotfixes)
git checkout dev
git pull origin main
git push origin dev
```

---

## Commit Message Format

Use **conventional commits** for clarity and automation:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code reorganization (no feature/bug change)
- `docs:` — Documentation only
- `test:` — Tests only
- `chore:` — Dependency updates, config, CI/CD
- `perf:` — Performance improvement
- `style:` — Code style (whitespace, semicolons, etc.)

### Scope (Optional)

Which part of the code:
- `auth:` — Authentication service
- `monitors:` — Monitor CRUD
- `alerts:` — Alert system
- `web:` — Frontend
- `api:` — Backend

### Examples

```bash
git commit -m "feat(auth): add password reset flow

- Create RequestResetDto, ResetPasswordDto
- Add POST /v1/auth/request-password-reset endpoint
- Add POST /v1/auth/reset-password endpoint
- Send email with reset link via SMTP
- Add tests for both endpoints"

git commit -m "fix(monitors): resolve race condition in health checks

- Lock monitor records during concurrent checks
- Add unique constraint on (userId, target)
- Add regression test"

git commit -m "refactor(web): extract Tailwind components to separate files

- Create Card, Badge, Button, Table components
- Update all pages to use new components
- Reduce landing page by 300 lines"

git commit -m "docs: add API.md endpoint documentation"

git commit -m "test(auth): add unit tests for JWT service

- Test token generation + validation
- Test refresh token flow
- Test revocation"

git commit -m "chore: update dependencies

- Update Next.js 16.0 → 16.1.6
- Update NestJS 11.0 → 11.1.6
- Fix 2 critical vulnerabilities via npm audit fix"

git commit -m "chore: update BACKLOG.md — feature X complete"
```

---

## Protecting Branches

Set branch protection rules on GitHub:

**For `main`:**
```
✓ Require pull request reviews before merging (1 approver)
✓ Require status checks to pass before merging
✓ Require branches to be up to date before merging
✓ Restrict who can push to matching branches
```

**For `dev`:**
```
✓ Require status checks to pass before merging
✓ Require branches to be up to date before merging
```

**For `heartbeat/*`:**
```
No protection (working branches)
```

---

## Keeping Branches Synced

### Pull Latest from `dev`

When `dev` has new commits:

```bash
git fetch origin
git rebase origin/dev

# Or merge (if you prefer merge commits)
git merge origin/dev
```

### Never Force Push to Shared Branches

```bash
# ❌ BAD — overwrites history
git push origin --force

# ✅ GOOD — safe, creates merge commit if needed
git push origin
```

---

## Common Scenarios

### Starting a New Heartbeat

```bash
# At merge time
git checkout dev
git pull origin dev
git checkout -b heartbeat/2026-03-13-new-feature
git push origin heartbeat/2026-03-13-new-feature
```

### Reviewing Changes Before Merge

```bash
# See what you've done
git log dev..HEAD --oneline

# See the diff
git diff dev...HEAD

# See commits with details
git log dev..HEAD --stat
```

### Recovering from Mistake

```bash
# Last commit is wrong? Undo (keep changes)
git reset --soft HEAD~1

# Discard commit + changes
git reset --hard HEAD~1

# Need to recover a deleted commit?
git reflog  # Find the commit hash
git checkout <hash>  # Recover it
```

### Syncing Local After Remote Delete

```bash
# Remote branch was deleted, local still exists
git fetch --prune origin

# Clean up local references
git branch -d heartbeat/2026-03-12-old-branch
```

---

## CI/CD Integration

When PR is opened/pushed:
1. Run `npm run build` — must pass
2. Run `npm run test` — must pass (when available)
3. Run `npm audit` — must have 0 high-severity vulnerabilities
4. Update status checks on GitHub

The branch can only be merged once all checks pass.

---

## Release Process

```
heartbeat/2026-03-12-* (feature branch)
          ↓ merge (2x daily)
        dev (integration, staging deployment)
          ↓ test (1–2 days)
        main (release, production deployment)
          ↓ tag
      v1.1.0 (release tag)
```

**Release frequency:** As needed (usually 1–2 weeks)
**Hotfixes:** Emergency releases directly from `main`, then merge back to `dev`

---

## References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository)
- [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/) (not used here, but good reference)

---

See also:
- [WORKFLOW.md](./WORKFLOW.md) — Daily development
- [START.md](./START.md) — Initial setup
