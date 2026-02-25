# GitLab Workflow (default)

1. Work on feature branch: `feature/<topic>`
2. Keep commits focused and descriptive
3. Open Merge Request into `main`
4. CI in `.gitlab-ci.yml` must pass
5. Squash-merge MR into `main`
6. Tag releases as `vX.Y.Z`

## Rules
- Never commit secrets/tokens/keys
- Keep `main` always deployable
- Update docs when behavior changes
