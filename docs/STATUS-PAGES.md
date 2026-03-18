# Status Pages — PulseDock

Build beautiful, public-facing status pages with real-time data from your monitors. No login required for viewers.

## Quick Start

1. Go to **Status Pages** in the dashboard
2. Click **Create Page** — enter a title and slug (e.g. `my-company` → `/status/my-company`)
3. Open the editor, drag widgets onto the canvas
4. Configure each widget by clicking it
5. Click **Publish** → share your URL

```
https://your-domain.com/status/{slug}
```

## Editor

The drag-and-drop editor provides a full canvas layout system:

- **Drag** widgets from the left palette onto the canvas
- **Click** a widget to open its config panel on the right
- **Resize** by dragging the bottom-right corner handle
- **Duplicate** a widget with Ctrl+D or the copy button
- **Delete** with the trash button or the Delete key
- **Undo/Redo** with Ctrl+Z / Ctrl+Y (50-step history)
- **Search widgets** using the search box at the top of the palette
- Changes **auto-save** after 2 seconds of inactivity

### Grid System

- 12-column responsive grid
- Each row is 80px tall
- Widgets snap to grid while dragging and resizing
- Public page renders the same grid layout (12-col desktop → 6-col tablet → 1-col mobile)

## Available Widgets (65+)

### Status & Uptime
| Widget | Type Key | Description |
|--------|----------|-------------|
| Overall Status | `overall-system-status` | Hero banner: Operational / Degraded / Outage |
| Status Badge | `current-status-badge` | Single monitor status pill |
| Monitor Grid | `multi-monitor-status-grid` | Grid of badges for multiple monitors |
| Incident Banner | `active-incident-banner` | Full-width banner during active outages |
| Component Status | `component-status-list` | Per-service Operational / Degraded / Outage list |
| Monitor Group | `monitor-group` | Monitors grouped by folder or tag |
| Multi Status Badges | `multi-status-badges` | Compact multi-monitor status display |
| Service Health Matrix | `service-health-matrix` | Monitors × Environments matrix table |
| Aggregate Health Score | `aggregate-health-score` | Weighted 0-100 health score gauge |

### Uptime
| Widget | Type Key | Description |
|--------|----------|-------------|
| Uptime Bar | `uptime-bar` | Uptime % over configurable period |
| Uptime Timeline | `uptime-timeline` | 90-day bar chart (green/yellow/red) |
| SLA Summary | `sla-summary` | Target vs actual uptime with budget bar |
| Rolling Uptime Cards | `rolling-uptime-cards` | 24h / 7d / 30d / 90d cards side-by-side |
| Status History Ribbon | `status-history-ribbon` | GitHub-style daily status bars |
| Uptime Percentage Card | `uptime-percentage-card` | Big number with trend arrow |
| SLA Compliance Table | `sla-compliance-table` | Multi-monitor SLA pass/fail table |
| Uptime Heatmap | `uptime-heatmap` | 7d × 24h uptime grid |
| Uptime Comparison Chart | `uptime-comparison-chart` | Horizontal bar chart across monitors |
| Downtime Log | `downtime-log` | Chronological outage event list |
| MTTR / MTTF Cards | `mttr-mttf-cards` | Mean time to recovery / failure |

### Performance
| Widget | Type Key | Description |
|--------|----------|-------------|
| Response Time Chart | `response-time-chart` | Latency sparkline with avg/p95 lines |
| Response Time Heatmap | `response-time-heatmap` | Hour-of-day × day-of-week heatmap |
| Check History Feed | `check-history-feed` | Live log of recent check results |
| Latency Percentiles | `latency-percentiles-card` | P50 / P95 / P99 with period comparison |
| Performance Trend | `performance-trend` | Week-over-week latency change |
| Apdex Score | `apdex-score` | Application Performance Index (0.0–1.0) |
| Throughput Counter | `throughput-counter` | Checks per hour with sparkline |
| Response Time Comparison | `response-time-comparison` | Multi-monitor overlay line chart |
| SSL Certificate Status | `ssl-certificate-status` | Cert expiry, days remaining, issuer |
| DNS Resolution Time | `dns-resolution-time` | Per-monitor latency breakdown |

### Incidents
| Widget | Type Key | Description |
|--------|----------|-------------|
| Incident History | `incident-history` | Paginated list with status and updates |
| Active Incident Count | `active-incident-count` | Animated count of open incidents |
| Incident Timeline | `incident-timeline` | Chronological status update bubbles |
| Incident Severity Distribution | `incident-severity-distribution` | Critical / Major / Minor donut chart |
| Incident Duration Stats | `incident-duration-stats` | Avg / Longest / Shortest duration |
| Post-Mortem Card | `post-mortem-card` | RCA summary of last resolved incident |

