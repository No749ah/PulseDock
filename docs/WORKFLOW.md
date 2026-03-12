# Development Workflow

Complete guide to the daily development cycle and heartbeat process.

---

## Daily Cycle (Per Heartbeat)

A "heartbeat" happens **at least hourly**, with **branch management twice daily**.

### Step 1: Health Check (5 min)

```bash
cd projects/PulseDock

# Pull latest from dev
git pull origin dev

# Build both apps
npm run build

# Check for vulnerabilities
npm audit

# (Test when available)
npm run test || echo "No test script yet"
```

**If broken:**
- Fix immediately
- Commit with `fix:` prefix
- Push to heartbeat branch
- Restart services
- Re-test

### Step 2: Work on BACKLOG (main task)

Open `BACKLOG.md`:

```bash
# Read the backlog
cat BACKLOG.md | head -30
```

- Find the top item in "In Progress" or first item in "Next Up"
- **Move it to "In Progress"**
- Implement the feature/fix
- Write code + tests + docs
- **Don't commit yet**

### Step 3: Verify Build

```bash
npm run build

# If it fails, fix immediately
# Do NOT push broken code
```

### Step 4: Commit

Use **conventional commits**:

```bash
git add .

git commit -m "feat: add new feature"
# or
git commit -m "fix: resolve issue X"
# or
git commit -m "refactor: improve code quality"
# or
git commit -m "docs: update README"
# or
git commit -m "test: add unit tests for auth"
# or
git commit -m "chore: update dependencies"
```

**Examples:**
```bash
git commit -m "feat: migrate account page to Tailwind CSS

- Rewrite account settings page with Tailwind components
- Add profile section (update email)
- Add security section (change password)
- Add sessions section (view and revoke active sessions)"

git commit -m "fix: correct API proxy port from 4001 to 4321

- Frontend was incorrectly proxying /api to port 4001
- Fixed to proxy to port 4321 where API runs"
```

### Step 5: Push to Heartbeat Branch

```bash
git push origin heartbeat/YYYY-MM-DD-description
```

**Never push directly to `dev` or `main`.**

### Step 6: Restart Services

```bash
npm run restart

# This:
# 1. Kills API + Web processes
# 2. Restarts API (port 4321)
# 3. Waits 2 seconds
# 4. Restarts Web (port 1234)
```

### Step 7: Test After Restart

**Health Checks:**
```bash
# API is healthy
curl http://localhost:4321/health
# Expected: {"ok":true,"service":"pulsedock-api"...}

# Web is running
curl -I http://localhost:1234/login
# Expected: HTTP/1.1 200 OK

# API proxy works
curl http://localhost:1234/api/v1/monitors \
  -H "Authorization: Bearer invalid" | head -1
# Expected: {"ok":false,"error":{"code":"UNAUTHORIZED"...}
```

**Browser Test:**
```bash
# Via reverse proxy
curl https://oc-dev-test.no749ah.com/login -I | head -1
# Expected: HTTP/1.1 200 OK

# Via direct API
curl https://oc-dev-test.no749ah.com/api/health | head -1
# Expected: {"ok":true...}
```

**If tests fail:**
- Fix the issue immediately
- Restart services again
- Re-test
- Don't mark work as "done" until green

### Step 8: Update BACKLOG

Move the completed item:

```bash
# Open BACKLOG.md
# Move the item from "In Progress" to "Done"
# Update any status notes
git add BACKLOG.md
git commit -m "chore: update BACKLOG — [feature] complete"
git push origin heartbeat/YYYY-MM-DD-description
```

---

## Branch Management (Twice Daily: ~12:00 & ~00:00 UTC)

### Merge to `dev`

```bash
cd projects/PulseDock

# Switch to dev
git checkout dev
git pull origin dev

# Merge the heartbeat branch (no fast-forward)
git merge --no-ff heartbeat/YYYY-MM-DD-description \
  -m "chore: merge heartbeat/YYYY-MM-DD-description → dev"

# Push to dev
git push origin dev
```

### Delete Old Branch

```bash
# Local
git branch -d heartbeat/YYYY-MM-DD-description

# Remote
git push origin --delete heartbeat/YYYY-MM-DD-description
```

