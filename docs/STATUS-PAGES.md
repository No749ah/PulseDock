# Status Pages — PulseDock

Build beautiful, public-facing status pages with real-time data from your monitors.

## Quick Start

1. Go to **Status Pages** in the dashboard
2. Click **Create Page**
3. Enter a title and slug (e.g. `status` → `/status/status`)
4. Open the editor, drag widgets onto the canvas
5. Click **Publish**
6. Share your page: `https://your-domain.com/status/your-slug`

## Editor

The drag-and-drop editor allows you to build fully custom layouts:

- **Drag** widgets from the left palette onto the canvas
- **Click** a widget to configure it in the right panel
- **Resize** by dragging corners/edges
- Changes **auto-save** after 2 seconds

## Available Widgets (20+)

### Status & Uptime
| Widget | Description |
|--------|-------------|
| Overall Status | Hero banner: All Systems Operational / Degraded / Outage |
| Current Status Badge | Single or multi-monitor status indicator |
| Multi Status Badges | Compact grid of all monitor statuses |
| Monitor Group | Monitors grouped by folder or tag |
| Uptime Bar | Uptime percentage over configurable period |
| Uptime Timeline | 90-day bar chart (green/yellow/red per day) |
| SLA Summary | Target vs actual uptime for a period |

### Performance
| Widget | Description |
|--------|-------------|
| Response Time Chart | Sparkline of latency over time |
| Check History Feed | Live log of recent check results |

### Incidents & Maintenance
| Widget | Description |
|--------|-------------|
| Active Incident Banner | Full-width banner during outages, all-clear otherwise |
| Incident History | List of recent incidents with status and updates |
| Scheduled Maintenance | Upcoming and active maintenance windows |

### Version Monitoring
| Widget | Description |
|--------|-------------|
| Version Status Grid | Table showing current vs latest for all version monitors |
| Version Check Badge | Single monitor version status |
| Update Summary | Count of up-to-date / minor / major updates |

### Content
| Widget | Description |
|--------|-------------|
| Text Block | Free text / markdown announcements |
| Custom Header | Page title, subtitle, logo |
| Metric Counter | Single large stat |
| Divider | Visual separator |
| Last Updated Footer | "Last updated X seconds ago" |

## Widget Configuration

Click any widget to configure:
- **Label** — Custom title override
- **Monitor** — Select which monitor(s) to display
- **Filter by Tag / Folder** — Show only monitors in a group
- **Time Range** — 7 / 30 / 90 days for uptime widgets
- **Size** — Columns (1-12) and rows

## Password Protection

In the editor, click **Page Settings** → enable password protection. Viewers must enter the password to see the page.

## Public URL

Your status page is available at:
```
https://your-domain.com/status/{slug}
```

The page auto-refreshes every 60 seconds with live data.
