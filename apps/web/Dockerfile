# Task Board web SPA (React + Vite), served by nginx.
# Build context MUST be the repo root:
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_URL=https://api.example.com \
#     --build-arg VITE_COLLAB_URL=wss://api.example.com \
#     -t task-board-web .

# ---------- build ----------
FROM node:20-slim AS build
WORKDIR /app
# API/collab URLs are baked into the bundle at build time.
ARG VITE_API_URL=http://localhost:3001
ARG VITE_COLLAB_URL=ws://localhost:3002
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
FROM nginx:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
