# PulseDock Helm Chart

Deploy PulseDock on any Kubernetes cluster using the official Helm chart.

## Overview

The chart ships everything you need to run PulseDock in production:

| Component | Kind | Description |
|-----------|------|-------------|
| API | Deployment | NestJS backend on port 4321 |
| Web | Deployment | Next.js frontend on port 3000 |
| PostgreSQL | StatefulSet | Postgres 16-alpine with PVC |
| Redis | StatefulSet | Redis 7-alpine with PVC |
| Ingress | Ingress | nginx ingress with optional TLS |
| HPA | HorizontalPodAutoscaler | Optional autoscaling for API + Web |

---

## Prerequisites

- Kubernetes 1.24+
- Helm 3.10+
- `nginx` ingress controller (or change `ingress.className`)
- A storage class that supports `ReadWriteOnce` PVCs

---

## Quick Start

### 1. Add the chart (or install from local path)

```bash
# From local clone:
cd PulseDock

# Generate required secrets
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH=$(openssl rand -hex 32)
PG_PASS=$(openssl rand -hex 16)
```

### 2. Minimal install

```bash
helm install pulsedock helm/pulsedock/ \
  --namespace pulsedock \
  --create-namespace \
  --set secrets.jwtSecret="$JWT_SECRET" \
  --set secrets.jwtRefreshSecret="$JWT_REFRESH" \
  --set postgres.password="$PG_PASS" \
  --set ingress.host="pulsedock.yourdomain.com"
```

### 3. Run database migrations

Wait for the API pod to become Ready, then:

```bash
kubectl exec -it deploy/pulsedock-api -n pulsedock \
  -- npx prisma migrate deploy
```

---

## Production Install (recommended)

Create a `my-values.yaml` file so you never have to repeat `--set` flags:

```yaml
# my-values.yaml
ingress:
  host: pulsedock.yourdomain.com
  tls: true
  tlsSecretName: pulsedock-tls   # created by cert-manager or manually

secrets:
  jwtSecret: "<openssl rand -hex 32>"
  jwtRefreshSecret: "<openssl rand -hex 32>"

postgres:
  password: "<strong-password>"
  storageSize: 20Gi

redis:
  storageSize: 2Gi

api:
  replicas: 2
  tag: "1.0.0"

web:
  replicas: 2
  tag: "1.0.0"

hpa:
  enabled: true
```

```bash
helm install pulsedock helm/pulsedock/ \
  --namespace pulsedock \
  --create-namespace \
  -f my-values.yaml
```

---

## Upgrading

```bash
# Bump image tags, reuse everything else
helm upgrade pulsedock helm/pulsedock/ \
  --namespace pulsedock \
  --reuse-values \
  --set api.tag="1.1.0" \
  --set web.tag="1.1.0"
```

Then run migrations if needed:

```bash
kubectl exec -it deploy/pulsedock-api -n pulsedock \
  -- npx prisma migrate deploy
```

---

## Using an External Database / Redis

Disable the bundled StatefulSets and pass a connection URL:

```yaml
postgres:
  enabled: false

redis:
  enabled: false

secrets:
  databaseUrl: "postgresql://user:pass@mydb.internal:5432/pulsedock?schema=public"
  redisUrl: "redis://myredis.internal:6379"
```

---

## Values Reference

### Global

| Key | Default | Description |
|-----|---------|-------------|
| `global.imageRegistry` | `ghcr.io/no749ah` | Base image registry |
| `global.imagePullPolicy` | `IfNotPresent` | Pull policy for all images |

### API

| Key | Default | Description |
|-----|---------|-------------|
| `api.image` | `pulsedock-api` | Image name (appended to registry) |
| `api.tag` | `latest` | Image tag |
| `api.replicas` | `2` | Replica count |
| `api.port` | `4321` | Container port |
| `api.resources` | see values.yaml | CPU/memory requests and limits |
| `api.readinessProbe.initialDelaySeconds` | `12` | Readiness initial delay |
| `api.livenessProbe.initialDelaySeconds` | `20` | Liveness initial delay |
| `api.extraEnv` | `[]` | Extra env vars injected into API pods |

### Web

| Key | Default | Description |
|-----|---------|-------------|
| `web.image` | `pulsedock-web` | Image name |
| `web.tag` | `latest` | Image tag |
| `web.replicas` | `2` | Replica count |
| `web.port` | `3000` | Container port |
| `web.resources` | see values.yaml | CPU/memory requests and limits |
| `web.extraEnv` | `[]` | Extra env vars injected into Web pods |

