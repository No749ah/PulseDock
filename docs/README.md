<!-- markdownlint-disable MD030 -->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./static/img/langflow-logo-color-blue-bg.svg">
    <img src="./static/img/langflow-logo-color-black-solid.svg" alt="PulseDock logo">
  </picture>
</p>

[![Release Notes](https://img.shields.io/badge/release-v1.0.0-blue?style=flat-square)](https://github.com/No749ah/PulseDock/releases)
[![License](https://img.shields.io/badge/license-MIT-orange)](https://opensource.org/licenses/MIT)

# PulseDock

PulseDock is a powerful platform for tracking software versions, changes and publishing status pages across fleets.

## ✨ Highlight features

- Visual builder interface to quickly get started and iterate.
- Automatic discovery and changelog summarization.
- Publishable public status pages and alerts.
- API-first design and audit logs.

## 🧭 Quickstart

1) Start dependencies

```bash
# from repo root
docker compose up -d postgres redis
```

2) Apply DB migrations (if required)

```bash
DATABASE_URL="postgresql://pulsedock:pulsedock@localhost:5432/pulsedock?schema=public" \
  npx prisma migrate deploy --schema=projects/PulseDock/prisma/schema.prisma
```

3) Start services (use repo wrappers)

```bash
npm run start:api
npm run start:web
```

4) Open http://localhost:3000 (or configured WEB_PORT)

---

See the other docs in this folder for architecture and API details.
