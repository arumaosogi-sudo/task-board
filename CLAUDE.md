# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Role and persona

You are a senior software engineer and expert UI/UX designer. Analyze the existing code thoroughly before proposing fixes — identify root causes, not symptoms. Every UI element you touch should be visually polished (clean layout, proper whitespace, elegant typography) and use the project's existing UI kit / Tailwind conventions rather than inventing new patterns. Be direct and precise; explain *why* a change improves security, performance, or UX when it isn't obvious.

## What this project is

**Task Board** — a real-time collaborative report-writing app. Monorepo: NestJS API + React web SPA.
Mental model: "GitHub diff + GoodNotes + Google Docs." Bilingual (Thai / English).

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS v3 + TanStack Query |
| Backend | NestJS + Prisma + PostgreSQL (Supabase) |
| Real-time | Yjs (CRDT) + Hocuspocus WebSocket, wired into the TipTap editor |
| i18n | i18next + react-i18next (`th` / `en`) |
| Security | JWT access token + rotating refresh cookie, `@nestjs/throttler`, Helmet, CORS allowlist |
| Monorepo | npm workspaces + Turborepo |

## Commands

Run from the repo root (npm workspaces + Turborepo drive everything):

```bash
npm install                # install all 3 workspaces
npm run dev                 # turbo dev: api + collab WS (both :3001, shared server) + web (:5173) together
npm run typecheck           # tsc --noEmit across api, web, packages/shared
npm run build                # tsc (api) + vite build (web)
npm run lint                 # real ESLint 9 flat config (typescript-eslint) — `eslint src` in every workspace
npm run format[:check]      # Prettier — available, but NOT gated in CI
npm test                    # unit tests everywhere: jest (api) + vitest (web). Mocked Prisma, no DB needed
```

> **Run `npx prisma generate --schema apps/api/prisma/schema.prisma` after a fresh clone.**
> `@prisma/client` is generated, not checked in, so `typecheck`, `test`, and `build` all fail
> with "has no exported member 'User'" until it exists. CI does this as its own step.

Two further suites are **excluded from `npm test`** on purpose, because each needs live
infrastructure. Both have a one-command local runner that boots an isolated stack (never the
dev one) and tears it down after — see `ops/RUNBOOK.md` §7:

```bash
npm run test:int:local      # apps/api/**/*.int-spec.ts against a real Postgres (RLS + schema drift)
npm run test:e2e:local      # Playwright specs in e2e/ against a real browser + full stack
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → `npm test` → build, plus a separate
`api-integration` job with an ephemeral `postgres:16`. The e2e suite is deliberately not in CI.

Prisma (run from `apps/api`):

```bash
npx prisma migrate dev       # create + apply a migration while iterating locally
npx prisma migrate deploy    # apply pending migrations (also runs automatically on API container boot)
npx prisma generate          # regenerate the client after schema changes
npx prisma studio            # inspect data
```

Migrations use `DIRECT_URL` (session pooler); the app at runtime uses `DATABASE_URL` (transaction pooler, `pgbouncer=true`). Both come from Supabase → Project Settings → Database.

Docker (images build from the **repo root** — workspaces + `packages/shared` must resolve):

```bash
docker compose up -d db mailpit   # local Postgres + Mailpit (dev email capture, UI on :8025)
docker compose up --build          # full stack: db + mailpit + api + web
```

## Architecture

```
Browser (SPA) ──REST + cookie──▶ api (NestJS, :3001)
              ──WebSocket (Yjs)─▶ Hocuspocus collab WS (:3001, shares the api HTTP server)
                                        │
                                        ▼
                               PostgreSQL (Prisma)
