# Start PulseDock

## 1) Start dependencies

```bash
docker compose up -d postgres redis
```

## 2) Apply DB migrations

```bash
DATABASE_URL="postgresql://pulsedock:pulsedock@dind:5432/pulsedock?schema=public" \
  npx prisma migrate deploy --schema=prisma/schema.prisma
```

## 3) Start API

```bash
npm run api
```

## 4) Start Web

```bash
npm run web
```

## Access

- Web: http://localhost:3000
- API: http://localhost:4000
- Swagger: http://localhost:4000/docs
