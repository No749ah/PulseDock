# ─── PulseDock API Dockerfile ───
# Multi-stage build for production deployment.
# Build context must be the repository root:
#   docker build -f apps/api/Dockerfile -t pulsedock-api .

# ── Stage 1: Install + Build ──
FROM node:22-alpine AS builder
WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy workspace root files
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/agent/package.json packages/agent/
COPY packages/cli/package.json packages/cli/
COPY packages/e2e/package.json packages/e2e/
COPY packages/extension/package.json packages/extension/
COPY packages/tool-registry/package.json packages/tool-registry/

# Install all dependencies (including dev for build)
RUN npm ci --ignore-scripts
# Generate Prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy API source and build
COPY apps/api/ apps/api/
COPY tsconfig.json ./
RUN cd apps/api && npm run build

# Copy tool registry (runtime dependency for API)
COPY packages/tool-registry/ packages/tool-registry/

# ── Stage 2: Production Runtime ──
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl wget

# Create non-root user
RUN addgroup -g 1001 -S pulsedock && adduser -S pulsedock -u 1001

# Copy built output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/packages/tool-registry ./packages/tool-registry
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV API_PORT=4321

USER pulsedock
EXPOSE 4321

# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node apps/api/dist/main.js"]