### Maintenance
| Widget | Type Key | Description |
|--------|----------|-------------|
| Scheduled Maintenance | `scheduled-maintenance` | Upcoming and active windows |
| Maintenance Countdown | `next-maintenance-countdown` | Timer to next scheduled window |
| Maintenance Impact | `maintenance-impact-list` | Upcoming windows with affected services |
| Maintenance Calendar | `maintenance-calendar` | Month calendar with highlighted windows |

### Version Monitoring
| Widget | Type Key | Description |
|--------|----------|-------------|
| Version Status Grid | `version-status-grid` | Current vs latest for all version monitors |
| Version Check Badge | `version-check-badge` | Single monitor version status |
| Update Summary | `update-summary` | Count of up-to-date / minor / major updates |
| Version Timeline | `version-timeline` | Chronological version update history |
| Outdated Components Alert | `outdated-components-alert` | Monitors where current ≠ latest |
| Version Comparison Table | `version-comparison-table` | Side-by-side current vs latest |
| Changelog Widget | `changelog-widget` | Latest version info from version monitor |

### Metrics
| Widget | Type Key | Description |
|--------|----------|-------------|
| Gauge | `gauge` | Circular gauge (uptime, SLA, Apdex) |
| Stats Grid | `stats-grid` | 2×2 / 3×3 key metric cards |
| Metric Comparison Row | `metric-comparison-row` | Horizontal metric strip |
| Sparkline Row | `sparkline-row` | Mini charts side by side |
| Progress Ring | `progress-ring` | Apple Watch-style circular ring |

### Content & Branding
| Widget | Type Key | Description |
|--------|----------|-------------|
| Text Block | `text-block` | Free text / markdown announcements |
| Announcement Bar | `announcement-bar` | Full-width info/warn/danger banner |
| Link List | `link-list` | External links with icons |
| FAQ / Accordion | `faq-accordion` | Collapsible Q&A sections |
| Social Links | `social-links` | Social media icon row |
| Embed / iFrame | `embed-iframe` | External dashboard embed |
| Image / Banner | `image-banner` | Custom image with optional link |
| Subscriber Form | `subscriber-form` | Email subscription form |
| Countdown | `countdown` | Countdown to planned event |
| RSS Feed | `rss-feed-widget` | Feed URL for RSS readers |
| Divider | `divider` | Visual separator |

## Widget Configuration

Click any widget to configure it in the right panel:

| Option | Description |
|--------|-------------|
| **Label** | Custom title override for the widget |
| **Monitor Scope** | Single / Multiple / All / By-Tag / By-Type |
| **Monitor** | Select which monitor(s) to display |
| **Time Range** | Period for uptime/performance data |
| **Size (W × H)** | Grid columns (1–12) and rows (1–10) |
| **Visibility Rule** | Show only when Up / Degraded / Down |
| **Hide When No Data** | Collapse if no monitor data available |
| **Mobile Behavior** | Normal / Hidden / Full-width on mobile |
| **Click Action** | None / Link to monitor detail / External URL |
| **Border** | Show/hide border |
| **Border Radius** | Custom corner radius in px |
| **Padding** | Custom padding in px |

## Monitor Scope Modes

| Mode | Description |
|------|-------------|
| `single` | One specific monitor |
| `multiple` | Checkbox picker — select specific monitors |
| `all` | All monitors in your account |
| `by-tag` | Filter by tag name |
| `by-type` | Filter by monitor type (http/tcp/ssl/heartbeat/version) |
| `by-folder` | Filter by folder name |

## Password Protection

Status pages can be password protected:

1. Open the editor
2. In Page Settings, enable **Password Protection**
3. Set a passphrase
4. Viewers see a password prompt before the page loads

## Embedding an SVG Badge

For individual monitors, you can embed a live status badge:

```markdown
![Status](https://your-domain.com/v1/public/badge/{monitorId}.svg)
```

Supports flat, flat-square, and for-the-badge styles via `?style=` parameter.

## Email Subscriptions

Add a **Subscriber Form** widget to let visitors subscribe to status updates. Subscribers are stored per-page and can receive emails when incidents are created or resolved.

## SEO & Sharing

Each status page has:
- Custom meta title from page title
- `og:image` support (configure via API)
- Clean `/status/{slug}` URL
- Auto-refreshes every 60 seconds

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/status-pages` | List your status pages |
| `POST` | `/v1/status-pages` | Create a new page |
| `PATCH` | `/v1/status-pages/:id` | Update layout and config |
| `POST` | `/v1/status-pages/:id/publish` | Publish or unpublish |
| `DELETE` | `/v1/status-pages/:id` | Delete a page |
| `GET` | `/v1/public/status/:slug` | Public data (no auth) |
| `GET` | `/v1/public/status/:slug/widget/:id` | Per-widget data |
| `POST` | `/v1/public/status/:slug/subscribe` | Subscribe to updates |
| `GET` | `/v1/public/badge/:monitorId.svg` | SVG status badge |
