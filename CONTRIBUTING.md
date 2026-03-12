# Contributing to PulseDock

Thanks for your interest in contributing! PulseDock is an open-source version intelligence & uptime monitoring tool. Contributions of all kinds are welcome — bug fixes, new features, docs, tests.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for local services)
- Git

### Local Setup

```bash
# Clone the repo
git clone https://github.com/No749ah/PulseDock.git
cd PulseDock

# Copy env template
cp .env.example .env
# Edit .env with your local database/redis credentials

# Start PostgreSQL + Redis (Docker Compose)
docker compose -f docker-compose.services.yml up -d

# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev --schema=prisma/schema.prisma

# Start API + Web in dev mode
npm run dev
```

API runs at `http://localhost:4321`  
Web runs at `http://localhost:1234`  
Swagger docs at `http://localhost:4321/docs`

## Branching

| Branch | Purpose |
|---|---|
| `main` | Stable releases only |
| `dev` | Integration — all PRs target here |
| `feat/<name>` | New feature branches |
| `fix/<name>` | Bug fix branches |

Always branch from `dev`. Open PRs targeting `dev`.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add discord webhook notifications
fix: handle null currentVersion in version check
refactor: extract token refresh logic into helper
docs: update README setup instructions
test: add unit test for MonitorsService.runNow
chore: bump nestjs dependencies
```

## Code Standards

- **TypeScript strict mode** — no `any`, no implicit types
- **No `console.log`** — use the structured logger from `src/common/logger.ts`
- **Error handling** — catch at service boundaries, throw typed NestJS exceptions
- **Validation** — all API inputs must use class-validator DTOs
- **Tests** — unit tests required for new services; run `npm run test` before pushing
- **Lint** — `npm run lint` must pass
- **Build** — `npm run build` must succeed

## Testing

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Type-check only
npm run typecheck
```

Tests live in `*.spec.ts` files next to the code they test. We use [Vitest](https://vitest.dev/).

## Submitting a Pull Request

1. Fork the repo and create your branch from `dev`
2. Make your changes with conventional commits
3. Ensure `npm run build && npm run test && npm run lint` all pass
4. Open a PR to the `dev` branch
5. Describe what you changed and why
6. Link any related issues

## Reporting Bugs

Open a [GitHub Issue](https://github.com/No749ah/PulseDock/issues) with:

- PulseDock version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs or screenshots

## Feature Requests

Open an issue with the `enhancement` label. Describe the use case — what problem does it solve? How does it fit PulseDock's scope?

## Security

Found a vulnerability? **Do not open a public issue.** Email `noah.bourgnon@gmail.com` directly with details. We'll acknowledge within 48 hours.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
