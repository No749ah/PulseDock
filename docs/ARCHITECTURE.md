# Architecture — PulseDock

## Overview

```
┌─────────────────────────────────────────────────┐
│                   Browser / Client               │
└──────────────┬──────────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────────┐
│           Reverse Proxy (nginx/Caddy)            │
└──────────────┬──────────────────────────────────┘
               │
       ┌───────┴───────┐
       │               │
┌──────▼──────┐ ┌──────▼──────┐
│  Next.js    │ │  NestJS API  │
│  Web :1234  │ │  :4321       │
└─────────────┘ └──────┬──────┘
                       │
              ┌────────┴────────┐
              │                 │
        ┌─────▼─────┐    ┌──────▼─────┐
        │PostgreSQL │    │   Redis    │
        │   :5432   │    │   :6379    │
        └───────────┘    └────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS |
| Backend | NestJS, TypeScript strict mode |
| Database | PostgreSQL 15, Prisma ORM |
| Cache/Queue | Redis 7 |
| Real-time | Socket.io (WebSocket + long-polling) |
| Auth | JWT (httpOnly cookies), CSRF protection |
| Container | Docker, Kubernetes (Helm chart) |

## Packages

```
/
├── apps/
│   ├── api/         NestJS backend API
│   └── web/         Next.js frontend
├── packages/
│   ├── tool-registry/  1300+ tool definitions
│   ├── agent/          Local version reporter daemon
│   ├── cli/            pulsedock CLI tool
│   ├── extension/      Chrome MV3 extension
│   └── e2e/            Playwright E2E tests
└── prisma/             Database schema + migrations
```

## Data Flow

### Monitor Check
1. `ChecksScheduler` runs every 10 seconds
2. Loads all enabled monitors with latest run
3. Dispatches due monitors concurrently via `Promise.allSettled`
4. `ChecksService` executes the check (HTTP/TCP/SSL/Git/etc.)
5. Stores result in `MonitorRun` table
6. Triggers alert evaluation if status changed
7. Broadcasts `monitor.checked` event via Socket.io

### Alert Flow
1. `AlertsService.notifyMonitorFailure()` called after failed check
2. Checks notification preferences (quiet hours, frequency, debounce)
3. Sends to configured alert channels (Email/Slack/Discord/Telegram/Webhook)
4. Logs to audit trail

## Database Schema (key models)

```
User → Monitor → MonitorRun
                → MonitorAlert → AlertChannel
     → Incident → IncidentUpdate
     → MaintenanceWindow
     → Tag → MonitorTag
     → Folder
     → PublicStatusPage
     → ApiKey
     → Session
```
