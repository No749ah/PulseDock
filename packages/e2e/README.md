# @pulsedock/e2e

End-to-end tests for PulseDock using Playwright.

## What's Tested

- **Landing page** — Renders correctly, navigation links work
- **Auth flows** — Register, login, logout, redirect behaviour
- **Dashboard** — Loads with correct stats after login
- **Monitors** — Create, view, delete monitors

## Running Tests

```bash
# From repo root (requires running API + Web)
npm run test:e2e

# From this package directly
cd packages/e2e
npx playwright test

# Run a specific test file
npx playwright test tests/auth.spec.ts

# Run with UI mode (interactive)
npx playwright test --ui
```

## Prerequisites

The API and web frontend must be running:

```bash
# From repo root
npm run dev:api &
npm run dev:web &
```

Or use Docker Compose:

```bash
docker compose up -d
```

## Configuration

`playwright.config.ts` sets:
- Base URL: `http://localhost:1234`
- Storage state for auth fixture (reuses logged-in session)
- Artifacts: screenshots, videos on failure

## Auth Fixture

`fixtures/auth.ts` handles the `loggedIn` fixture — logs in once and stores session state so subsequent tests skip the login flow.

## CI/CD

Tests run in GitHub Actions on push/PR (`.github/workflows/e2e.yml`). Artifacts (screenshots, reports) are uploaded on failure.

See [docs/E2E.md](../../docs/E2E.md) for full documentation.
