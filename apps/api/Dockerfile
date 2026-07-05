# Task Board API (NestJS + Prisma).
# Build context MUST be the repo root so npm workspaces + packages/shared resolve:
#   docker build -f apps/api/Dockerfile -t task-board-api .

# ---------- base ----------
FROM node:20-slim AS base
WORKDIR /app
# Prisma query engine needs OpenSSL at build and runtime.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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

# REST API (3001) + Hocuspocus realtime WS (3002).
EXPOSE 3001 3002
# Apply pending migrations, then boot. `migrate deploy` is idempotent.
# NOTE: tsc nests emitted output under dist/apps/api/src because the type-only
# import of packages/shared widens the compilation rootDir — hence the deep path.
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/apps/api/src/main.js"]
