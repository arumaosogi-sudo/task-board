# Task Board API (NestJS + Prisma).
# Build context MUST be the repo root so npm workspaces + packages/shared resolve:
#   docker build -f apps/api/Dockerfile -t task-board-api .

# ---------- base ----------
# Pinned by digest for reproducible builds (tag node:22-slim as of 2026-07-19).
# Node 22+ is required: supabase-js needs native WebSocket (Node 20 threw
# "native WebSocket not found" at createClient, breaking image uploads in prod).
# To refresh: check the current digest for the `22-slim` tag on Docker Hub and
# update both the FROM line and this comment together.
FROM node:22-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS base
WORKDIR /app
# Prisma query engine needs OpenSSL at build and runtime.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# ---------- build ----------
FROM base AS build
# Install with the full workspace lockfile for reproducible installs.
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
# Source (shared is type-only, but tsc needs it on disk to resolve).
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build -w @task-board/api

# ---------- runner ----------
FROM base AS runner
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev
# Generated Prisma client + query engine.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
# Compiled app + schema/migrations (for `prisma migrate deploy`).
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/docker-entrypoint.sh /app/docker-entrypoint.sh

# node:20-slim already ships a non-root "node" user (uid 1000) — reuse it,
# just make sure it owns what it needs to read/write (node_modules/.prisma
# query-engine cache, migration state).
RUN chmod +x /app/docker-entrypoint.sh && chown -R node:node /app
USER node

# REST API + Hocuspocus realtime WS share this one port (see CollabService).
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

# entrypoint runs `prisma migrate deploy` then `exec node ...`, so node
# replaces the shell as PID 1 and receives SIGTERM directly (see
# docker-entrypoint.sh — required for graceful shutdown via
# app.enableShutdownHooks() in apps/api/src/main.ts).
ENTRYPOINT ["/app/docker-entrypoint.sh"]