### Create New Heartbeat Branch

```bash
# Create from dev
git checkout -b heartbeat/YYYY-MM-DD-new-description

# Push
git push origin heartbeat/YYYY-MM-DD-new-description
```

---

## Branching Strategy

```
main (stable releases only)
  ↓
  └── dev (integration branch, always releasable)
        ↓
        └── heartbeat/2026-03-12-feature (working branch)
              ↓ (merge back to dev after work)
              └── deleted after merge
```

**Rules:**
- `main` → tag releases only, never direct commits
- `dev` → merge from heartbeat branches 2x daily
- `heartbeat/*` → your working branch, delete after merge

---

## Common Scenarios

### Adding a Feature

```bash
# 1. Health check + pull
npm run build && git pull origin dev

# 2. Edit code
vim apps/api/src/monitors/monitors.controller.ts

# 3. Write tests
vim apps/api/src/monitors/monitors.service.spec.ts

# 4. Build + test
npm run build && npm run test

# 5. Commit
git commit -m "feat: add monitor filtering by type"

# 6. Restart + test
npm run restart
curl http://localhost:4321/v1/monitors?type=HTTP

# 7. Push
git push origin heartbeat/2026-03-12-monitoring

# 8. Update backlog
git commit -m "chore: update BACKLOG" && git push
```

### Fixing a Bug

```bash
# 1. Identify issue in running app
# (via logs, error reports, browser console)

# 2. Create minimal test case
npm run test -- --grep "failing scenario"

# 3. Fix code
vim apps/api/src/common/logger.ts

# 4. Verify test passes
npm run test -- --grep "failing scenario"

# 5. Build + test end-to-end
npm run build && npm run restart

# 6. Manual verification
curl http://localhost:1234/api/v1/monitors

# 7. Commit
git commit -m "fix: resolve logger context propagation"

# 8. Push
git push origin heartbeat/...
```

### Security/Dependency Update

```bash
# 1. Check for vulnerabilities
npm audit

# 2. Fix automatically where possible
npm audit fix

# 3. Manual review of changes
git diff package.json

# 4. Build + test
npm run build && npm run test

# 5. Commit
git commit -m "chore: update dependencies (fix 2 vulns)"

# 6. Restart + verify
npm run restart

# 7. Push
git push origin heartbeat/...
```

---

## When Tests Fail

**Don't skip failing tests.**

1. **Understand the failure**
   ```bash
   npm run test -- --grep "failing test name"
   ```

2. **Fix the code**
   - Either the test is wrong (fix test)
   - Or the code is wrong (fix code)
   - Usually it's the code

3. **Re-run until green**
   ```bash
   npm run test -- --grep "..."
   ```

4. **Only then commit**
   ```bash
   git commit -m "test: fix auth service test"
   ```

---

## Tips & Tricks

### Quick Restart + Test

```bash
npm run restart && sleep 3 && \
  curl http://localhost:4321/health && \
  curl -I http://localhost:1234/login
```

### Check What You've Changed

```bash
git status          # What files changed?
git diff            # What lines changed?
git diff --staged   # What's staged for commit?
```

### Revert Last Commit (not pushed)

```bash
git reset HEAD~1    # Undo last commit, keep changes
git reset --hard HEAD~1  # Undo + discard changes
```

### View Heartbeat Branch History

```bash
git log origin/heartbeat/2026-03-12-... --oneline -10
```

---

## Rules to Remember

- ✅ **Always** build + test before committing
- ✅ **Always** restart services after code changes
- ✅ **Always** test locally (health checks) before declaring done
- ✅ **Always** use heartbeat branches (never direct to dev/main)
- ✅ **Always** use conventional commit messages

- ❌ **Never** commit broken builds
- ❌ **Never** push to `dev` or `main` directly
- ❌ **Never** merge without testing locally first
- ❌ **Never** skip failing tests
- ❌ **Never** leave TODO comments; just do the thing

---

See also:
- [GITFLOW.md](./GITFLOW.md) — Detailed git strategy
- [START.md](./START.md) — Initial setup
- [HEARTBEAT.md](../HEARTBEAT.md) — Heartbeat checklist
