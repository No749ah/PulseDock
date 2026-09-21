# ─── PulseDock API Dockerfile ───
# Multi-stage build for production deployment.
# Build context must be the repository root:
#   docker build -f apps/api/Dockerfile -t pulsedock-api .

# ── Shared dependencies (inherited, not copied between stages) ──
FROM node:22-alpine AS dependencies
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

# ── Compile application sources ──
FROM dependencies AS builder

# The API imports registry TypeScript sources via relative workspace paths.
# Copy them before compilation so clean image builds emit the shared modules.
COPY packages/tool-registry/ packages/tool-registry/
COPY apps/api/ apps/api/
RUN cd apps/api && npm run build

# ── Stage 2: Production Runtime ──
FROM dependencies AS runner
WORKDIR /app

RUN apk add --no-cache wget

# Create non-root user
RUN addgroup -g 1001 -S pulsedock && adduser -S pulsedock -u 1001

# Inherit the immutable dependency layer instead of recursively copying the
# entire workspace node_modules tree (expensive on nested/slow Docker storage).
# Only compiled application output and runtime registry sources cross stages.
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/tool-registry ./packages/tool-registry

ENV NODE_ENV=production
ENV API_PORT=4321

USER pulsedock
EXPOSE 4321

# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node apps/api/dist/apps/api/src/main.js"]
