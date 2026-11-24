# Task Board

**Live demo:** https://taskboard-aruma-web.onrender.com — sign in with
`demo@task-board.app` / `demo-task-board-2026`.
The API runs on a free Render instance that sleeps when idle, so the first
request after a quiet spell can take up to a minute to answer.

Real-time collaborative report-writing app. Monorepo with a NestJS API + React web SPA.
Mental model: "GitHub diff + GoodNotes + Google Docs". Bilingual (Thai / English).

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS v3 + TanStack Query |
| Backend | NestJS + Prisma + PostgreSQL |
| Real-time | Yjs (CRDT) + Hocuspocus WebSocket (TipTap editor) |
| i18n | i18next + react-i18next (th / en) |
| Security | JWT access + rotating refresh cookie, `@nestjs/throttler`, Helmet, CORS allowlist |
| Monorepo | npm workspaces + Turborepo |

## Architecture

```
                    ┌────────────────────────┐
   Browser  ───────▶│  web (React SPA, :5173) │
   (SPA)            └───────────┬─────────────┘
                    REST +      │  WebSocket (Yjs)
                    cookie      │
        ┌───────────────────────┴───────────────────────┐
        ▼                                                ▼
 ┌──────────────────────┐                     ┌──────────────────────┐
 │ api REST (NestJS)     │                     │ Hocuspocus collab WS │
 │ :3001                 │                     │ :3001 (shared port)  │
 │  auth · projects ·    │                     │  document CRDT sync  │
 │  files · revisions ·  │                     └──────────┬───────────┘
 │  notifications ·      │                                │
 │  search               │                                │
 └──────────┬────────────┘                                │
            └─────────────────┬──────────────────────────-┘
                              ▼
                     ┌──────────────────┐
                     │ PostgreSQL (Prisma)
                     └──────────────────┘
```

- **Roles** (`Owner` / `Editor` / `Viewer`) are enforced **server-side on every action**
  via `ProjectRoleGuard` + `@MinRole`.
- **Access tokens** are short-lived JWTs held in memory; a **rotating refresh token**
  lives in an httpOnly cookie. The SPA transparently refreshes on 401.
- **Themes**: 6 accent colors × light/dark = 12, persisted to `UserSetting` server-side
  (and mirrored to `localStorage` for first paint).

## Prerequisites

- Node.js 20+
- Docker Desktop (optional — for the local PostgreSQL + Mailpit stack)

## Setup (local dev)

```bash
# 1. Install dependencies (workspace-aware)
npm install

# 2. Start PostgreSQL (+ Mailpit for local email capture)
docker compose up -d db mailpit

# 3. Copy the env template and fill in values
cp .env.example apps/api/.env

# 4. Apply database migrations
cd apps/api && npx prisma migrate deploy   # or `prisma migrate dev` while iterating
```

> Using managed Postgres (Supabase)? Point `DATABASE_URL` at the transaction pooler
> (`:6543?pgbouncer=true`) and `DIRECT_URL` at the session pooler (`:5432`). Migrations
> use `DIRECT_URL`.

> **Editor image uploads (Sprint 4, ADR 0004).** Inserting/pasting an image or a drawing
> uploads it to a **private Supabase Storage bucket** and stores only a short URL in the
> document (keeps the Yjs CRDT small). Set these in `apps/api/.env` — without them the
> upload route replies `503` and image insertion is disabled:
>
> | Var | Purpose |
> |---|---|
> | `SUPABASE_URL` | Project URL, e.g. `https://<ref>.supabase.co` |
> | `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret. **Never** expose to the frontend or commit it. |
> | `SUPABASE_STORAGE_BUCKET` | Bucket name (create it **private**). Default `file-assets`. |
>
> Create the bucket once in Supabase → Storage (Dashboard or `supabase storage`), set it
> **private**, then paste the service-role key from Project Settings → API. See
> `apps/api/.env.example` for the full annotated block (incl. `SUPABASE_SIGNED_URL_TTL`).

## Development

```bash
# API + collab WS (both :3001, shared server) + Web (:5173), all at once
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:3001
- Mailpit UI (local email): http://localhost:8025

## Quality gates

```bash
npm run typecheck   # tsc --noEmit across all 3 workspaces
npm run build       # tsc (api) + vite build (web)
```

The web build code-splits the collaborative editor (TipTap + Yjs) into its own lazy
chunk, so the app shell paints without waiting for the ~470 KB editor bundle.

## Testing

```bash
npm test          # unit tests, all workspaces (mock Prisma — no DB needed)
```

### Web unit / component tests (Vitest + RTL)

The web app is tested with **Vitest + React Testing Library** (jsdom). These are part
of `npm test`; React Query hooks, the router, and IO-bearing collaborators are mocked
so **no backend, DB, or browser is required**.

```bash
cd apps/web
npx vitest run          # one-shot (what CI + `npm test` run)
npm run test:watch      # watch mode while developing
npm run test:cov        # with coverage report
```

Covers: `lib/htmlDiff`, the `ui.tsx` primitives (`Button`, `Card`, `Segmented`,
`Skeleton`, `Tag`, `EmptyState`), the `AppShell` navigation rail (active-state per
route), and the consolidated `/activity` page (scope gating + empty/error/loading
states).

### E2E tests (Playwright — needs the live stack)

