# Deployment Guide

This guide covers production deployment for PulseDock with Docker Compose and Kubernetes.

---

## Option A — Docker Compose (single host)

Use this when running PulseDock on one VM/server.

### 1) Prepare environment

```bash
cp .env.example .env.prod
```

Set at minimum:

- `POSTGRES_PASSWORD`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`

Generate strong JWT secrets:

```bash
openssl rand -hex 32
```

### 2) Build and run

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

### 3) Verify

```bash
curl -f http://localhost:4321/health/live
curl -f http://localhost:1234/login
```

---

## Option B — Kubernetes (recommended for HA)

Kubernetes manifests are under `k8s/`.

- `k8s/base`: reusable base manifests
- `k8s/overlays/prod`: production overlay

### 1) Create secrets

Copy the template and apply it:

```bash
cp k8s/base/secret.example.yaml /tmp/pulsedock-secret.yaml
# edit values in /tmp/pulsedock-secret.yaml
kubectl apply -f /tmp/pulsedock-secret.yaml
```

### 2) Review host + image tags

Edit:

- `k8s/overlays/prod/ingress-host.patch.yaml` (domain)
- `k8s/overlays/prod/kustomization.yaml` (image tags)

### 3) Deploy

```bash
kubectl apply -k k8s/overlays/prod
```

### 4) Verify rollout

```bash
kubectl -n pulsedock get pods
kubectl -n pulsedock get ingress
kubectl -n pulsedock logs deploy/pulsedock-api --tail=100
```

---

## Notes

- API service name in-cluster: `pulsedock-api:4321`
- Web service name in-cluster: `pulsedock-web:1234`
- PostgreSQL runs as a StatefulSet with a persistent volume claim
- `k8s/base/secret.example.yaml` is a template and should not be used as-is
