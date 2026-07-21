# Task Board — Project Handoff

**Last updated:** 2026-07-21
**Status:** Live in production, feature-complete for real users, actively maintained.

This document is the single entry point for anyone (human or AI) picking up this
project cold. It explains what the product is, how it's built, what state it's
in right now, where the bodies are buried, and what's still open. Read this
before touching code.

---

## 1. What this product is

**Task Board** — a real-time collaborative report-writing app. Think
*"GitHub diff + GoodNotes + Google Docs"*: teams write documents together live
(like Google Docs), draw freehand on an A4 page (like GoodNotes), and every
change is versioned with a readable diff view (like GitHub). Bilingual UI
(Thai/English).

Core features: projects with role-based membership (Owner/Editor/Viewer),
a rich text+drawing editor synced in real time across tabs/devices, comments,
mentions, task/checklist blocks, templates, version history with diffs,
public read-only share links, notifications, and export to Word/PDF/Markdown.

---

## 2. Where things live

| What | Where |
|---|---|
| **The actual product repo** | `C:\app-3-รอดำเนินการ` (own git repo, separate from any orchestration tooling) |
| **GitHub remote** | `github.com/arumaosogi-sudo/Project_task_borad_appvs01` |
| **Production web** | `https://task-boardweb-production.up.railway.app` |
| **Production API** | `https://task-boardapi-production.up.railway.app` |
| **Database** | Supabase Postgres, project ref `rmedzagtazczqioiibmb` (ap-southeast-1) |
| **File storage** | Supabase Storage, private bucket `file-assets` (raster images ≤3MB) |
| **Hosting** | Railway (two services: `@task-board/api`, `@task-board/web`) |

The 4 top-level folders suffixed `-ไม่ได้เกี่ยวข้องกับตัวจริง` (old Figma
exports) and the nested `Project_task_borad_appvs01/` clone are **not** part
of the real project — ignore them.

---

## 3. Architecture & stack

Monorepo: npm workspaces + Turborepo (`apps/*`, `packages/*`).

| Layer | Tech |
|---|---|
| Web | React 18 + Vite + TypeScript + Tailwind v3 + TanStack Query |
| Editor | TipTap (ProseMirror) — rich text, tables, task lists, mentions, comments, images |
| Real-time | Yjs CRDT + Hocuspocus WebSocket server |
| API | NestJS + Prisma ORM |
| Database | PostgreSQL via Supabase (Supavisor pooler for app traffic, direct connection for migrations) |
| Auth | JWT access + rotating refresh tokens (with reuse detection), Google OAuth |
| Email | Gmail API over HTTPS (primary) or SMTP (fallback) — see §6 |
| File storage | Supabase Storage (private bucket, signed URLs) |
| Deployment | Docker (both services), Railway hosting |
| Testing | Jest (API), Vitest + RTL (web), Playwright (e2e, scaffolded) |

**One critical infra fact:** the REST API and the Hocuspocus real-time
WebSocket server **share a single HTTP server/port** (`main.ts` calls
`app.listen()` then `CollabService.attachToHttpServer(app.getHttpServer())`).
This is deliberate — Railway only grants one public domain per service, and a
raw TCP proxy can't terminate TLS, so a second port would be unreachable from
a browser in production anyway. There is no `COLLAB_PORT` anymore; if you see
one in an old doc or script, it's stale — delete it.

**Node version:** production runs **Node 22** (Dockerfiles pinned to
`node:22-slim`). This matters because `@supabase/supabase-js` requires native
`WebSocket` support at `createClient()` time and throws on Node 20 — see the
incident in §7.

---

## 4. Local development

```bash
npm install
cd apps/api && npx prisma generate && cd ../..   # NOT run automatically on `npm install` — do this every fresh clone
npm run dev     # runs turbo dev → api :3001, web :5173 (collab shares :3001)
```

Environment: copy `apps/api/.env.example` → `apps/api/.env` and
`apps/web/.env.example` (if present) → `apps/web/.env`, fill in real values.
See `.env.production.example` at the repo root for the full production
variable list with explanations.

**Gates before committing anything:**
```bash
npm run typecheck   # turbo, 3 packages
npm run lint        # real ESLint (was a no-op stub before Sprint 4 — now real)
npm run test        # turbo — api (Jest) + web (Vitest)
npm run build       # turbo build
```
As of the last full sweep: **API ~231 tests, Web ~160 tests**, all green,
0 lint warnings. Counts drift as features land — don't treat these as exact,
just as "roughly this many, and it should be 100% passing."