```

- `apps/api/src/` — one NestJS module per domain: `auth`, `projects`, `files`, `collab` (Hocuspocus server), `comments`, `share` (public read-only links), `notifications`, `search`, `updates`, `users`, `mail`, plus the non-domain `prisma`, `config` (CORS + secret validation) and `storage` (Supabase Storage client) folders. `prisma/schema.prisma` is the single source of truth for the data model; `prisma/migrations/` tracks history.
- `apps/web/src/` — `pages/` (route-level screens), `components/` (shared UI incl. `CollabEditor.tsx`, `CommentsPanel.tsx`, the `editor/` TipTap extensions + `DrawingOverlay.tsx`, and the `ui.tsx` kit), `lib/` (API client + React Query hooks + `export/` for PDF/Word/Markdown), `i18n/` + `locales/` (th.json / en.json).
- `packages/shared/src/types.ts` — TypeScript types shared between `apps/api` and `apps/web`. Change types here first when a shape needs to change on both sides; both workspaces resolve it via the npm workspace link, no build step needed (`packages/shared` build is a no-op).

### Authorization model

Roles (`Owner` / `Editor` / `Viewer`, see `Role` enum in `schema.prisma`) are enforced **server-side on every action** via `ProjectRoleGuard` (`apps/api/src/projects/guards/project-role.guard.ts`) + the `@MinRole()` decorator (`apps/api/src/projects/decorators/min-role.decorator.ts`). Never rely on the client to hide an action as the only access control — always gate the corresponding API route with `@MinRole`.

### Auth

Short-lived access JWT held in memory on the client; a rotating refresh token lives in an httpOnly cookie. The SPA transparently refreshes on 401 (see `apps/web/src/lib`). Global rate limiting is `ThrottlerModule` at 100 req/min/IP (`app.module.ts`); sensitive auth routes (login/register/resend-verify) set stricter per-route `@Throttle` limits in `auth.controller.ts` — preserve/extend this pattern rather than relaxing it.

### Real-time collaboration

`apps/api/src/collab/collab.service.ts` runs the Hocuspocus server. Document CRDT state is persisted as `File.ydoc` (bytes) in Postgres — `File.content` is a separate autosaved plain snapshot used outside live collaboration (PDF export, non-collab read). Don't write directly to `File.content` while a Yjs session for that file is active; that's the collab service's job. `CollabEditor.tsx` (web) wires TipTap to the Hocuspocus WebSocket provider.

### Themes & i18n

12 themes (6 accent colors × light/dark), persisted server-side to `UserSetting` and mirrored to `localStorage` (`tb-theme` / `tb-mode`) for first paint. UI language (`th`/`en`) persists to `UserSetting.language`. Domain terms (`Project`, `Owner`, `Editor`, `Viewer`, `Box`) stay in English by design — don't translate them in locale files.

### Build note

The web build code-splits the collaborative editor (TipTap + Yjs, ~470 KB) into its own lazy chunk so the app shell paints without waiting on it. Keep new heavy editor-only dependencies inside that lazy boundary rather than the main bundle.

## Things to avoid in this repo

- **The four folders suffixed `-ไม่ได้เกี่ยวข้องกับตัวจริง`** (`content-ไม่ได้เกี่ยวข้องกับตัวจริง/`, `design-ไม่ได้เกี่ยวข้องกับตัวจริง/`, `figma-task-board-ไม่ได้เกี่ยวข้องกับตัวจริง/`, `figma-task-board-manu-ไม่ได้เกี่ยวข้องกับตัวจริง/`) are explicitly labeled "not related to the actual project" — they hold old Figma exports and a standalone design-tokens prototype kept only for visual reference. Do not edit, build, wire into the app, or treat anything in them as current spec. If design guidance is needed, treat them as inspiration only and confirm with the user before pulling anything from them into `apps/web`.
- Don't hand-edit generated Prisma client output or files under `node_modules`.
- Don't add a new migration by editing an already-applied file under `apps/api/prisma/migrations/` — always generate a new migration.
- Don't bypass `ProjectRoleGuard`/`@MinRole` with client-side-only checks for anything that mutates project/file state.
- Don't put secrets (JWT secrets, SMTP creds, Google OAuth secret, DB password) in code or commits — they belong in `.env` (gitignored), following `.env.example`.
- `apps/api/prisma/schema.prisma` datasource comments matter: `DATABASE_URL` (pooled, `pgbouncer=true`) is for runtime, `DIRECT_URL` (session) is for migrations only — don't swap them.
- `.claude/settings.local.json` and the `.claude/ภาพจากSchemaข้อมูลลที่ควรแก่ไข/` folder (screenshots of things that "should be fixed") are local working notes, not app source — don't ship them as part of a feature.
