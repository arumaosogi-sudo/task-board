# Security Review — Task Board (pre-production)

- **Reviewer:** Security Engineer (AgentsTown)
- **Date:** 2026-07-09
- **Scope:** `apps/api` (NestJS + Prisma + Hocuspocus), auth/authz, RLS, headers/CORS, input validation, secrets, dependencies. Read-only review.
- **Method:** Source review against OWASP Top 10 + project-specific controls. No code was modified.

---

## 1. Executive Summary & Verdict

**Verdict: 🟡 CONDITIONAL GO** — the application's security *architecture is genuinely strong*. Authorization is enforced server-side on every project-scoped route, the realtime collab layer authenticates and authorizes before any document data flows, refresh tokens rotate and are stored hashed, password/verify/invite tokens are 256-bit opaque + hashed, input is globally validated, and CORS is a proper allowlist. **No Critical and no *practically exploitable* High issues were found in the application code.**

The remaining blockers before production are operational/hardening, not architectural:

1. **Vulnerable dependencies** (6 High advisories, incl. the actively-used `nodemailer`) must be upgraded — policy gate.
2. **HTML injection into invitation emails** via an unescaped project name (phishing amplifier).
3. **Operational secrets hygiene** — enforce a strong `JWT_SECRET` and confirm Supabase anon/service keys are not exposed client-side; remove misleading unused config.

Close items #1–#3 (all straightforward) and this is production-ready.

**Findings count:** 🔴 0 Critical · 🟠 1 High · 🟡 3 Medium · 🟢 5 Low/Info

---

## 2. Findings

| # | Sev | Title | Location | Impact | Fix |
|---|-----|-------|----------|--------|-----|
| 1 | 🟠 High | Vulnerable production dependencies (nodemailer, multer, lodash, tar) | `apps/api/package.json` | Known High CVEs in shipped packages; policy blocker | Upgrade; see §4 |
| 2 | 🟡 Med | HTML injection in invitation email via unescaped `projectName` | `apps/api/src/mail/mail.service.ts:52-58`, `layout()` `:80-90` | Attacker with project-create rights can inject arbitrary HTML/links into a trusted-looking email → phishing | HTML-escape all interpolated values |
| 3 | 🟡 Med | No enforced strength check on `JWT_SECRET` at boot | `apps/api/src/auth/strategies/jwt.strategy.ts:15-19`; `.env.example:12` ships `"change-me…"` | If operator ships the placeholder / a weak secret, all access tokens (and collab auth) are forgeable | Fail startup if secret is missing/short/known-default |
| 4 | 🟡 Med | Username enumeration via unthrottled endpoint | `apps/api/src/auth/auth.controller.ts:224` (`GET check-username/:username`) | Unlimited probing enumerates valid usernames; feeds credential-stuffing | Add `@Throttle`; consider auth-gating |
| 5 | 🟢 Low | Login timing oracle (no dummy bcrypt on unknown user) | `apps/api/src/auth/auth.service.ts:190-197` | Response-time difference distinguishes existing vs non-existing accounts | Run a dummy `bcrypt.compare` on the miss path |
| 6 | 🟢 Low | CSP disabled in Helmet | `apps/api/src/main.ts:27-31` | Low for a JSON-only API, but removes a defense-in-depth layer | Add a restrictive JSON-API CSP (`default-src 'none'`) |
| 7 | 🟢 Low | No refresh-token reuse/theft detection | `apps/api/src/auth/auth.service.ts:214-218` (`rotateRefresh`) | A stolen refresh token works until expiry; no family-revocation alarm | On reuse of an already-rotated token, revoke the whole token family |
| 8 | 🟢 Low/Info | Misleading unused config `JWT_REFRESH_SECRET` | `.env.example:13` | Config drift/confusion — refresh tokens are opaque (not JWT), so this var is never read | Remove the var, or document that refresh is opaque |
| 9 | 🟢 Info | Real Google **client ID** committed in `.env.example` | `.env.example:38` | Client IDs are public by design (not a secret) — informational only; confirm the client **secret** is empty (it is) | Optionally replace with a placeholder for cleanliness |

### Finding 2 detail (recommended fix)
`projectName` (≤120 chars, no character restriction) is interpolated raw into email HTML. `inviterName` is a username restricted to `[a-zA-Z0-9_.-]` (safe), but `projectName` is not. Escape before interpolation:

