# PulseDock Architecture (v0)

## Services

- **web** (Next.js): dashboard, settings, auth UI, public status pages
- **api** (Node/Fastify planned): auth, monitor CRUD, folder CRUD, status/page config, alert routing config
- **worker** (Node): periodic checks + incident detection + notifications
- **postgres**: relational data (users, teams, monitors, checks, incidents)
- **redis**: queue/scheduler backend (BullMQ planned)

## Initial check types

1. HTTP(S)
2. TCP Port
3. SSL Expiry
4. Docker Image Update
5. Git Release/Tag Update

## Alert channels (phase 1)

- Discord webhook
- Generic webhook
- Email

## Data model (first pass)

- User
- Team
- TeamMember
- Folder
- Monitor
- MonitorCheckRun
- AlertChannel
- Incident
- StatusPage
- StatusPageWidget

## Execution model

- Worker creates due jobs per monitor interval
- Check result stored in `MonitorCheckRun`
- Incident engine opens/closes incidents
- Alert dispatcher triggers selected channels
- Dashboard queries aggregates for uptime and SLO windows