**Known local-dev gotchas:**
- `npm ci` does **not** auto-run `prisma generate` — the `build` script
  prepends it (`prisma generate && tsc`), but for typecheck/dev you must run
  it manually after a fresh `npm install`.
- Killing/restarting `npm run dev` cleanly matters: leftover Node processes
  from previous terminal sessions cause `EADDRINUSE` port fights. Check
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` (Windows) before
  starting a fresh dev server if anything seems stuck.
- A very long-lived `npm run dev` + Vite HMR session can silently desync from
  disk (edits saved, zero `hmr update` log lines, browser serves a stale
  bundle) — if something that should have changed didn't, restart the dev
  server fully before concluding it's a real regression.
- `npm install` and `npm ci` are **not interchangeable** for verifying a
  build. `npm install` tolerates lockfile drift; `npm ci` (what Railway/CI
  actually run) is strict. Always verify with a clean `rm -rf node_modules && npm ci`
  when diagnosing a CI-only failure that won't reproduce locally.

---

## 5. Current production state (as of 2026-07-21)

Both services are live and healthy. Everything below has been **verified
directly against the live production URLs**, not just "should work":

- ✅ Register → email verification (Gmail API delivery) → login
- ✅ Forgot/reset password (Gmail API delivery)
- ✅ Google OAuth login (redirect URI + Railway env vars correctly configured)
- ✅ Session survives a page reload (cross-site cookie fix — see §7)
- ✅ Real-time collaborative editing across two browser tabs/devices
- ✅ Image upload + inline Word-style image editing (see §6.3)
- ✅ Drawing/freehand ink (does not paint over the toolbar — see §7)
- ✅ Word (.docx, A4-professional layout), PDF, Markdown export
- ✅ Public share links (create/publish/revoke, no enumeration leak)
- ✅ Security headers (CSP, HSTS, X-Frame-Options), rate limiting, RLS on all tables
- ✅ gzip compression + long-lived asset caching + route-level code splitting

**Known open gap:** none blocking. Everything the owner has asked for has
shipped and been verified live. See §8 for lower-priority follow-ups.

---

## 6. Feature deep-dives (the non-obvious parts)

### 6.1 Email delivery
Two transports, auto-selected by `MailService` based on which env vars are set:
- **Gmail API over HTTPS** (`apps/api/src/mail/gmail-api.transport.ts`) —
  primary in production. OAuth2 refresh-token grant against
  `oauth2.googleapis.com`, sends via `gmail.googleapis.com`'s raw-message
  upload endpoint. Chosen because **Railway's trial tier silently blackholes
  all outbound SMTP** (packets dropped, no error) — HTTPS egress is never
  blocked. Env vars: `GMAIL_OAUTH_CLIENT_ID`/`_SECRET` (falls back to the
  existing `GOOGLE_CLIENT_ID`/`_SECRET` if unset) + `GMAIL_REFRESH_TOKEN`.
  One-time setup: `node ops/scripts/gmail-oauth-setup.mjs` (opens a localhost
  consent flow, prints the refresh token to stdout — never writes it to a
  file). ADR: `docs/decisions/0009-gmail-api-mail-transport.md`.
- **SMTP** (`nodemailer`) — fallback, used automatically if the Gmail vars
  aren't all set (e.g. local dev). Bounded timeouts (5s connect/greeting, 15s
  socket) so a blackholed host fails fast instead of hanging the whole
  request.
- Both paths: `Promise<boolean>` result (never throws), bounded
  retry/backoff with correct transient-vs-permanent classification, and a
  **dev-only** `[MAIL-FALLBACK]` log line that prints the actual
  verify/reset/invite link when a send fails — so local dev works with zero
  real SMTP config. This never fires in production (`NODE_ENV=production`
  hard-gates it).
- Boot-time health probe is **fire-and-forget** (`onModuleInit(): void`,
  never awaited) — an earlier version awaited it and it once took down all of
  production with a 502 (see §7). Never make this mistake again.
- `EMAIL_FROM` must be the same mailbox that authorized the Gmail OAuth
  consent (DMARC alignment — a third-party sender can never pass DKIM/DMARC
  for someone else's domain, which is why Brevo/other ESPs were abandoned).

### 6.2 Real-time collaboration
Yjs CRDT + Hocuspocus, shared HTTP port (§3). `CollabEditor.tsx` creates
`ydoc`/`HocuspocusProvider`/drawing-`Y.UndoManager` inside a `useEffect` (NOT
in the render body or a `useState` lazy initializer — React 18 StrictMode's
double-invoke behavior turned that into multiple real WebSocket connections
racing to auth as the same document room; this was a genuinely broken
feature for a while, fixed and re-verified with real 2-tab tests).

**As of the inline-image rework** (§6.3), the inner editor's mount is
deliberately **gated behind the provider's first `synced` event** — do not
"optimize" this back to mounting immediately, it exists to let a data-safety
migration run before the editor ever binds to a document's content.

### 6.3 Images in the editor
Images are **inline** nodes (`ResizableImage.configure({ inline: true })`) —
Word/Google-Docs "in line with text" behavior: the image is a large character
in the text flow, cursor sits before/after it, you can type and space around
it, and left/center/right alignment comes from the **paragraph's own
TextAlign** (the same toolbar buttons used for regular text) — there is no
separate image alignment menu. Resize handles snap to 25/33/50/66/75/100% of
content width. Word export produces a real inline `<wp:inline>` drawing with
paragraph `w:jc` alignment.

**Backward-compat migration** (`apps/web/src/components/editor/inlineImageMigration.ts`):
documents saved under an earlier design could have an image nested inside a
non-textblock container (a callout Box, a list item, a table cell). Under the
inline schema that's illegal, and the real y-prosemirror binding behavior
for illegal nested content is to **silently delete the whole container** —
not a crash, actual data loss. `migrateInlineImages()` walks the raw Yjs
document and wraps any stray image in a paragraph, and it is wired to run
**before** the editor ever binds to the document (gated on the provider's
`synced` event, executed synchronously before `setCollab(...)` mounts the
inner editor). This ordering is load-bearing — see the incident write-up in
§7, this was caught by QA before it ever reached a real user's document.

### 6.4 Drawing / freehand ink
SVG overlay (`DrawingOverlay.tsx`) positioned over the A4 page element,
strokes stored as a `Y.Array` in the same `ydoc` (no separate backend
storage). `.tb-page` has `isolation: isolate` so the overlay's stacking
context can never paint over (or steal clicks from) the sticky toolbar above
it — this was a real, reported, now-fixed bug (§7).

### 6.5 Storage
`SupabaseStorageService` sanitizes `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
(strips accidental surrounding quotes/whitespace from hosting-panel paste
mistakes) before use, wraps client construction in try/catch (a bad config
now returns a clean 503 `storage-init-failed`, never a blank 500), and logs a
`Storage probe: ...` line at boot (non-blocking) so a misconfiguration is
visible in Railway logs immediately.

