# ==============================================================================
# Multi-Stage Dockerfile for Hermes Virtual Office
# Stage 1: Build Web Frontend & Server
# Stage 2: Production Server Runner (Node 22 Slim, Non-root, SQLite on /data)
# ==============================================================================

FROM node:22-slim AS builder
WORKDIR /app
# Build in production mode: with NODE_ENV=development the web build emitted a
# DEV bundle (jsxDEV runtime, import.meta.env.DEV = true), which shipped the
# dev-only status simulator and dev banners to production.
ENV NODE_ENV=production

# Copy dependency manifests
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/web/package*.json ./apps/web/
COPY apps/server/package*.json ./apps/server/
COPY tools/mock-hermes/package*.json ./tools/mock-hermes/

# Install dependencies including devDependencies (vite, typescript)
RUN npm ci --include=dev

# Copy source code across all workspaces
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/
COPY apps/server/ ./apps/server/
COPY tools/ ./tools/

# Build shared types, tools, server, and frontend web bundle
RUN npm --workspace=packages/shared run build
RUN npm --workspace=tools/mock-hermes run build
RUN npm --workspace=apps/server run build
RUN npm --workspace=apps/web run build

# Refuse to ship a development bundle: jsxDEV only appears when vite builds
# outside production mode, and that also turns import.meta.env.DEV on.
RUN if grep -rq "jsxDEV" apps/web/dist/assets; then \
      echo "ERROR: development web bundle produced - check NODE_ENV" >&2; exit 1; \
    fi

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
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/server/package*.json ./apps/server/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled artifacts from builder stage
COPY packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

COPY apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY apps/server/src/db/migrations ./apps/server/dist/db/migrations
COPY apps/server/src/db/migrations ./apps/server/src/db/migrations

COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Create persistent data directory for SQLite
RUN mkdir -p /data

# Create dedicated non-root application user
RUN groupadd -r nodejs && useradd -r -g nodejs -d /app appuser
RUN chown -R appuser:nodejs /app /data

USER appuser

EXPOSE 3000

# Health check verifying /api/health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["node", "apps/server/dist/index.js"]
