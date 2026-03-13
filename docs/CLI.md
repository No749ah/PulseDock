# PulseDock CLI

The PulseDock CLI (`pulsedock`) is a developer tool for one-shot HTTP checks and monitor management via the PulseDock API.

## Installation

```bash
# From the repo root (after build)
npm run build -w @pulsedock/cli

# Link globally for easy access
npm link --workspace @pulsedock/cli
```

## Commands

### `pulsedock check <url>`

Perform a one-shot HTTP check against any URL — no API key required.

```bash
# Basic check
pulsedock check https://example.com

# Custom method + timeout
pulsedock check https://api.example.com/health --method GET --timeout 5000

# Expect specific status code (exit 1 if mismatch)
pulsedock check https://example.com --expect 200

# Custom request headers
pulsedock check https://api.example.com -H "Authorization: Bearer mytoken" -H "X-Custom: value"

# JSON output (machine-readable)
pulsedock check https://example.com --json

# Don't follow redirects
pulsedock check https://example.com --no-follow
```

**Exit codes:**
- `0` — HTTP check succeeded (2xx status)
- `1` — HTTP error, connection failure, or `--expect` mismatch

**Example output:**

```
  URL        https://example.com
  Status     200 OK
  Duration   142ms
  Size       1.2KB
  Type       text/html; charset=UTF-8
```

### `pulsedock monitors list`

List all monitors from your PulseDock instance (requires API credentials).

```bash
# With credentials from config
pulsedock monitors list

# With explicit credentials
pulsedock monitors list --api-url https://api.example.com --api-key pd_key_xxx

# Pagination
pulsedock monitors list --page 2 --limit 50

# JSON output
pulsedock monitors list --json
```

### `pulsedock monitors check <monitorId>`

Trigger an immediate check for a specific monitor.

```bash
pulsedock monitors check <monitorId>
pulsedock monitors check <monitorId> --json
```

### `pulsedock config set`

Save API credentials so you don't have to pass flags every time.

```bash
pulsedock config set --api-url https://api.example.com --api-key pd_key_xxx

# Set default output format
pulsedock config set --format json
```

### `pulsedock config get`

Show current configuration (API key is redacted).

```bash
pulsedock config get
pulsedock config get --json
```

### `pulsedock config unset <key>`

Remove a configuration value.

```bash
pulsedock config unset apiKey
pulsedock config unset apiUrl
pulsedock config unset format
```

## Configuration File

Credentials are stored in `~/.pulsedock/config.json`:

```json
{
  "apiUrl": "https://api.example.com",
  "apiKey": "pd_key_xxx",
  "defaultFormat": "pretty"
}
```

## CI / Scripting

The CLI is designed for shell scripting and CI pipelines:

```bash
# Health check with exit code (good for CI)
pulsedock check https://api.example.com/health --expect 200

# JSON output piped to jq
pulsedock check https://example.com --json | jq '.durationMs'

# Check multiple URLs in a loop
for url in https://api.example.com/health https://example.com; do
  pulsedock check "$url" --expect 200 && echo "$url OK" || echo "$url FAILED"
done
```
