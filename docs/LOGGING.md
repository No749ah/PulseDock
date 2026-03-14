# Logging & Log Rotation

PulseDock outputs structured JSON logs to **stdout**. Log rotation is handled at the infrastructure level — not inside the application.

---

## Log Format

Every log line is a single JSON object:

```json
{
  "timestamp": "2026-03-14T17:00:00.000Z",
  "level": "info",
  "message": "Monitor check completed",
  "service": "ChecksService",
  "userId": "clxyz...",
  "details": { "monitorId": "clxyz...", "status": "ok", "latencyMs": 142 }
}
```

**Log levels:** `debug` < `info` < `warn` < `error`

---

## Configuration

Set `LOG_LEVEL` in your `.env` file (or environment):

| Value   | What gets logged                          | Use for          |
|---------|-------------------------------------------|------------------|
| `debug` | Everything including verbose internals    | Development      |
| `info`  | Normal operations + warnings + errors     | **Default**      |
| `warn`  | Warnings and errors only                  | Low-noise prod   |
| `error` | Errors only                               | Minimal logging  |

---

## Docker Deployments (Recommended)

Log rotation is built into the Docker Compose files via the `json-file` log driver.

### Production limits (docker-compose.prod.yml)

| Service    | Max file size | Max files | Total max |
|------------|--------------|-----------|-----------|
| `api`      | 20 MB        | 5         | ~100 MB   |
| `web`      | 10 MB        | 5         | ~50 MB    |
| `postgres` | 10 MB        | 3         | ~30 MB    |

When a log file reaches `max-size`, Docker rotates it automatically. Once `max-file` files exist, the oldest is deleted.

### Viewing logs

```bash
# Follow API logs
docker compose -f docker-compose.prod.yml logs -f api

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100 api

# Since a timestamp
docker compose -f docker-compose.prod.yml logs --since="2026-03-14T12:00:00" api
```

### Log file location on host

```
/var/lib/docker/containers/<container-id>/<container-id>-json.log
```

---

## Non-Docker Deployments

### Option A: PM2 (recommended for bare-metal)

PM2 handles log rotation natively:

```bash
# Install PM2 and its log rotation module
npm install -g pm2
pm2 install pm2-logrotate

# Configure rotation (runs daily, keeps 30 days, 10MB max per file)
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD
pm2 set pm2-logrotate:rotateInterval "0 0 * * *"

# Start PulseDock API with PM2
pm2 start "node dist/main.js" \
  --name pulsedock-api \
  --log /var/log/pulsedock/api.log \
  --error /var/log/pulsedock/api-error.log

pm2 save
pm2 startup  # Enable on boot
```

### Option B: systemd + logrotate (traditional Linux)

Create a systemd service (`/etc/systemd/system/pulsedock-api.service`):

```ini
[Unit]
Description=PulseDock API
After=network.target postgresql.service

[Service]
Type=simple
User=pulsedock
WorkingDirectory=/opt/pulsedock
ExecStart=/usr/bin/node apps/api/dist/main.js
Restart=on-failure
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
Environment=LOG_LEVEL=info

[Install]
WantedBy=multi-user.target
```

Then add a logrotate config (`/etc/logrotate.d/pulsedock`):

```
/var/log/pulsedock/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 pulsedock pulsedock
    postrotate
        systemctl kill -s HUP pulsedock-api.service 2>/dev/null || true
    endscript
}
```

### Option C: Node.js file logging (advanced)

For deployments that require file output instead of stdout, install Winston with daily rotate:

```bash
cd apps/api
npm install winston winston-daily-rotate-file
```

Then update `apps/api/src/common/logger.ts` to add a `winston` transport when `LOG_TO_FILE=true` is set. The current logger writes to `process.stdout` only; file output is a drop-in addition.

---

## Log Aggregation (Production Scale)

For multi-instance or high-volume deployments, pipe stdout to a centralized log system:

| Tool          | How to connect                                                |
|---------------|---------------------------------------------------------------|
| **Loki**      | Use Promtail or `docker-compose` Loki log driver             |
| **Graylog**   | GELF log driver: `driver: gelf`, `options.gelf-address`      |
| **ELK Stack** | Filebeat sidecar or Logstash TCP input                        |
| **Datadog**   | Datadog agent with Docker log collection enabled             |
| **Seq**       | Seq ingest endpoint + stdout JSON forwarding                  |

All logs are valid JSON, making them compatible with any log aggregation tool out of the box.

---

## Disk Space Estimates

At typical load (100 monitors, check interval 60s):

| Scenario        | Log volume/day | Recommended rotation |
|-----------------|---------------|----------------------|
| Light load      | ~50 MB        | Daily, keep 7 days   |
| Medium load     | ~200 MB       | Daily, keep 14 days  |
| Heavy load      | ~1 GB         | Hourly, keep 3 days  |

Enable `LOG_LEVEL=warn` in production to reduce volume by ~70%.
