# @pulsedock/cli

Command-line tool for PulseDock. Run one-shot HTTP checks and interact with your PulseDock instance from the terminal.

## Installation

```bash
# From the PulseDock monorepo
cd packages/cli
npm install
npm run build

# Link globally
npm link
```

## Commands

### `pulsedock check <url>`

One-shot HTTP health check — no PulseDock instance required.

```bash
pulsedock check https://api.example.com
pulsedock check https://api.example.com/health --timeout 5000 --expected-status 200
```

Options:
- `--timeout <ms>` — Request timeout (default: 10000)
- `--expected-status <code>` — Expected HTTP status code
- `--body-contains <string>` — Assert response body contains string
- `--json` — Output as JSON

### `pulsedock monitors list`

List all monitors from your PulseDock instance.

```bash
pulsedock monitors list
pulsedock monitors list --filter "api"
```

### `pulsedock monitors check <id>`

Trigger an immediate check on a monitor.

```bash
pulsedock monitors check mon_abc123
```

### `pulsedock config`

Manage CLI configuration (base URL + API key).

```bash
pulsedock config set url https://your-pulsedock.example.com
pulsedock config set key pd_live_your_api_key
pulsedock config show
```

## Configuration

Config stored in `~/.pulsedock/config.json`:

```json
{
  "url": "https://your-pulsedock.example.com",
  "apiKey": "pd_live_your_api_key"
}
```

Or via environment variables:
```bash
export PULSEDOCK_URL=https://your-pulsedock.example.com
export PULSEDOCK_API_KEY=pd_live_your_api_key
```

## Development

```bash
# Build
npm run build

# Test
npm run test

# Watch mode
npm run dev
```

## Tests

10 unit tests covering config loading, HTTP utilities, and command logic.

```bash
npm run test
```
