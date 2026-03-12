# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY prisma/ ./prisma/

RUN npm ci --workspace=@pulsedock/api --ignore-scripts

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

COPY package*.json ./
COPY apps/api/ ./apps/api/
COPY prisma/ ./prisma/

# Generate Prisma client then compile TypeScript
RUN cd apps/api && \
    DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    npx prisma generate --schema=../../prisma/schema.prisma && \
    npm run build

# ── Stage 3: production ──────────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Only install production dependencies
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY prisma/ ./prisma/

RUN npm ci --workspace=@pulsedock/api --omit=dev --ignore-scripts

# Copy compiled output and Prisma client
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Non-root user
RUN addgroup -S pulsedock && adduser -S pulsedock -G pulsedock
USER pulsedock

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4321/health/live || exit 1

CMD ["node", "apps/api/dist/main.js"]
