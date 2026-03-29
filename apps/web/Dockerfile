# ─── PulseDock Web Dockerfile ───
# Multi-stage build for production deployment.
# Build context must be the repository root:
#   docker build -f apps/web/Dockerfile -t pulsedock-web .

# ── Stage 1: Install + Build ──
FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/agent/package.json packages/agent/
COPY packages/cli/package.json packages/cli/
COPY packages/e2e/package.json packages/e2e/
COPY packages/extension/package.json packages/extension/
COPY packages/tool-registry/package.json packages/tool-registry/

# Install all dependencies
RUN npm ci --ignore-scripts

# Copy web source and build
COPY apps/web/ apps/web/
COPY tsconfig.json ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN cd apps/web && npm run build

# ── Stage 2: Production Runtime ──
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache wget

# Create non-root user
RUN addgroup -g 1001 -S pulsedock && adduser -S pulsedock -u 1001

# Copy built Next.js app and production deps
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV WEB_PORT=1234

USER pulsedock
EXPOSE 1234

WORKDIR /app/apps/web
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "1234"]