### PostgreSQL

| Key | Default | Description |
|-----|---------|-------------|
| `postgres.enabled` | `true` | Deploy bundled PostgreSQL |
| `postgres.image` | `postgres:16-alpine` | PostgreSQL image |
| `postgres.storageSize` | `10Gi` | PVC size |
| `postgres.storageClass` | `""` | StorageClass (cluster default if empty) |
| `postgres.database` | `pulsedock` | Database name |
| `postgres.username` | `pulsedock` | Database user |
| `postgres.password` | `""` | **Required** — database password |

### Redis

| Key | Default | Description |
|-----|---------|-------------|
| `redis.enabled` | `true` | Deploy bundled Redis |
| `redis.image` | `redis:7-alpine` | Redis image |
| `redis.storageSize` | `1Gi` | PVC size |
| `redis.storageClass` | `""` | StorageClass (cluster default if empty) |

### Ingress

| Key | Default | Description |
|-----|---------|-------------|
| `ingress.enabled` | `true` | Create an Ingress resource |
| `ingress.className` | `nginx` | IngressClass name |
| `ingress.host` | `pulsedock.example.com` | Hostname — **change this** |
| `ingress.tls` | `false` | Enable TLS |
| `ingress.tlsSecretName` | `""` | TLS secret name (auto-named if empty) |
| `ingress.annotations` | nginx body-size + timeout | Extra ingress annotations |

### Config (non-secret)

| Key | Default | Description |
|-----|---------|-------------|
| `config.nodeEnv` | `production` | NODE_ENV |
| `config.apiUrl` | `""` | API URL for web frontend (auto-derived from ingress host) |
| `config.nextPublicApiUrl` | `""` | Next.js public API URL |
| `config.logLevel` | `info` | Log level |
| `config.allowPublicRegistration` | `"false"` | Allow self-registration |

### Secrets

| Key | Default | Description |
|-----|---------|-------------|
| `secrets.jwtSecret` | `""` | **Required** JWT access secret |
| `secrets.jwtRefreshSecret` | `""` | **Required** JWT refresh secret |
| `secrets.databaseUrl` | `""` | Override DATABASE_URL (auto-computed if postgres.enabled) |
| `secrets.redisUrl` | `""` | Override REDIS_URL (auto-computed if redis.enabled) |
| `secrets.defaultAdminEmail` | `admin@example.com` | Initial admin email |
| `secrets.defaultAdminPassword` | `ChangeMe123!` | Initial admin password — change immediately |

### HPA

| Key | Default | Description |
|-----|---------|-------------|
| `hpa.enabled` | `false` | Enable HorizontalPodAutoscaler |
| `hpa.api.minReplicas` | `2` | API minimum replicas |
| `hpa.api.maxReplicas` | `10` | API maximum replicas |
| `hpa.api.cpuUtilization` | `70` | API CPU utilization target (%) |
| `hpa.web.minReplicas` | `2` | Web minimum replicas |
| `hpa.web.maxReplicas` | `10` | Web maximum replicas |
| `hpa.web.cpuUtilization` | `70` | Web CPU utilization target (%) |

### Service Account

| Key | Default | Description |
|-----|---------|-------------|
| `serviceAccount.create` | `false` | Create a dedicated ServiceAccount |
| `serviceAccount.name` | `""` | Override service account name |

---

## Useful Commands

```bash
# Check release status
helm status pulsedock -n pulsedock

# View rendered templates (dry run)
helm template pulsedock helm/pulsedock/ -f my-values.yaml

# View API logs
kubectl logs -l app.kubernetes.io/component=api -n pulsedock -f --tail=100

# View Web logs
kubectl logs -l app.kubernetes.io/component=web -n pulsedock -f --tail=100

# Open API shell
kubectl exec -it deploy/pulsedock-api -n pulsedock -- sh

# Run migrations
kubectl exec -it deploy/pulsedock-api -n pulsedock -- npx prisma migrate deploy

# Uninstall (does NOT delete PVCs)
helm uninstall pulsedock -n pulsedock
```

---

## Uninstall

```bash
helm uninstall pulsedock -n pulsedock
```

> **Note:** PersistentVolumeClaims are **not** deleted automatically. To fully clean up:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=pulsedock -n pulsedock
> ```
