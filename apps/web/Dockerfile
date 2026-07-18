# Task Board web SPA (React + Vite), served by nginx.
# Build context MUST be the repo root:
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_URL=https://api.example.com \
#     --build-arg VITE_COLLAB_URL=wss://api.example.com \
#     -t task-board-web .

# ---------- build ----------
# Pinned by digest for reproducible builds (tag node:20-slim as of 2026-04-22).
FROM node:20-slim@sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c AS build
WORKDIR /app
# API/collab URLs are baked into the bundle at build time.
ARG VITE_API_URL=http://localhost:3001
ARG VITE_COLLAB_URL=ws://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_COLLAB_URL=$VITE_COLLAB_URL

COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @task-board/web

# ---------- runtime ----------
# Pinned by digest for reproducible builds (tag nginx:1.27-alpine as of 2025-04-16).
# Master process runs as root (required to bind :80) but stock nginx:alpine
# already drops worker processes — the ones actually serving requests — to
# the unprivileged `nginx` user. Switch to nginxinc/nginx-unprivileged (and
# `listen 8080`) only if the deploy target mandates non-root for the master
# process too (e.g. some k8s PodSecurityPolicies/OpenShift).
FROM nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8 AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O- http://localhost:80/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
