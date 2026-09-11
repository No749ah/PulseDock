# PulseDock Agent

The **PulseDock Agent** is a lightweight service that runs on your local network and reports tool version information back to your PulseDock instance. It solves the problem of monitoring tools that don't expose HTTP APIs externally — like pfSense, Unraid, Proxmox VE, OpenWRT routers, and other infrastructure tools.

## Why?

Many self-hosted tools (firewalls, hypervisors, NAS systems) can only be queried from the local network. PulseDock's cloud-hosted checks can't reach them. The agent bridges this gap:

1. Runs locally (on the tool's host, a nearby VM, or a Docker container on the same network)
2. Executes shell commands to read the local tool's version
3. Reports the version back to PulseDock via a secure, authenticated API call

## Quick Start (Docker)

```bash
docker run -d \
  --name pulsedock-agent \
  -e PULSEDOCK_URL=https://your-pulsedock-instance.com \
  -e PULSEDOCK_API_KEY=pdck_your_api_key_here \
  --restart unless-stopped \
  pulsedock/agent
```

### Docker Compose

```yaml
services:
  pulsedock-agent:
    image: pulsedock/agent
    container_name: pulsedock-agent
    restart: unless-stopped
    environment:
      PULSEDOCK_URL: https://your-pulsedock-instance.com
      PULSEDOCK_API_KEY: pdck_your_api_key_here
      AGENT_INTERVAL_SEC: "3600"  # Check every hour (default)
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PULSEDOCK_URL` | Yes | — | Base URL of your PulseDock instance |
| `PULSEDOCK_API_KEY` | Yes | — | API key (generated in PulseDock → Settings → API Keys) |
| `AGENT_CONFIG_FILE` | No | `/etc/pulsedock-agent/config.json` | Path to config file |
| `AGENT_INTERVAL_SEC` | No | `3600` | Check interval in seconds (minimum 60) |
| `HOSTNAME` | No | OS hostname | Hostname reported with each check |

## Config File Format

The config file is a JSON file with an array of checks:

```json
{
  "checks": [
    {
      "toolId": "proxmox-ve",
      "monitorId": "clxyz123...",
      "command": "curl -sk https://localhost:8006/api2/json/version | python3 -c \"import sys,json;d=json.load(sys.stdin);print(d['data']['version'])\""
    },
    {
      "toolId": "unraid"
    },
    {
      "toolId": "custom-app",
      "monitorId": "clabc456...",
      "command": "cat /opt/myapp/VERSION"
    }
  ]
}
```

### Fields

| Field | Required | Description |
|---|---|---|
| `toolId` | Yes | Tool ID from PulseDock's registry (or any string for custom tools) |
| `monitorId` | No | Specific monitor ID to update. If omitted, the agent matches by `toolId` in the monitor's config |
| `command` | No | Shell command to run. If omitted, uses built-in command for the tool |

## Built-in Checks

When no `command` is specified, the agent uses built-in commands for these tools:

| Tool ID | Command |
|---|---|
| `proxmox-ve` | Queries local Proxmox API at `https://localhost:8006` |
| `pfsense` | Reads version via PHP from `/etc/inc/functions.inc` |
| `opnsense` | Reads `/usr/local/opnsense/version/core` |
| `unraid` | Reads `/etc/unraid-version` |
| `openwrt` | Reads `/etc/openwrt_release` |
| `truenas-scale` | Uses `midclt call system.version` |
| `truenas-core` | Uses `freenas-version` |
| `vyos` | Reads `/opt/vyatta/etc/version` |
| `docker-engine` | Uses `docker version --format` |
| `postgresql` | Uses `psql --version` |
| `mysql` | Uses `mysql --version` |
| `mariadb` | Uses `mariadb --version` |
| `nginx` | Uses `nginx -v` |
| `apache` | Uses `apache2 -v` |
| `openssh` | Uses `ssh -V` |

## Custom Checks

You can monitor any tool by specifying a custom `command`:

```json
{
  "checks": [
    {
      "toolId": "my-custom-app",
      "monitorId": "cl...",
      "command": "cat /opt/myapp/VERSION"
    },
    {
      "toolId": "my-go-service",
      "monitorId": "cl...",
      "command": "curl -s http://localhost:8080/version | jq -r .version"
    }
  ]
}
```

The command should output a version string to stdout. The agent extracts semver-like patterns automatically.

## API Endpoints

The agent communicates with two API endpoints:

### `POST /v1/agent/report`

Reports a version for a tool/monitor.

```json
{
  "toolId": "proxmox-ve",
  "version": "8.1.3",
  "monitorId": "optional-monitor-id",
  "hostname": "pve-host-01"
}
```

### `GET /v1/agent/status`

Returns recent agent reports for the authenticated user's monitors.

Both endpoints require a Bearer token (API key) in the `Authorization` header.

## Security Considerations

- **API Key Scoping:** Each API key is tied to a specific user account. The agent can only update monitors belonging to that user.
- **Minimal Permissions:** The agent only needs network access to your PulseDock instance (outbound HTTPS).
- **No Inbound Ports:** The agent doesn't listen on any ports — it only makes outbound API calls.
- **Shell Command Safety:** Only commands defined in your config file or the built-in list are executed. The agent does not accept remote commands.
- **Key Rotation:** Rotate your API key periodically via PulseDock → Settings → API Keys.

## Logging

The agent outputs structured JSON logs to stdout/stderr:

```json
{"timestamp":"2026-03-16T12:00:00.000Z","level":"info","message":"Reported version","toolId":"proxmox-ve","version":"8.1.3"}
```

Log levels: `info`, `warn`, `error`.

## Running Without Docker

```bash
# Install
npm install -g @pulsedock/agent

# Set environment
export PULSEDOCK_URL=https://your-instance.com
export PULSEDOCK_API_KEY=pdck_your_key

# Run
pulsedock-agent
```

Or with a config file:

```bash
export AGENT_CONFIG_FILE=/path/to/config.json
pulsedock-agent
```
