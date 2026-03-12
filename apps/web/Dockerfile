# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY package*.json ./
COPY apps/web/package*.json ./apps/web/

RUN npm ci --workspace=@pulsedock/web --ignore-scripts

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY package*.json ./
COPY apps/web/ ./apps/web/

# Build Next.js with standalone output
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && npm run build

# ── Stage 3: production ──────────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=1234 \
    HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup -S pulsedock && adduser -S pulsedock -G pulsedock

# Copy Next.js standalone build
COPY --from=build --chown=pulsedock:pulsedock /app/apps/web/.next/standalone ./
COPY --from=build --chown=pulsedock:pulsedock /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=pulsedock:pulsedock /app/apps/web/public ./apps/web/public

USER pulsedock

EXPOSE 1234

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:1234/login || exit 1

CMD ["node", "apps/web/server.js"]
