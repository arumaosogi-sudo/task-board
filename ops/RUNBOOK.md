# Task Board — Operations Runbook

Deploy target: **Railway / Fly.io (PaaS)** — both build directly from
`apps/api/Dockerfile` and `apps/web/Dockerfile`. `docker-compose.prod.yml` is
kept only as a documented fallback for a self-hosted VPS; skip that section
unless you're specifically not using the PaaS.

---

## 1. First-time production setup (either platform)

1. Create two services from this repo: one pointing at `apps/api/Dockerfile`,
   one at `apps/web/Dockerfile` (context = repo root for both — see the
   comment at the top of each Dockerfile).
2. Set all env vars listed in `.env.production.example` on the platform's
   env/secret store. Do **not** copy the `docker-compose.yml` dev values —
   those are local-only defaults (`change-me-...`, Mailpit, unauthenticated
   local Postgres).
   - `JWT_SECRET` / `JWT_REFRESH_SECRET`: generate with `openssl rand -base64 48`,
     ≥32 chars, must differ from each other and from the dev defaults.
   - `DATABASE_URL` / `DIRECT_URL`: from your Postgres provider (e.g.
     Supabase → Project Settings → Database). `DATABASE_URL` = pooled
     (`:6543?pgbouncer=true`), `DIRECT_URL` = session (`:5432`) — migrations
     need the direct/session connection.
   - `VITE_API_URL` / `VITE_COLLAB_URL` are **build-time** args for the web
     image (baked into the JS bundle) — set them as build args on the
     platform, not just runtime env vars, or the SPA will call the wrong API.
3. Web SPA must know the API's real domain before its first build; API's
   `CORS_ORIGINS` must know the web SPA's real domain before it will accept
   requests from it. Set both together.
4. If enabling Google OAuth: create/confirm the OAuth client in Google Cloud
   Console and add `GOOGLE_CALLBACK_URL` to its Authorized redirect URIs, or
   login will fail with `redirect_uri_mismatch`. Leaving
   `GOOGLE_CLIENT_SECRET` unset is safe — the route returns `503` by design
   instead of crashing.

## 2. Normal deploy (push-to-deploy on Railway/Fly.io)

CI (`.github/workflows/ci.yml`) runs on every push/PR to `main`: install →
prisma generate → lint → typecheck → build → sanity-build both Docker images.
It does **not** push images or trigger deploy — that's the platform's job
once it sees a green build on `main` (Railway/Fly.io watch the repo directly).

1. Merge to `main` after CI is green.
2. Platform builds `apps/api/Dockerfile` and `apps/web/Dockerfile` and rolls
   out the new containers.
3. On boot, the api container's entrypoint (`apps/api/docker-entrypoint.sh`)
   runs `prisma migrate deploy` (idempotent — safe to run every boot) *before*
   `node` starts serving traffic.
4. Watch the platform's health check against `GET /health` (see §4) before
   it cuts traffic over — both Dockerfiles ship a `HEALTHCHECK` already, most
   PaaS platforms will pick this up automatically; confirm in the platform's
   health-check settings if not.

## 3. Rollback

**Railway:** open the service → Deployments tab → pick the last known-good
deployment → "Redeploy". This re-runs that image's entrypoint, including
`prisma migrate deploy` — safe as long as you are not rolling back across a
migration that dropped/renamed a column still read by the older code (check
`apps/api/prisma/migrations/` for the range between the two deploys first).

**Fly.io:** `fly releases` to list, then `fly deploy --image <previous-image-ref>`
(or `fly releases rollback` if enabled on the account) to redeploy the last
good image without rebuilding.

**Self-hosted docker compose (fallback):**
```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# roll back to a specific previously-built tag:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build <service>
```

**Database migrations do not auto-rollback.** `prisma migrate deploy` only
applies forward. If a bad migration shipped, you need a new forward migration
that reverts the change — do not hand-edit applied migration history in prod.

## 4. Health checks

- `GET /health` (api, port 3001) — liveness only (process is up and
  responding), does **not** check DB connectivity. Used by both Dockerfiles'
  `HEALTHCHECK` instruction and by `docker-compose.yml`'s `api` healthcheck.
- `GET /` (web, port 80) — nginx serving the SPA shell.
- No `/health/ready` (DB-aware readiness) endpoint exists yet — see
  `docs/prod-readiness-plan.md` §3 for the proposed addition. Until then, a
  DB outage will not fail the liveness check, so `HEALTHCHECK`/platform
  restarts won't help during a DB-down incident — check DB status directly.

Manual check:
```sh
curl -f https://<api-domain>/health
```

## 5. Logs

- **Railway/Fly.io:** use the platform's log viewer/CLI
  (`railway logs` / `fly logs`) — the app logs via NestJS's built-in Logger
  to stdout/stderr, which both platforms capture automatically. No log
  aggregator is wired up yet (see `docs/prod-readiness-plan.md` §9, item 4).
- **Local docker compose:**
  ```sh
  docker compose logs -f api
  docker compose logs -f web
  ```

## 6. Graceful shutdown (why the Dockerfile entrypoint matters)

`apps/api/src/main.ts` calls `app.enableShutdownHooks()`, which makes Nest
run `onModuleDestroy()` (closing the Hocuspocus realtime WS server, closing
Prisma's connection pool) when the process receives `SIGTERM`. That only
works if `node` is actually PID 1 inside the container — which is why
`apps/api/Dockerfile` uses `ENTRYPOINT ["/app/docker-entrypoint.sh"]` with a
trailing `exec node ...` in that script, instead of the old
`CMD ["sh","-c","... && node ..."]` form. If you ever change the entrypoint,
keep the `exec` — dropping it silently breaks graceful shutdown (in-flight
collab sessions and DB connections get killed instead of drained).

## 7. Known gaps (not blockers, tracked for later)

- No readiness probe distinct from liveness (§4).
- No structured/aggregated logging (plain NestJS Logger to stdout).
- Migrations run from inside the api container on every boot; fine for a
  single instance, but if this ever scales to multiple replicas, move
  `prisma migrate deploy` to a separate one-shot deploy step instead (Prisma's
  advisory lock prevents corruption either way, it would just slow multi-
  replica boot slightly).
- `vite` (apps/web devDependency, build-time only) has an open High-severity
  advisory; fixed version requires a major bump (5.x → 8.x) that needs an
  actual test build to validate — deferred, see handoff notes for this round.
