# Plugin System (Monitor Checks)

PulseDock supports monitor check plugins for extending built-in monitor logic.

## Current capabilities

- Plugins are registered server-side in `apps/api/src/checks/`
- Each plugin declares:
  - `id`
  - `displayName`
  - `description`
  - `supportedMonitorTypes`
  - `configFields`
- Runtime execution is isolated with `executePluginSafely()`:
  - timeout protection
  - output sanitization
  - failure fallback to a safe monitor result

## Configure in UI

On **Monitors → New/Edit Monitor**:

1. Pick monitor type.
2. Pick **Check Plugin** (or leave default built-in logic).
3. Fill plugin config fields (example: `HTTP Response Matcher` requires `expectedText`).

Plugin config is stored in monitor `config` (e.g. `pluginId`, `expectedText`).

## Community plugin packaging (recommended flow)

For external/community contributions, use this process:

1. **Create plugin module** in `apps/api/src/checks/plugins/<plugin-id>.plugin.ts`.
2. **Export strongly typed plugin object** (`MonitorCheckPlugin`).
3. **Register plugin** in `ChecksService` constructor.
4. **Add sandbox tests** in `plugin.sandbox.spec.ts` for:
   - success path
   - timeout path
   - invalid output path
5. **Document config fields** via `configFields` so the Web UI can render forms.

## Verification checklist before merge

- [ ] Plugin ID is unique and stable.
- [ ] `supportedMonitorTypes` is correct.
- [ ] No secrets are emitted in plugin messages.
- [ ] Plugin fails closed (`ok: false`) on errors/timeouts.
- [ ] Unit tests added/updated.
- [ ] Manual UI test: create monitor with plugin and trigger run.

## Security notes

- Do **not** execute untrusted remote code at runtime.
- Keep plugins reviewed and version-controlled in-repo.
- Prefer deterministic plugin behavior and explicit timeouts.