```ts
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
// apply esc(projectName) everywhere it enters html; keep encodeURIComponent for links
```

### Finding 3 detail (recommended fix)
```ts
const secret = config.get<string>('JWT_SECRET')
if (!secret || secret.length < 32 || secret.startsWith('change-me'))
  throw new Error('JWT_SECRET must be a strong, non-default value (>=32 chars)')
```

---

## 3. Authorization Coverage (route → @MinRole → verdict)

`ProjectRoleGuard` runs after `JwtGuard`, loads the caller's `Membership` for `req.params.id`, and enforces `@MinRole`. Non-members get **404** (existence not leaked). Role rank: Viewer(0) < Editor(1) < Owner(2).

### `projects.controller.ts` (`@UseGuards(JwtGuard)` class-level)
| Route | Guard/Role | Verdict |
|-------|-----------|---------|
| `POST /projects` | user-scoped (creator) | ✅ correct |
| `GET /projects`, `GET /projects/trash` | user-scoped | ✅ |
| `POST /projects/accept-invite` | token is the authority | ✅ (email-bound, see collab/invite) |
| `GET /projects/:id` | RoleGuard + Viewer | ✅ |
| `PATCH /projects/:id` | RoleGuard + **Editor** | ✅ |
| `DELETE /projects/:id` | RoleGuard + **Owner** | ✅ |
| `POST /:id/restore`, `DELETE /:id/permanent` | RoleGuard + **Owner** | ✅ |
| `GET /:id/members` | RoleGuard + Viewer | ✅ |
| `POST /:id/invitations` | RoleGuard + **Owner** | ✅ |
| `PATCH /:id/members/:userId` | RoleGuard + **Owner** | ✅ |
| `DELETE /:id/members/:userId` | RoleGuard + **Owner** | ✅ |
| `POST /:id/leave` | RoleGuard + Viewer | ✅ |
| `POST /:id/transfer` | RoleGuard + **Owner** | ✅ |
| `POST /:id/pin`, `DELETE /:id/pin` | RoleGuard + Viewer | ✅ |

### `files.controller.ts` (`@Controller('projects/:id/files')`, class-level `JwtGuard, ProjectRoleGuard`)
| Route | Role | Verdict |
|-------|------|---------|
| `GET /` (tree), `GET /:fileId` | Viewer | ✅ |
| `POST /` (create) | **Editor** | ✅ |
| `PATCH /:fileId`, `PUT /:fileId/content`, `DELETE /:fileId` | **Editor** | ✅ |
| `POST /:fileId/revisions` | **Editor** | ✅ |
| `GET /:fileId/revisions`, `GET /:fileId/revisions/:revisionId` | Viewer | ✅ |

IDOR check: `FilesService.requireFile()` filters by `{ id: fileId, projectId }` — a file from another project returns 404. ✅ No IDOR.

### User-scoped controllers (no project role needed — scoped in service)
| Controller | Enforcement | Verdict |
|-----------|-------------|---------|
| `updates.controller.ts` (`/me/updates`, `/me/project-changes`) | Service ANDs `project.memberships.some({ userId })`; a passed `projectId` the user isn't in returns empty | ✅ no IDOR |
| `search.controller.ts` | Service scopes to caller memberships; `@Throttle(30/10s)` | ✅ |
| `notifications.controller.ts` | Every query filtered by `userId` (incl. `markRead where {id,userId}`) | ✅ |

**Conclusion: every mutating project/file route carries an appropriate `@MinRole`. No missing or under-privileged guard found.**

### Realtime collab (Hocuspocus WS) — `collab.service.ts`
`onAuthenticate` (`:97-149`): verifies JWT (same `JWT_SECRET`) → resolves file→project (rejects unknown/soft-deleted) → requires `Membership` → **forces Viewers to `readOnly`**. Connection is rejected before any Y.Doc data flows. ✅ This critical control is correctly implemented.

---

## 4. Dependency Audit (`npm audit --omit=dev`)

**Totals: 13 (6 High, 7 Moderate, 0 Critical).**

