# Contributing to PulseDock

Thanks for contributing to PulseDock, an open-source version-intelligence and uptime-monitoring tool.

## Development workflow

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- Git, `gh`, and `rg`

Start from the integration branch and create a focused author branch:

```bash
git fetch origin
git switch --create feat/<slug> origin/dev
# or: git switch --create fix/<slug> origin/dev
```

Use `feat/<slug>` for features and `fix/<slug>` for bug fixes. Never work on `main`, `dev`, or `heartbeat/*`.
Always commit from the repository root (`projects/PulseDock`). Keep changes sliced and reviewable.

Run PulseDock services through Docker. Start dependencies with the repository's compose setup:

```bash
docker compose up -d postgres redis
```

Run API/Web as containers when needed. Publish ports only for an explicitly requested browser review; do not start `npm run api` or `npm run web` directly in the agent shell because those processes do not survive gateway restarts.

Run only the affected tests locally in a Docker container. The full suite is run by CI. Do not use real credentials, production data, or API keys in local or review environments.

## Commits and pull requests

Use Conventional Commits, for example:

```text
feat: add discord webhook notifications
fix: handle null currentVersion in version check
refactor: extract token refresh logic
docs: update deployment guide
test: cover monitor export
chore: update dependencies
```

Before opening a PR, run the relevant affected tests and build checks. Push the branch and open a PR targeting `dev`:

```bash
git push --set-upstream origin feat/<slug>
gh pr create --base dev --fill
```

Then stop. Authors never merge, push to `main`, or open PRs targeting `main`. Describe what changed, why, validation performed, and any known limitations. The integrator reviews and merges PRs into `dev` after required CI checks pass. Changes involving auth, billing, or database migrations require Noah's approval before merge.

## Integrator and releases

The integrator follows `RELEASE_RUNBOOK.md`:

1. Inventory branches and open PRs with `git fetch --all --prune` and `gh pr list --state open`.
2. Open PRs to `dev` for branches that have no PR.
3. Have a reviewer check correctness, tests, secrets, migrations, API compatibility, and repository boundaries.
4. Merge to `dev` only after the reviewer approves and required checks pass.
5. When `dev` is ready, open a release PR from `dev` to `main` with the semver-based changelog.

No one except Noah merges the release PR to `main`. After Noah merges it, the integrator creates the GitHub release and opens the follow-up version bump PR to `dev`.

## Quality and security

- TypeScript strict mode; avoid `any` and debugging `console.log` calls.
- Add or update tests for changed behavior.
- API inputs use validated DTOs and documented responses.
- Run build, relevant tests, typechecks, lint, and security checks appropriate to the change.
- Never commit secrets, credentials, production data, generated workspace material, or gitlinks.

## Project setup

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm ci
npx prisma generate --schema=apps/api/prisma/schema.prisma
```

See the guides in `docs/`, including `GETTING-STARTED.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, `SECURITY.md`, and `E2E.md`. API defaults to port 4321 and Web to port 1234.

## Reporting issues

Open a GitHub issue with the PulseDock version, reproduction steps, expected behavior, actual behavior, and relevant sanitized logs. Report security vulnerabilities privately according to `docs/SECURITY.md`; do not publish exploit details in an issue.

## License

By contributing, you agree that contributions are licensed under the MIT License.
