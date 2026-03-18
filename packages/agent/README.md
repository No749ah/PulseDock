# @pulsedock/agent

Lightweight local agent that reports tool versions directly from your infrastructure to a PulseDock instance. Run it on any server to report versions of locally-installed tools without external API calls.

## Quick Start

### Docker Run

```bash
docker run -d \
  --name pulsedock-agent \
  -e PULSEDOCK_URL=https://your-pulsedock.example.com \
  -e PULSEDOCK_API_KEY=pd_live_your_api_key \
  -e AGENT_TOOL_IDS=docker,postgresql,nginx \
  pulsedock/agent:latest
```

### Docker Compose

```yaml
services:
  pulsedock-agent:
    image: pulsedock/agent:latest
    environment:
      PULSEDOCK_URL: https://your-pulsedock.example.com
      PULSEDOCK_API_KEY: pd_live_your_api_key
      AGENT_TOOL_IDS: docker,postgresql,nginx,redis
      REPORT_INTERVAL: 300  # seconds
    restart: unless-stopped
```

### Shell Script (one-shot)

```bash
curl -sSL https://your-pulsedock.example.com/agent.sh | \
  PULSEDOCK_URL=https://your-pulsedock.example.com \
  PULSEDOCK_API_KEY=pd_live_your_api_key \
  AGENT_TOOL_IDS=docker,nginx bash
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PULSEDOCK_URL` | ✅ | — | Your PulseDock instance URL |
| `PULSEDOCK_API_KEY` | ✅ | — | API key from /account#api-keys |
| `AGENT_TOOL_IDS` | — | all | Comma-separated tool IDs to report |
| `REPORT_INTERVAL` | — | `300` | Seconds between reports |
| `LOG_LEVEL` | — | `info` | `debug` \| `info` \| `warn` \| `error` |

## Built-in Tool Checks

The agent includes built-in shell checks for 16+ tools:

| Tool ID | Command | Notes |
|---------|---------|-------|
| `docker` | `docker version` | Docker Engine version |
| `postgresql` | `psql --version` | PostgreSQL server version |
| `mysql` | `mysql --version` | MySQL/MariaDB version |
| `redis` | `redis-server --version` | Redis version |
| `nginx` | `nginx -v` | nginx version |
| `proxmox` | `pveversion` | Proxmox VE version |
| `pfsense` | `php -r "require_once('config.inc'); echo $config['version'];"` | pfSense version |
| `openwrt` | `cat /etc/openwrt_release` | OpenWrt version |
| `traefik` | `traefik version` | Traefik version |
| `caddy` | `caddy version` | Caddy version |
| `node` | `node --version` | Node.js version |
| `python` | `python3 --version` | Python version |
| `go` | `go version` | Go version |
| `rust` | `rustc --version` | Rust version |
| `git` | `git --version` | Git version |
| `kernel` | `uname -r` | Linux kernel version |

## API Endpoints

The agent reports to:

```
POST /v1/agent/report
Authorization: X-API-Key: <key>

{
  "tools": [
    { "toolId": "docker", "version": "25.0.3", "rawOutput": "..." },
    { "toolId": "nginx", "version": "1.25.4", "rawOutput": "..." }
  ]
}
```

Check agent status:
```
GET /v1/agent/status
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm run test

# Run locally
node dist/index.js
```

## Tests

12 unit tests covering logger, check runners, and report formatting.

```bash
npm run test
```

## Security

- The agent runs read-only shell commands — it never modifies system state
- API key is only used for outbound HTTPS requests to your PulseDock instance
- Mount the socket or binary paths as read-only volumes in Docker
- Run as non-root user (`user: 1000:1000` in docker-compose)

## Custom Tool Checks

Extend the agent with custom checks by creating a config file:

```json
{
  "tools": [
    {
      "id": "my-app",
      "name": "My Application",
      "command": "my-app --version",
      "versionPattern": "v(\\d+\\.\\d+\\.\\d+)"
    }
  ]
}
```

Pass the config path via `AGENT_CONFIG=/path/to/config.json`.
