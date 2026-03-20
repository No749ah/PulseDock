# Grafana Datasource Integration

PulseDock ships a built-in **Grafana SimpleJSON datasource** plugin at `/v1/grafana`.  
This lets you query monitor metrics, uptime data, and incident annotations directly from Grafana dashboards — no extra plugin installs needed.

---

## Setup

### 1. Install the SimpleJSON Plugin

In your Grafana instance, install the **SimpleJSON** datasource plugin:

```bash
grafana-cli plugins install grafana-simple-json-datasource
```

Or use the Grafana JSON API datasource (native in Grafana 8+):  
`Settings → Data sources → Add → JSON API`

---

### 2. Configure the Datasource

| Field | Value |
|-------|-------|
| **URL** | `https://your-pulsedock.example.com/v1/grafana` |
| **Auth** | Add header `Authorization: Bearer <your-api-key>` |
| **Access** | Server |

Create an API key at: `Dashboard → Account → API Keys`  
Use scope `read` or higher.

### 3. Click "Test & Save"

Grafana calls `GET /v1/grafana` — PulseDock returns `200 OK`.

---

## Available Metrics

Metrics follow the pattern: `<monitor_name>.<metric>`

| Metric | Description |
|--------|-------------|
| `<name>.latency` | Response time in milliseconds over time |
| `<name>.status` | 1 = up, 0 = down per check |
| `<name>.uptime` | Daily uptime % (0–100) |
| `all_monitors.table` | Summary table: all monitors with uptime%, avg latency, check count |

**Examples:**
- `My_API.latency` — latency timeseries for monitor named "My API"
- `Production_DB.uptime` — daily uptime% for "Production DB"
- `all_monitors.table` — table panel with all monitor stats

> Monitor names are normalized: spaces → underscores. The lookup is case-insensitive.

---

## Grafana Panel Examples

### Latency Time Series Panel

```
Panel type: Time series
Query target: My_API.latency
```

### Uptime Percentage

```
Panel type: Stat
Query target: My_API.uptime
Calculation: Last
```

### All Monitors Overview Table

```
Panel type: Table
Query target: all_monitors.table
Type: table
```

### Status (Up/Down) Timeline

```
Panel type: State timeline
Query target: My_API.status
```

---

## Annotations (Incidents)

Add an annotation query to overlay incidents on any panel:

```
Annotation type: SimpleJSON / JSON
Query: POST /v1/grafana/annotations
```

Incidents appear as vertical markers with:
- **Title:** `Incident: <title>`
- **Tags:** `incident`, severity (e.g. `high`)
- **Time range:** `time` (created) → `timeEnd` (resolved, if resolved)

---

## Template Variables

Use tag-based filtering for dynamic dashboards:

| Key | Values |
|-----|--------|
| `monitor` | All monitor names for the authenticated user |
| `type` | HTTP, TCP, PING, DNS, SSL, HEARTBEAT, VERSION_CHECK |
| `status` | up, down, degraded, paused |

Configure in Grafana: `Dashboard Settings → Variables → Add → Query`  
Set query type to `Tag values` and key to `monitor`.

---

## Authentication

All endpoints except `GET /v1/grafana` (health) require a valid Bearer token:

```
Authorization: Bearer pd_xxxxxxxxxxxxxxxx
```

Unauthorized requests return `403 Forbidden`.

---

## Endpoint Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/grafana` | No | Health check — returns `200 OK` |
| `POST` | `/v1/grafana/search` | Yes | List available metric targets |
| `POST` | `/v1/grafana/query` | Yes | Fetch timeseries or table data |
| `POST` | `/v1/grafana/annotations` | Yes | Fetch incident annotations |
| `POST` | `/v1/grafana/tag-keys` | Yes | List variable tag keys |
| `POST` | `/v1/grafana/tag-values` | Yes | List values for a tag key |

Full API spec available at: `https://your-pulsedock.example.com/api/docs` (Swagger UI)