### 6.6 Export
Word (.docx) uses the `docx` library (not `html-to-docx`, which is
unmaintained) — professional A4 layout: correct margins, TH Sarabun New
typography scale, heading keep-with-next, title-page page-numbering,
table styling, callout boxes. See ADR `0008`. PDF and Markdown export exist
alongside it.

---

## 7. Incidents & lessons (read before assuming something "should just work")

These are real bugs that were found, root-caused, and fixed — kept here so
nobody re-introduces them or wastes time re-diagnosing a known issue.

1. **Boot-time health checks must never be awaited.** `MailService` once
   `await`ed `transporter.verify()` in `onModuleInit()`. Railway's trial tier
   blackholes outbound SMTP (no response at all), so the await hung forever,
   `app.listen()` never ran, and the whole API 502'd. Every boot probe in
   this codebase (mail, storage) is now fire-and-forget
   (`void this.verifyX()`), by design — never change this back.
2. **Cross-site cookies need `SameSite=None` in production.** The web and
   API run on sibling Railway subdomains (`*.up.railway.app`), which is on
   the Public Suffix List — meaning they're cross-*site*, not just
   cross-origin. A `SameSite=Strict` refresh cookie silently never reaches
   the API, so every page reload logged users out. Fixed:
   `sameSite: isProd ? 'none' : 'strict'`.