> **One-command:** `npm run test:e2e:local` boots an isolated test db+mailpit+api+web
> and tears them down after — see `ops/RUNBOOK.md` §7. The manual steps below still
> work and are useful for debugging a single spec interactively.

End-to-end specs live in `e2e/` and drive a real browser against a **running stack**
(Postgres + api + web) plus **Mailpit** for reading verification emails. They are
**not** part of `npm test` or the default CI run — they only pass with the full stack
up, so run them locally like this:

```bash
# 1. Bring up db + mailpit + api + web (Mailpit HTTP UI/API on :8025)
docker compose up -d db mailpit
npm run dev                    # api + collab :3001 (shared) · web :5173

# 2. Install browser binaries once
cd apps/web && npx playwright install chromium

# 3. Run the specs from the repo root
npx playwright test            # or: npm run test:e2e -w @task-board/web
```

Config: `playwright.config.ts` (`baseURL` defaults to `http://localhost:5173`,
override with `E2E_WEB_URL`; Mailpit URL via `E2E_MAILPIT_URL`, default
`http://localhost:8025`). Specs: `auth.spec.ts` (register → verify → login →
dashboard + invalid-login), `activity.spec.ts` (feed scope toggle), `theme.spec.ts`
(dark/light switch). Uncomment the `webServer` block in the config to have Playwright
auto-boot the web dev server.

### Integration tests (real Postgres)

> **One-command:** `npm run test:int:local` boots an isolated, disposable test db
> (never the one `npm run dev` uses) and tears it down after — see
> `ops/RUNBOOK.md` §7. The manual steps below still work if you want the db left
> running between runs (faster iteration while writing a spec).

A separate suite (`apps/api/**/*.int-spec.ts`) runs against a **real** PostgreSQL to
catch mock/schema drift and verify database-level Row-Level Security — things the
Prisma-mocking unit tests can't see. It is **excluded from `npm test`** on purpose, so
the default suite stays DB-free.

```bash
# 1. Start a disposable local Postgres (docker-compose service `db`)
docker compose up -d db

# 2. Point the tests at it via TEST_DATABASE_URL (NEVER DATABASE_URL / Supabase —
#    the suite TRUNCATEs every table between tests). Guards refuse to run otherwise.
export TEST_DATABASE_URL=postgresql://taskboard:taskboard@localhost:5432/taskboard

# 3. Run it. The suite auto-creates the anon/authenticated roles, runs
#    `prisma migrate deploy` against the test DB, then runs the specs serially.
npm run test:int
```

> Windows PowerShell: `$env:TEST_DATABASE_URL = 'postgresql://taskboard:taskboard@localhost:5432/taskboard'`

In CI these run in a dedicated **`API integration tests (real Postgres)`** job with an
ephemeral `postgres:16` service container (see `.github/workflows/ci.yml`).

## Deploy (Docker)

Both images build from the **repo root** (workspaces + `packages/shared` must resolve).

```bash
# Full local stack: db + mailpit + api + web
docker compose up --build

# Web:  http://localhost:8080
# API:  http://localhost:3001  (collab WS shares this same port)
```

Building images individually:

```bash
docker build -f apps/api/Dockerfile -t task-board-api .
docker build -f apps/web/Dockerfile \
  --build-arg VITE_API_URL=https://api.example.com \
  --build-arg VITE_COLLAB_URL=wss://api.example.com \
  -t task-board-web .
```

The API image runs `prisma migrate deploy` on startup (idempotent) before booting.

## Feature phases

1. **Auth Core** — register / login / JWT + refresh, Google OAuth, email verify, reset.
2. **Projects & Membership** — CRUD, invite/accept, role management, transfer, trash.
3. **Work Page** — file tree + CRUD, rich document editor, autosave, PDF export.
4. **Real-time collaboration** — Yjs + presence + live cursors, version history + diff/restore.
5. **Release prep** — Settings (account/theme/language/notifications), Notifications,
   full-text-ish Search, i18n (th/en), a11y pass, security & Docker hardening.

## Project structure

```
apps/
  api/          NestJS REST API + Hocuspocus collab WS
    src/
      auth/          JWT + refresh + Google OAuth + account management
      projects/      project CRUD + membership + role guard
      files/         file tree + document content + revisions
      collab/        Hocuspocus WebSocket server (Yjs)
      notifications/ in-app notifications (invite / mention / revision)
      search/        cross-project name + content search
    prisma/          schema + migrations
    Dockerfile
  web/          React SPA (Vite)
    src/
      pages/         Login, Home, WorkPage, Settings, ...
      components/    UI kit, CollabEditor, NotificationBell, SearchOverlay
      lib/           API client + React Query hooks
      i18n/          i18next setup
      locales/       th.json + en.json
    Dockerfile · nginx.conf
packages/
  shared/       TypeScript types shared FE/BE
docker-compose.yml  db + mailpit + api + web
```

## Themes & language

- 12 themes (6 accent × light/dark). Change via the profile menu swatches or **Settings**.
  Persisted to `UserSetting` (server) + `localStorage` (`tb-theme` / `tb-mode`).
- UI language (th / en) is switchable in **Settings** and persisted to `UserSetting.language`.
- Domain terms stay in English by design: `Project`, `Owner`, `Editor`, `Viewer`, `Box`.
