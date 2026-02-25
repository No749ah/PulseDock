# Run PulseDock in this OpenClaw environment

## Services

```bash
docker compose up -d postgres redis
```

## API

```bash
npm run api
```

## Web

```bash
npm run web
```

## URLs

- Web: http://localhost:3000
- API health: http://localhost:4000/health
- Swagger: http://localhost:4000/docs
- Version: http://localhost:4000/version