3. **Node version skew hid a real bug for weeks.** `@supabase/supabase-js`
   requires native `WebSocket` at construction time; local dev ran Node 24
   (fine) while the production Docker image ran Node 20 (throws "native
   WebSocket not found"). The fix was two-layered: pass the `ws` package
   explicitly via the `realtime.transport` option (works on any Node), *and*
   bump both Dockerfiles to `node:22-slim`. An earlier hypothesis (quoted env
   values breaking `new URL()`) was wrong but not wasted — the try/catch +
   logging added to test that hypothesis is what surfaced the real cause.
4. **A silent, permanent, replicated data-loss bug was caught before it
   shipped.** See §6.3. The lesson generalizes: when a data-safety fix claims
   to "repair on sync," verify precisely *when* the destructive path actually
   fires relative to *when* the repair runs — "after `synced`" and "before
   the editor binds" are not the same thing, and the difference is exactly
   the gap where real user data gets lost.
5. **CSS stacking contexts are load-bearing, not decorative.** The drawing
   overlay painted over (and stole clicks from) the sticky toolbar because
   `.tb-page` had no stacking context of its own, so its child SVG's z-index
   flattened into the same context as the toolbar's z-index, and DOM order
   decided the (wrong) winner. `isolation: isolate` on `.tb-page` fixed it.
   If you ever see UI painting in the wrong order, check for a missing
   stacking context before reaching for a bigger z-index number.
6. **A Railway builder setting silently overrode the Dockerfile.** Railway
   was running via Railpack instead of the repo's hand-built Dockerfile
   (which has a careful signal-handling entrypoint) — the Builder setting has
   to be explicitly switched to "Dockerfile" per service, and any leftover
   "Custom Start Command" from the Railpack era must be cleared or it
   overrides the Dockerfile's `CMD` even after switching builders.
7. **Railway's "Teardown" setting matters.** With it off, old deployment
   containers from every redeploy never died and kept competing for the same
   port, causing a persistent crash-loop that looked like a code bug but
   wasn't.
8. **`PORT` vs a custom port env var can collide.** Railway injects its own
   `PORT`; make sure nothing else in your env defaults to the same value.
9. **Never park a secret only in an agent's memory/output.** Background
   coding-agent sessions are not resumable once their transcript is gone —
   if a generated password/token only ever appeared in a dead session's
   chat, it's gone for good. Save credentials somewhere durable immediately.

---

## 8. Lower-priority follow-ups (not blocking, not forgotten)

- **Google OAuth consent screen is likely still in "Testing" mode** — only
  emails added as test users in Google Cloud Console can use "Sign in with
  Google." Publish the consent screen to allow the general public, when
  ready.
- **Railway trial-tier limits** — as usage grows, keep an eye on the Railway
  usage/credit balance; upgrading to a paid plan removes any remaining trial
  constraints.
- **Rolling-deploy self-heal window for the image migration (§6.3):** an
  old-code client could theoretically still lose data opening a
  never-yet-migrated document during the brief window of a rolling deploy;
  it self-heals the instant any new-code client opens that same document.
  A one-time server-side migration pass is optional, not required.
- **A handful of stale git branches** exist on GitHub from earlier
  incremental work, already fully merged into `main` under different final
  branch names — safe to delete, not yet cleaned up (owner's call).
- **`docs/decisions/0007-ai-writing-assist.md`** — an AI-writing-assist ADR
  exists but the feature was never built; revisit only if the owner wants it.

---

## 9. Key docs to know about

| Doc | What it's for |
|---|---|
| `docs/decisions/000X-*.md` | ADRs — architecture decisions with rationale, read before changing that area |
| `docs/SRS-*.md` | Requirements specs for specific feature rounds |
| `docs/test-plan.md` | Prioritized test coverage plan |
| `docs/prod-readiness-plan.md` | Production hardening checklist |
| `ops/RUNBOOK.md` | Operational runbook |
| `design/UI_GUIDELINES.md` | Locked design tokens — use for any UI work, avoids "AI slop" styling drift |
| `.env.production.example` | Full annotated list of production environment variables |

---

## 10. If you're an AI agent picking this up

- The product repo (`C:\app-3-รอดำเนินการ` in this environment) is its own
  git repo — don't confuse it with whatever orchestration/worktree tooling
  you're running under.
- Always run the four gates (typecheck/lint/test/build) before considering
  any change done.
- Before deleting anything, prove zero references (grep + a passing build),
  and when in doubt, flag it for a human decision instead of deleting.
- Before claiming something is fixed, verify it against the **live
  production URLs**, not just passing tests — several real bugs in this
  project's history only showed up in production (Node version skew, Railway
  config quirks, cross-site cookies) and were invisible in local dev or CI.
- If you're reviewing another agent's data-safety claim (migrations, repair
  logic, anything touching real user documents), re-derive the failure mode
  yourself rather than trusting the stated diagnosis — see the incident in
  §6.3/§7.4, where the original bug-report was itself factually wrong about
  the mechanism, and only independent reproduction caught it.
