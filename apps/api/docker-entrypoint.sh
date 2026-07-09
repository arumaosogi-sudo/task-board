#!/bin/sh
# apps/api/docker-entrypoint.sh
#
# Applies pending Prisma migrations, then hands off to `node` via `exec` so
# node replaces this shell process and becomes PID 1. That is required for:
#   - SIGTERM from `docker stop` / the orchestrator to reach node directly
#     (instead of being swallowed by a `sh -c "... && node ..."` wrapper)
#   - NestJS's `app.enableShutdownHooks()` (apps/api/src/main.ts) to actually
#     run onModuleDestroy hooks (CollabService closing the Hocuspocus WS
#     server, Prisma closing its connection pool) during a graceful shutdown
set -e

npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
exec node apps/api/dist/apps/api/src/main.js
