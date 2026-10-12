# ==============================================================================
# Multi-Stage Dockerfile for Hermes Virtual Office
# Stage 1: Build Web Frontend (Vite SPA)
# Stage 2: Production Server Runner (Node 22 Slim, Non-root, SQLite on /data)
# ==============================================================================

FROM node:22-slim AS web-builder
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/web/package*.json ./apps/web/

# Install dependencies
RUN npm ci

# Copy shared package and web source code
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

# Build shared types and frontend web bundle
RUN npm --workspace=packages/shared run build || true
RUN npm --workspace=apps/web run build

# ==============================================================================
# Stage 2: Production Server Runner
# ==============================================================================
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/data/office.sqlite

# Install required tools for native addons and healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/server/package*.json ./apps/server/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy shared source and server source
COPY packages/shared/ ./packages/shared/
COPY apps/server/ ./apps/server/

# Copy built frontend from web-builder stage
COPY --from=web-builder /app/apps/web/dist ./apps/web/dist

# Create persistent data directory for SQLite
RUN mkdir -p /data

# Create dedicated non-root application user
RUN groupadd -r nodejs && useradd -r -g nodejs -d /app appuser
RUN chown -R appuser:nodejs /app /data

USER appuser

EXPOSE 3000

# Health check verifying /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--experimental-strip-types", "apps/server/src/index.ts"]
