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

## External Plugin Loading

PulseDock supports **user-installable external plugins** loaded from the filesystem at API startup.  
This allows you to add custom monitor check logic without modifying or recompiling the codebase.

### Setup

1. Set the `PLUGIN_DIR` environment variable to the directory containing your plugins:

   ```env
   PLUGIN_DIR=/opt/pulsedock/plugins
   ```

   Default: `./plugins` (relative to the API working directory).

2. Drop one or more `.plugin.js` files (CommonJS modules) into that directory.

3. Restart the API. External plugins are loaded once at startup and logged:

   ```
   [ChecksService] Loaded 2 external plugins from /opt/pulsedock/plugins
   ```

### Plugin file format

A plugin file must be a **CommonJS `.js` file** that exports a `MonitorCheckPlugin`-shaped object via `module.exports`:

```js
// my-status-check.plugin.js
module.exports = {
  id: 'my-status-check',
  displayName: 'My Status Check',
  description: 'Checks a custom JSON health endpoint.',
  supportedMonitorTypes: ['HTTP'],
  configFields: [
    { key: 'expectedField', label: 'Expected JSON field', type: 'text', required: true },
  ],
  run: async (ctx) => {
    const res = await fetch(ctx.monitor.target);
    if (!res.ok) {
      return { ok: false, statusCode: res.status, latencyMs: null, message: `HTTP ${res.status}`, level: 'red' };
    }
    const body = await res.json();
    const field = ctx.config.expectedField;
    if (!body[field]) {
      return { ok: false, statusCode: res.status, latencyMs: null, message: `Field "${field}" missing`, level: 'yellow' };
    }
    return { ok: true, statusCode: res.status, latencyMs: null, message: 'OK', level: 'green' };
  },
};
```

### Required plugin fields

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier (non-empty). Must not conflict with built-in plugin IDs. |
| `displayName` | `string` | Human-readable name shown in the UI. |
| `supportedMonitorTypes` | `string[]` | Non-empty array of monitor type strings (e.g. `['HTTP']`). |
| `run` | `function` | Async function `(context) => PluginExecutionResult`. |

Optional fields: `description` (string), `configFields` (array of field descriptors).

### Conflict resolution

If an external plugin's `id` matches a built-in plugin, the external plugin is **skipped** with a warning logged.  
Built-in plugins always take precedence.

### Security note

⚠️ **Only load plugins from trusted sources.**  
External plugins execute arbitrary JavaScript inside the API process with full Node.js access.  
Never load plugins from untrusted or user-supplied paths.

## Security notes

- Do **not** execute untrusted remote code at runtime.
- Keep plugins reviewed and version-controlled in-repo.
- Prefer deterministic plugin behavior and explicit timeouts.
