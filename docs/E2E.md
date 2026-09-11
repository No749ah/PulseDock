# E2E Tests (Playwright)

PulseDock ships a Playwright-based end-to-end test suite in `packages/e2e/`. Tests run against a live app instance — no local web server is started by Playwright.

## Prerequisites

- Node.js 18+
- A running PulseDock instance (default: `https://oc-dev-test.no749ah.com`)
- A valid user account in that instance
- Playwright system dependencies (see below)

## Install

```bash
# From repo root
npm install

# Install Playwright browser binaries
cd packages/e2e
npx playwright install chromium
npx playwright install-deps chromium   # installs OS packages — requires root/sudo
```

On Ubuntu/Debian:
```bash
sudo npx playwright install-deps chromium
```

In GitHub Actions, use the [official Playwright action](https://playwright.dev/docs/ci#github-actions):
```yaml
- uses: microsoft/playwright-github-action@v1
```
or simply install deps with:
```yaml
- run: npx playwright install --with-deps chromium
  working-directory: packages/e2e
```

## Running Tests

```bash
# All E2E tests (from repo root)
npm run test:e2e

# From packages/e2e directly
cd packages/e2e
npx playwright test

# Headed (visible browser — useful for debugging)
npx playwright test --headed

# Single file
npx playwright test tests/landing.spec.ts

# Debug mode (step through)
npx playwright test --debug
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `https://oc-dev-test.no749ah.com` | App instance to test against |
| `E2E_EMAIL` | `admin@example.com` | User account email for authenticated tests |
| `E2E_PASSWORD` | `admin123` | User account password |

Example:
```bash
BASE_URL=https://your-instance.com E2E_EMAIL=you@example.com E2E_PASSWORD=secret npx playwright test
```

## Test Structure

```
packages/e2e/
├── playwright.config.ts       # Playwright config (baseURL, timeout, projects)
├── fixtures/
│   └── auth.ts               # `loggedIn` fixture — handles auth state reuse
└── tests/
    ├── landing.spec.ts        # Public pages (landing, login form, 404)
    ├── auth.spec.ts           # Login flows (valid/invalid credentials, redirect)
    ├── dashboard.spec.ts      # Dashboard (load, nav, no JS errors)
    └── monitors.spec.ts       # Monitor CRUD (list, create, delete)
```

### Auth Fixture

Tests that require a logged-in session use the `loggedIn` fixture from `fixtures/auth.ts`:

```typescript
import { test, expect } from "../fixtures/auth";

test("my test", async ({ loggedIn: page }) => {
  await page.goto("/dashboard");
  // page is already authenticated
});
```

The fixture saves storage state to `.auth/user.json` after first login and reuses it for subsequent tests, saving login round-trips.

## CI/CD

Add to `.github/workflows/e2e.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [dev]
  pull_request:
    branches: [dev, main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
        working-directory: packages/e2e
      - run: npm run test:e2e
        env:
          BASE_URL: ${{ secrets.E2E_BASE_URL }}
          E2E_EMAIL: ${{ secrets.E2E_EMAIL }}
          E2E_PASSWORD: ${{ secrets.E2E_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: packages/e2e/playwright-report/
          retention-days: 7
```

## Artifacts

On failure, Playwright saves:
- **Screenshots** → `packages/e2e/test-results/`
- **Videos** → `packages/e2e/test-results/` (on first retry)
- **Traces** → `packages/e2e/test-results/` (viewable with `npx playwright show-trace <path>`)
- **HTML report** → `packages/e2e/playwright-report/` (open with `npm run report`)

## Notes

- Tests are designed to be idempotent — the monitor CRUD test cleans up after itself
- The `monitors.spec.ts` "delete" test gracefully skips if the monitor wasn't created
- `ResizeObserver` errors are filtered from the JS error check (browser quirk, not a real error)
- Tests target `chromium` only. Add `firefox` or `webkit` to `playwright.config.ts` projects if needed