| Package | Installed | Advisory class | Actively used? | Action |
|---------|-----------|----------------|----------------|--------|
| `nodemailer` | 6.10.1 | SMTP command injection, SSRF, file-read, CRLF header injection | **Yes** (`mail.service.ts`) | Upgrade to 7.x. *Note:* attacker-controlled fields (`envelope.size`, transport name, `raw`) are not user-reachable here (`from` fixed, `to` is `@IsEmail`-validated), so current exploitability is **low** — but upgrade before prod. |
| `multer` | 2.0.2 | Multiple DoS (resource exhaustion, deep nesting) | Transitive via `@nestjs/platform-express` | Upgrade platform-express / multer to patched line |
| `tar`, `@mapbox/node-pre-gyp` | — | Path traversal / arbitrary file write on extraction | Transitive (bcrypt install-time) | Build-time only; upgrade `bcrypt` or pin patched `tar` |
| `lodash` | 4.17.21 | Prototype pollution (`_.unset`/`_.omit`), `_.template` code injection | Transitive | 4.17.21 is latest; **no patched release** — track upstream. Not exploitable unless `_.template` is fed untrusted input (it isn't in app code) |

**Action:** run `npm audit fix`, then manually bump `nodemailer` to ^7 and `@nestjs/platform-express` to a multer-patched release; re-run audit; retest email send + file endpoints.

---

## 5. Controls verified as SOLID (no action)

- **Password storage:** bcrypt, cost 12. ✅
- **Refresh tokens:** 256-bit opaque, SHA-256-hashed at rest, rotated on use, all sessions revoked on password change/reset. ✅
- **Cookies:** `httpOnly`, `sameSite: strict`, `secure` in production, scoped `path:/`. ✅
- **Email/verify/reset/invite tokens:** 256-bit opaque, hashed at rest, TTL-bound (24h / 1h / 7d), single-use; reset revokes all sessions. Invite accept is **email-bound** (prevents invite hijack). Enumeration-safe responses on forgot/resend. ✅
- **Account reclaim:** pending credentials applied only after email ownership proven — cannot overwrite a victim's password. ✅
- **Input validation:** global `ValidationPipe` with `whitelist + forbidNonWhitelisted + transform`; DTOs on all bodies/queries; roles constrained to `Editor|Viewer` (`Owner` only via transfer); 5MB content cap. ✅
- **CORS:** function-based allowlist, no wildcard-with-credentials. ✅
- **Rate limiting:** global 100/min; login & register 5/min; resend-verify 1/min; forgot-password 5/min; search 30/10s. ✅ (gaps: check-username, finding #4)
- **RLS:** enabled + FORCE on all 12 tables; `REVOKE ALL` + revoked default privileges from `anon`/`authenticated` — closes the Supabase PostgREST surface. ✅ *(Design note: app connects as superuser and bypasses RLS by design; per-row authz lives in the app guards. Ensure `DATABASE_URL` uses a bypass role and that anon/service keys never reach the browser.)*
- **Secrets:** `.env` gitignored; only `.env.example` tracked with placeholders; no hardcoded secrets found in `src`. ✅

---

## 6. Pre-Production Checklist

- [ ] **(High #1)** Upgrade `nodemailer`→^7 and `@nestjs/platform-express`/`multer`; run `npm audit fix`; re-audit to 0 High. Retest email + file upload/save.
- [ ] **(Med #2)** HTML-escape `projectName`/`inviterName` in all `mail.service.ts` templates.
- [ ] **(Med #3)** Set a strong random `JWT_SECRET` (≥32 chars) in prod env; add boot-time strength assertion; reject `change-me*` default.
- [ ] **(Med #4)** Add `@Throttle` to `GET /auth/check-username/:username`.
- [ ] **(Low #5)** Add dummy `bcrypt.compare` on the login miss path (timing).
- [ ] **(Low #6)** Add restrictive CSP for the JSON API in Helmet.
- [ ] **(Low #7)** Add refresh-token reuse detection (family revocation).
- [ ] **(Low/Info #8/#9)** Remove unused `JWT_REFRESH_SECRET`; placeholder-ize the Google client ID in `.env.example`.
- [ ] Confirm production env: `NODE_ENV=production` (enables `secure` cookies), `CORS_ORIGINS` = real web origin(s), Supabase anon/service keys not shipped to the SPA, `SMTP_*` set, `GOOGLE_CLIENT_SECRET` set if OAuth enabled.
- [ ] Verify RLS migration `20260708000000_enable_rls_all_tables` is applied on the production database.

---

*Read-only review — no source, config, or Git state was modified.*
