# Git Flow for PulseDock

This is the release workflow to use from now on.

## Branch model

- `main` = production-ready code only
- `develop` = integration branch for upcoming release
- `feature/<topic>` = new features
- `fix/<topic>` = non-urgent fixes
- `hotfix/<topic>` = urgent production fixes (branch from `main`)
- `release/vX.Y.Z` = release hardening branch

## Daily flow

1. Branch from `develop`:
   - `git checkout develop && git pull`
   - `git checkout -b feature/<topic>`
2. Implement + commit in small logical commits
3. Open MR/PR into `develop`
4. CI must pass before merge

## Release flow

1. Create release branch from `develop`:
   - `git checkout develop && git pull`
   - `git checkout -b release/vX.Y.Z`
2. Bump versions (`package.json`, `apps/api/package.json`, `apps/web/package.json`)
3. Final QA + docs/changelog
4. Merge `release/vX.Y.Z` into `main`
5. Tag release on `main`:
   - `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
   - `git push origin vX.Y.Z`
6. Merge `main` back into `develop`

## Hotfix flow

1. Branch from `main`: `hotfix/<topic>`
2. Fix + test
3. Merge into `main`
4. Tag patch release `vX.Y.Z+1`
5. Merge `main` back into `develop`

## Versioning policy (SemVer)

- `MAJOR`: breaking changes
- `MINOR`: backward-compatible features
- `PATCH`: backward-compatible fixes

## Release checklist

- [ ] CI green
- [ ] API docs (Swagger) reviewed
- [ ] README/START/RUN updated
- [ ] DB migration impact checked
- [ ] Tag created and pushed
- [ ] Release notes published
