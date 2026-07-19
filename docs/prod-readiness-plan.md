# Task Board — Production Readiness Plan

**สถานะ:** ร่างแผน (ยังไม่ลงมือแก้จริง) — DevOps Engineer, AgentsTown
**วันที่:** 2026-07-09
**ขอบเขตที่อ่านจริง:** `docker-compose.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`,
`apps/web/nginx.conf`, `.env.example`, `.dockerignore`, root+3 workspace `package.json`,
`turbo.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/app.controller.ts`,
`apps/api/src/mail/**`, `apps/api/src/auth/guards/google.guard.ts`,
`apps/api/src/auth/strategies/google.strategy.ts`, `apps/api/src/collab/collab.service.ts`,
`apps/api/prisma/schema.prisma`, `README.md`, `.gitignore`, `git ls-files` (migrations tracking check)

---

## 0. TL;DR — Gap Summary

| # | Gap | Priority | Owner |
|---|---|---|---|
| 1 | ไม่มี CI pipeline เลย (ไม่มี `.github/`) | 🔴 High | DevOps ทำเองได้ |
| 2 | Docker images รันเป็น root (ไม่มี `USER`) | 🔴 High | DevOps ทำเองได้ |
| 3 | ไม่มี `HEALTHCHECK` ใน Dockerfile / compose สำหรับ api, web | 🟠 Medium | DevOps ทำเองได้ |
| 4 | `CMD ["sh","-c", "... && node ..."]` ใน api Dockerfile — ไม่ยืนยัน PID1/SIGTERM forwarding ชัดเจน | 🟠 Medium | DevOps ทำเองได้ |
| 5 | ไม่มี `app.enableShutdownHooks()` → Nest ไม่เรียก `onModuleDestroy` ตอน SIGTERM → Hocuspocus/Prisma ปิดไม่ graceful | 🔴 High | DevOps ร่าง diff ให้ / Dev merge |
| 6 | `/health` endpoint มีอยู่แล้ว แต่เป็น liveness เฉย ๆ ไม่เช็ค DB connectivity (ไม่มี readiness แยก) | 🟡 Low | DevOps เสนอเพิ่มได้ |
| 7 | Secrets (JWT, DB, SMTP) hardcode เป็น plaintext ใน `docker-compose.yml` (ใช้ได้เฉพาะ local dev) — prod ไม่มีโครง secret management | 🔴 High | DevOps ทำโครงให้ + **user ต้องให้ค่าจริง** |
| 8 | ไม่มี SMTP จริงสำหรับ prod (มีแต่ Mailpit) | 🔴 High | **user ต้องให้ค่า** (DevOps ต่อสายให้) |
| 9 | `GOOGLE_CLIENT_SECRET` ว่าง → Google OAuth route คืน 503 (by design, แต่ prod ต้องเติม) | 🔴 High | **user ต้องให้ค่า** |
| 10 | ไม่มี test suite / test runner เลยทั้ง repo — `npm run test` เป็น no-op | 🟡 Low (รู้ไว้ ไม่ใช่ DevOps scope) | Dev/QA |
| 11 | ไม่มี ESLint config จริง — `lint` script เป็น `echo "lint ok"` stub ทุก workspace | 🟡 Low | Dev scope |
| 12 | `docker-compose.yml` ไม่มี `restart:` policy บน service ไหนเลย | 🟠 Medium | DevOps ทำเองได้ |
| 13 | Migrations (`apps/api/prisma/migrations/`) — ตรวจแล้ว **อยู่ใน git ครบ** (5 migration + lock file) ✅ | ✅ Done | — |
| 14 | `.dockerignore` โอเคดีอยู่แล้ว (กัน node_modules/dist/.env/design-*/…) | ✅ Done | — |

**สรุป:** 🔴 High = 6 จุด, 🟠 Medium = 3 จุด, 🟡 Low = 3 จุด, ✅ ผ่านแล้ว = 2 จุด

---

## 1. CI Pipeline (GitHub Actions) — ร่างไฟล์

ยังไม่มี `.github/workflows/` เลย ปัจจุบัน repo มีแค่ `typecheck`/`build`/`lint`(stub)/`test`(no-op)
ผ่าน Turborepo ดังนั้น pipeline รอบแรกควรเป็น **install → typecheck → build** และเว้นช่องให้ `test`
ต่อได้ทันทีที่มี test runner จริง (ไม่ควรใส่ `npm run test` เข้า required gate ตอนนี้ เพราะไม่มี
suite ใด ๆ — จะ pass ลมๆ แล้วให้ความมั่นใจปลอม)

ข้อสังเกตสำคัญที่ทำให้ pipeline พังได้ถ้าไม่ระวัง: **`apps/api` ต้อง `prisma generate` ก่อน
`typecheck`/`build`** ไม่งั้น `@prisma/client` types จะไม่มี ทำให้ tsc fail

**ร่าง `.github/workflows/ci.yml`:**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  install-and-verify:
    name: Install → Typecheck → Build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies (workspace-aware, reproducible)
        run: npm ci

      # @prisma/client types must exist before tsc runs across the workspace.
      - name: Generate Prisma Client
        run: npx prisma generate --schema apps/api/prisma/schema.prisma

      - name: Lint
        run: npm run lint
        # NOTE: currently a no-op stub ("echo lint ok") in every workspace — kept in
        # the pipeline so it starts failing the moment real ESLint config lands.

      - name: Typecheck (all workspaces)
        run: npm run typecheck

      - name: Build (all workspaces)
        run: npm run build

      # --- Future: uncomment once a real test runner exists in any workspace ---
      # - name: Test
      #   run: npm run test

  docker-build-check:
    name: Docker images build (sanity check, not pushed)
    runs-on: ubuntu-latest
    needs: install-and-verify
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build api image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/api/Dockerfile
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build web image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/web/Dockerfile
          push: false
          build-args: |
            VITE_API_URL=https://api.placeholder.invalid
            VITE_COLLAB_URL=wss://api.placeholder.invalid
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**หมายเหตุการออกแบบ:**
- แยก job `docker-build-check` ออกจาก `install-and-verify` เพื่อให้ feedback เร็วสุดจาก
  typecheck/build ก่อน (fail fast) แล้วค่อยเสีย เวลากับ docker build
- ยังไม่ใส่ job "deploy" ใน CI นี้ — deploy ต้องรอ target platform ที่ user เลือก (ดู §7)
  เมื่อรู้ target แล้วค่อยเพิ่ม job push image + trigger deploy พร้อม environment protection rule
- `concurrency` กัน CI รันซ้ำซ้อนตอน push ถี่ ๆ บน branch เดียวกัน — ประหยัด minutes

---

## 2. Docker Prod Hardening

### 2.1 `apps/api/Dockerfile` — ข้อเสนอแก้ (ร่าง diff แนวคิด ยังไม่แก้ไฟล์จริง)

ปัญหาที่พบ:
1. ไม่มี `USER` → container รันเป็น root ทั้ง build และ runtime stage
2. `CMD ["sh", "-c", "npx prisma migrate deploy ... && node ..."]` — sh เป็น PID 1;
   แม้ dash/bash มัก exec-replace คำสั่งสุดท้ายใน `&&` chain (ทำให้ node ได้เป็น PID1 จริง
   ในทางปฏิบัติ) แต่พฤติกรรมนี้ **ผูกกับ shell implementation ไม่ใช่ guarantee ตาม spec**
   ทางที่ปลอดภัยกว่าคือเขียนให้ชัดด้วย `exec` หรือแยกเป็น entrypoint script
3. ไม่มี `HEALTHCHECK`
4. base image `node:20-slim` ไม่ได้ pin digest (แค่ tag) — tag ขยับได้เมื่อ Debian ปล่อย
   security patch ใหม่ (เป็นเรื่องดีสำหรับ patch แต่ทำให้ build ไม่ reproducible เป๊ะ)

ข้อเสนอ (ระดับแนวคิด — โครง diff):

```dockerfile
# ---------- runner ----------
FROM base AS runner
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh \
    # node:20-slim already ships a non-root "node" user (uid 1000) — reuse it,
    # just make sure it owns what it needs to read.
    && chown -R node:node /app
USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
```

```sh
#!/bin/sh
# apps/api/docker-entrypoint.sh
set -e
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
exec node apps/api/dist/apps/api/src/main.js
```

`exec` ตรงบรรทัดสุดท้ายการันตีว่า `node` แทนที่ shell process กลายเป็น PID 1 จริง ๆ
รับ `SIGTERM` ตรงจาก Docker/orchestrator ได้ทันที — จำเป็นสำหรับ graceful shutdown (ดู §2.3)

หมายเหตุ: `USER node` ต้องเช็คว่า `npx prisma migrate deploy` เขียนไฟล์ query-engine cache
ที่ path ที่ user `node` เขียนได้ — ควรทดสอบจริงก่อน merge (`docker run` แล้วดู exit code)
เพราะบาง Prisma version พยายาม download/cache engine binary ที่ runtime ถ้า path ไม่ตรง
(ปกติไม่เกิดถ้า `prisma generate` รันไปแล้วตอน build stage และ copy `.prisma` มาครบ)

### 2.2 `apps/web/Dockerfile` — ข้อเสนอ

nginx image (`nginx:1.27-alpine`) โดย design master process รันเป็น root เพื่อ bind port 80
แต่ worker process (ตัวที่เสิร์ฟ request จริง) drop privilege ไปเป็น user `nginx` อยู่แล้ว —
นี่คือพฤติกรรม standard ของ stock nginx image ถือว่ายอมรับได้สำหรับงานนี้ ไม่จำเป็นต้องเปลี่ยน
เป็น non-root image (เช่น `nginxinc/nginx-unprivileged`) เว้นแต่ platform เป้าหมาย (เช่น
OpenShift, some k8s policies) บังคับ non-root ทั้ง process รวมถึง master — ถ้า user ยืนยัน
target platform นั้น ค่อยสลับ image + เปลี่ยน `listen 80` → `listen 8080` ทีหลัง

เพิ่ม `HEALTHCHECK`:
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O- http://localhost:80/ >/dev/null || exit 1
```
(nginx:alpine มี `wget` จาก busybox อยู่แล้ว ไม่ต้องติดตั้งเพิ่ม)

### 2.3 `apps/api/src/main.ts` — graceful shutdown (แจ้ง Dev, ไม่ใช่ DevOps แก้เอง)

`app.enableShutdownHooks()` ไม่ได้ถูกเรียกใน `bootstrap()` → เมื่อ container ได้รับ `SIGTERM`
(ตอน rolling deploy / scale down) NestJS **จะไม่เรียก** `CollabService.onModuleDestroy()` ที่มี
`await this.server?.destroy()` สำหรับปิด Hocuspocus WS server ให้เรียบร้อย ผลคือ:
- client ที่เปิด collab session ค้างอยู่จะหลุดแบบไม่มี close handshake
- Prisma connection pool อาจไม่ถูกปิดสะอาด

ข้อเสนอ 1 บรรทัด (ให้ `senior-fullstack-dev` เพิ่ม ไม่ใช่งาน infra โดยตรง):
```ts
const app = await NestFactory.create(AppModule)
app.enableShutdownHooks()   // <-- เพิ่มบรรทัดนี้
```
ต้องคู่กับ §2.1 ข้อ 2 (ทำให้ node เป็น PID1 จริง) ไม่งั้น SIGTERM ไปไม่ถึง process ตั้งแต่แรก
— สองอันนี้เป็น pair ที่ต้องแก้พร้อมกันถึงจะได้ผล

### 2.4 image size

ทั้งสอง Dockerfile เป็น multi-stage อยู่แล้ว (ดี) และ runner stage ของ api ใช้ `npm ci --omit=dev`
แยกจาก build stage — ไม่ลาก devDependencies เข้า image สุดท้าย ถือว่าโครงสร้างดีอยู่แล้ว
ไม่มีอะไรต้องแก้เพิ่มด้าน size นอกจากที่ระบุใน §2.1

---

## 3. Health Check

**พบว่ามีอยู่แล้ว:** `apps/api/src/app.controller.ts` มี `GET /health` คืน
`{ status, timestamp, service, version }` — เป็น **liveness check** ที่ดี (บอกว่า process
ยังตอบสนองอยู่) แต่ **ไม่ได้เช็ค DB connectivity** เลย

ข้อเสนอ (ไม่บังคับ, priority ต่ำ — ปัจจุบันใช้งานได้):
- เพิ่ม `GET /health/ready` ที่ query DB แบบเบา ๆ (`SELECT 1` ผ่าน Prisma) แยกจาก
  `/health` (liveness) — มาตรฐาน k8s คือ liveness ≠ readiness เพื่อไม่ให้ pod ถูก restart
  วนลูปตอน DB ล่มชั่วคราว (ถ้า liveness fail ตอน DB ล่ม, orchestrator จะ restart container
  ซ้ำ ๆ ทั้งที่ process เองยังโอเค — restart ไม่ช่วยอะไรเพราะ DB ยังล่มอยู่)
- ใช้ `/health` (liveness) ใน Docker `HEALTHCHECK` (§2.1) และใช้ `/health/ready`
  (ถ้าเพิ่ม) เป็น readiness probe แยกถ้า deploy บน k8s ในอนาคต

ใช้ compose ปัจจุบันได้เลยกับ `/health` ที่มีอยู่แล้ว — ไม่ต้องรอ endpoint ใหม่

---

## 4. Secrets & Env Management (โครงสร้างสำหรับ prod)

สถานการณ์ตอนนี้: `docker-compose.yml` ใส่ค่า dev ตรง ๆ ในไฟล์ (`JWT_SECRET:
change-me-in-production-at-least-32-chars` ฯลฯ) — **ใช้ได้เฉพาะ local** ห้ามลอกไปใช้ prod
ตรง ๆ (ค่าเหล่านี้ commit อยู่ใน git แล้ว = ทุกคนที่เห็น repo รู้ค่า)

**ข้อเสนอโครง (DevOps ทำได้ทันที ไม่ต้องรอ secret จริง):**

1. สร้าง `docker-compose.prod.yml` เป็น overlay ที่ไม่ hardcode ค่า แต่ใช้ `${VAR}`
   substitution จาก environment ของ host/CI แทน:
   ```yaml
   services:
     api:
       environment:
         DATABASE_URL: ${DATABASE_URL}
         DIRECT_URL: ${DIRECT_URL}
         JWT_SECRET: ${JWT_SECRET}
         JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
         SMTP_HOST: ${SMTP_HOST}
         SMTP_PORT: ${SMTP_PORT}
         SMTP_USER: ${SMTP_USER}
         SMTP_PASS: ${SMTP_PASS}
         GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
         CORS_ORIGINS: ${CORS_ORIGINS}
         WEB_URL: ${WEB_URL}
       restart: unless-stopped
     web:
       restart: unless-stopped
   ```
   รันด้วย `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
   หรือถ้า deploy platform เป็น managed service (Railway/Render/Fly.io/ECS) ให้ตั้งค่า
   env var ผ่าน dashboard/secret store ของ platform นั้นแทนไฟล์ compose ไปเลย
   — **ต้องรู้ target platform ก่อนถึงจะฟันธง**ได้ว่าใช้ overlay compose หรือ
   platform-native secret store (ดู open question ท้ายเอกสาร)

2. สร้าง `.env.production.example` (เอกสารเฉย ๆ ไม่มีค่าจริง) เพื่อบอกว่า prod ต้องตั้ง
   env อะไรบ้าง — ใช้ list เดียวกับ Checklist §6 ด้านล่าง

3. เพิ่มบรรทัดใน README/RUNBOOK: **ห้าม commit `.env`, `.env.production`, หรือค่า
   secret ใด ๆ ลง git** — `.gitignore` ปัจจุบันกัน `.env*` ไว้แล้ว (ตรวจแล้ว ครอบคลุมดี)
   แต่ `docker-compose.yml` เองไม่ใช่ `.env` จึงไม่ถูกกัน — เป็นเหตุผลที่ต้องแยกเป็น
   overlay/`.env` แทนการใส่ค่า prod ตรงในไฟล์ compose หลัก

4. แนะนำ (ไม่บังคับ): ใช้ secret scanning บน CI เช่น `gitleaks` step เพิ่มใน
   `ci.yml` เพื่อกัน secret หลุดเข้า commit ในอนาคต — เพิ่มได้เป็น job เสริมทีหลัง

---

## 5. SMTP จริง (Production Email)

Dev ใช้ Mailpit (`SMTP_HOST=mailpit`, ไม่ auth) — `MailService`
(`apps/api/src/mail/mail.service.ts`) อ่านค่าเป็น `SMTP_HOST/PORT/USER/PASS/SECURE` ผ่าน
`ConfigService` อยู่แล้ว รองรับ SMTP มาตรฐานได้ทันทีโดยไม่ต้องแก้โค้ด — **แค่ตั้ง env ให้ถูก**

ตัวเลือกที่แนะนำ (เลือกอย่างใดอย่างหนึ่ง แล้วแจ้ง env ให้ user กรอก):

| Provider | SMTP_HOST | SMTP_PORT | SMTP_SECURE | หมายเหตุ |
|---|---|---|---|---|
| SendGrid | `smtp.sendgrid.net` | 587 | false | `SMTP_USER=apikey`, `SMTP_PASS=<API key>` |
| AWS SES | `email-smtp.<region>.amazonaws.com` | 587 | false | ต้องขอ SES SMTP credentials แยกจาก IAM key ปกติ + verify domain/sender |
| Resend | `smtp.resend.com` | 587 | false | repo มี `resend` package ใน dependencies อยู่แล้ว (ยังไม่ได้ใช้ในโค้ดปัจจุบัน — ใช้ path SMTP ผ่าน nodemailer ได้เลยโดยไม่ต้องแก้โค้ด) |

ข้อสังเกต: `dependencies` ของ `apps/api` มี `resend` อยู่แล้วแต่ `mail.service.ts` ไม่ได้ import
ใช้ — ปัจจุบันส่งผ่าน `nodemailer` + SMTP เท่านั้น ถ้า user อยากใช้ Resend HTTP API แทน SMTP
(เร็วกว่า/reliable กว่า SMTP relay) จะเป็นงาน dev เพิ่ม (ปรับ `mail.service.ts`) ไม่ใช่แค่ตั้ง env —
แจ้งเป็นทางเลือกไว้เฉย ๆ ไม่ใช่ requirement รอบนี้

**สิ่งที่ต้องขอจาก user:** ดู Checklist §6

---

## 6. Google OAuth

`GoogleGuard` (`apps/api/src/auth/guards/google.guard.ts`) ออกแบบไว้ดีแล้ว: ถ้า
`GOOGLE_CLIENT_SECRET` ว่าง จะคืน `503 Service Unavailable` พร้อม
`code: 'google-oauth-unconfigured'` แทนที่จะ crash หรือ throw error แปลก ๆ ตอน
bootstrap (เพราะ `passport-google-oauth20` throw ตอน construct ถ้า client id/secret ว่าง —
โค้ดจึงต้อง conditionally register strategy) — นี่คือ pattern ที่ถูกต้อง ไม่ต้องแก้อะไร

สิ่งที่ยังขาดคือ **ค่าจริง**:
- `GOOGLE_CLIENT_ID` มีค่า placeholder อยู่ใน `.env.example` แล้ว (`297471...apps.googleusercontent.com`)
  — ต้องยืนยันว่านี่คือ client ID ของ **OAuth consent screen ที่ตั้งค่าแล้วจริง** ใน Google
  Cloud Console (มี authorized redirect URI ตรงกับ `GOOGLE_CALLBACK_URL` ของ prod domain) หรือ
  เป็นแค่ placeholder ที่ต้องสร้างใหม่
- `GOOGLE_CLIENT_SECRET` ว่างเปล่า — ต้องไปสร้าง/คัดลอกจาก Google Cloud Console →
  APIs & Services → Credentials → OAuth 2.0 Client
- `GOOGLE_CALLBACK_URL` ต้องเปลี่ยนจาก `http://localhost:3001/auth/google/callback` เป็น
  prod domain จริง (เช่น `https://api.taskboard.example.com/auth/google/callback`) **และ**
  ต้องเพิ่ม URI นี้เข้า "Authorized redirect URIs" ในฝั่ง Google Cloud Console ด้วย
  (ไม่งั้น Google จะปฏิเสธ callback ด้วย `redirect_uri_mismatch`)

**สิ่งที่ต้องขอจาก user:** ดู Checklist §6 ด้านล่าง (ใช้เลขหัวข้อเดียวกัน รวมเป็นก้อนเดียว)

---

## 7. Migrations — ยืนยันสถานะ

ตรวจด้วย `git ls-files apps/api/prisma/migrations/` แล้ว: **migrations อยู่ใน git ครบ**
(5 migration folders + `migration_lock.toml`) — ตรงกับที่ระบุว่าเพิ่งแก้ให้แล้ว ✅ ไม่มี action
เพิ่มเติมจาก DevOps ในหัวข้อนี้

`prisma migrate deploy` ที่รันตอน container boot (ทั้งใน `apps/api/Dockerfile` CMD และ
README) ปลอดภัยสำหรับ production ด้วยเหตุผล:
- `migrate deploy` (ต่างจาก `migrate dev`) **ไม่สร้าง migration ใหม่และไม่ prompt** —
  แค่ apply migration ที่มีอยู่แล้วตามลำดับ ที่ยังไม่ apply เท่านั้น เหมาะกับ CI/CD
- idempotent — รันซ้ำได้ปลอดภัยถ้าไม่มี migration ใหม่ (no-op)
- ใช้ `directUrl` (session connection, ไม่ผ่าน pgbouncer) ตามที่ config ไว้ใน
  `schema.prisma` (`directUrl = env("DIRECT_URL")`) — ถูกต้องแล้ว เพราะ migration
  ต้องการ session-level lock ที่ connection pooler (pgbouncer transaction mode) ทำไม่ได้

**ความเสี่ยงเดียวที่ควรรู้ (ไม่ใช่บั๊ก แค่ข้อจำกัดของ pattern นี้):** ถ้า deploy
หลาย replica ของ `api` container พร้อมกัน (เช่น scale-up บน ECS/k8s) แต่ละ replica
จะพยายามรัน `migrate deploy` ตอน boot พร้อมกัน — Prisma มี advisory lock กันชนอยู่แล้ว
(replica อื่นจะรอ) จึงไม่พังแต่จะทำให้ boot ของ replica ที่ต้องรอช้าลงเล็กน้อย ถ้าอนาคต
scale เป็น multi-replica จริงจัง แนะนำแยก migration ออกเป็น step ต่างหากใน deploy
pipeline (run once ก่อน rolling update) แทนการฝังใน container CMD — ไม่ใช่ปัญหาตอนนี้
เพราะ scope ปัจจุบันคือ single-instance deploy

---

## 8. Secrets & Manual-Steps Checklist — แยกให้ชัด

### ✅ DevOps ทำเองได้ (ไม่ต้องรอค่าจากใคร)

- [ ] เพิ่ม `.github/workflows/ci.yml` ตามร่าง §1
- [ ] แก้ `apps/api/Dockerfile`: เพิ่ม `USER node`, `HEALTHCHECK`, entrypoint script
      พร้อม `exec` (§2.1)
- [ ] แก้ `apps/web/Dockerfile`: เพิ่ม `HEALTHCHECK` (§2.2)
- [ ] เพิ่ม `restart: unless-stopped` ให้ทุก service ใน `docker-compose.yml`
- [ ] สร้าง `docker-compose.prod.yml` overlay + `.env.production.example` (§4)
- [ ] เขียน `ops/RUNBOOK.md` (deploy / rollback / health check / ดู log)
- [ ] เสนอ diff 1 บรรทัด `app.enableShutdownHooks()` ให้ `senior-fullstack-dev` merge (§2.3)
- [ ] (ทางเลือก) เพิ่ม `/health/ready` endpoint spec ให้ dev ทำ (§3)
- [ ] (ทางเลือก) เพิ่ม `gitleaks` secret-scan step ใน CI (§4.4)

### 🔑 ต้องขอค่าจากเจ้าของโปรเจกต์ (DevOps/AI ไม่มีสิทธิ์เดาหรือสร้างเอง)

| Env var | ใช้ที่ไหน | ต้องขออะไร |
|---|---|---|
| `DATABASE_URL` (prod) | Prisma runtime, pooled | connection string จาก Supabase (หรือ Postgres provider จริง) — pooled `:6543?pgbouncer=true` |
| `DIRECT_URL` (prod) | Prisma migration | connection string session-mode `:5432` จาก provider เดียวกัน |
| `JWT_SECRET` (prod) | sign access token | สุ่มค่าใหม่ ≥32 ตัวอักษร **ห้ามใช้ค่า dev เดิมจาก compose** — DevOps generate ให้ได้ (`openssl rand -base64 48`) แต่ user ต้องเป็นคนเก็บ/อนุมัติเข้า secret store จริง |
| `JWT_REFRESH_SECRET` (prod) | sign refresh token | เหมือนด้านบน ต้องต่างจาก `JWT_SECRET` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` (prod) | ส่งอีเมลจริง (verify/reset/invite) | เลือก provider (SendGrid/SES/Resend ฯลฯ ดู §5) แล้วให้ credentials จริง — DevOps ต่อสายให้ทันทีที่ได้ค่า |
| `EMAIL_FROM` (prod) | From address | ต้องเป็น domain ที่ verify กับ SMTP provider แล้ว (SPF/DKIM ตั้งไว้) ไม่งั้นเมลจะเข้า spam/ถูก reject |
| `GOOGLE_CLIENT_ID` (prod) | Google OAuth | ยืนยันว่า client ID ปัจจุบันใน `.env.example` ใช้ prod ได้จริงหรือไม่ ถ้าไม่ต้องสร้างใหม่ |
| `GOOGLE_CLIENT_SECRET` (prod) | Google OAuth | จาก Google Cloud Console → Credentials — **ปัจจุบันว่าง route จะคืน 503 จนกว่าจะเติม** |
| `GOOGLE_CALLBACK_URL` (prod) | Google OAuth redirect | domain จริงของ prod API + ต้องไปเพิ่มใน Google Cloud Console → Authorized redirect URIs ด้วย |
| `CORS_ORIGINS` (prod) | `main.ts` CORS allowlist | domain จริงของ web SPA prod (เช่น `https://taskboard.example.com`) — ถ้าไม่ตั้งถูก SPA จะเรียก API ไม่ได้เลย (CORS reject) |
| `WEB_URL` (prod) | ใช้สร้างลิงก์ในอีเมล (verify/reset/invite) | domain จริงของ web SPA — ถ้าใส่ผิดลิงก์ในอีเมลจะพาไปหน้าเว็บที่ไม่มีอยู่ |
| `VITE_API_URL` / `VITE_COLLAB_URL` (build-time, web) | ฝังใน SPA bundle ตอน build | domain จริงของ prod API (`https://...`) และ collab WS (`wss://...`) — **ผิดแล้วต้อง rebuild image ใหม่** เพราะ Vite bake เข้า bundle ตอน build ไม่ใช่ runtime env |
| Deploy target/platform | ตัดสินใจว่า overlay compose แบบไหน (§4) เหมาะกับ deploy จริง | ยังไม่รู้ว่าจะ deploy ที่ไหน (VPS ธรรมดา รัน `docker compose`? Railway/Render/Fly.io? AWS ECS/EKS?) — เป็น open question ที่ต้องตอบก่อนเขียน RUNBOOK รอบ deploy จริง |

**ทำไม DevOps เติมเองไม่ได้:** ค่าเหล่านี้ผูกกับ account/infrastructure จริงของเจ้าของโปรเจกต์
(Supabase project, Google Cloud project, SMTP provider account, domain name) — การเดาหรือ
generate ค่าที่ผิด (เช่น domain ผิด, Google callback URI ไม่ตรง) จะทำให้ auth/email พังแบบ
เงียบ ๆ ตอน production ซึ่งแก้ยากกว่าถามล่วงหน้า

---

## 9. Open Questions (ต้องตอบก่อนลงมือ deploy จริง)

1. **Deploy target คือที่ไหน?** VPS เดี่ยว + `docker compose up`, หรือ managed platform
   (Railway/Render/Fly.io), หรือ AWS/GCP (ECS/Cloud Run/k8s)? กำหนดว่า secret management
   ใช้ compose overlay + `.env` file หรือ platform-native secret store
2. **Domain/TLS**: มี domain จริงหรือยัง? ใครจัดการ TLS (Let's Encrypt ผ่าน nginx/Caddy,
   หรือ platform จัดการให้ เช่น Cloudflare/ALB)? ปัจจุบัน `nginx.conf` เสิร์ฟ HTTP เท่านั้น
   ไม่มี TLS termination ในนั้น (สมมติว่ามี reverse proxy/LB ชั้นหน้าจัดการ TLS ให้ —
   ต้องยืนยัน)
3. **Scale เดี่ยวหรือหลาย replica?** ผลต่อ pattern ของ migration-on-boot (§7) และว่าจะ
   ต้อง sticky-session สำหรับ WebSocket (Hocuspocus บนพอร์ต :3001 ร่วมกับ api) หรือไม่ถ้ามีมากกว่า 1 instance
4. **Log/metrics aggregation** ต้องการไหม? ตอนนี้ log เป็น `console.log`/Nest Logger
   ธรรมดา ไม่มี structured JSON logging หรือส่งไป log aggregator — ยังไม่ระบุใน scope
   รอบนี้ (prompt ไม่ได้ขอ) แต่ควรเป็น sprint ถัดไปถ้า prod จริงจัง

---

## 10. สิ่งที่ยังไม่ทำในรอบนี้ (ตามข้อห้าม)

- ไม่ได้แก้ไฟล์ config จริงใด ๆ ใน repo (Dockerfile, docker-compose.yml, main.ts ฯลฯ
  ยังเหมือนเดิมทุกไฟล์) — เนื้อหาทั้งหมดข้างบนเป็น **ร่าง/ข้อเสนอ** เท่านั้น
- ไม่ได้รัน `npm run dev`/`build` เต็ม ๆ อ่านโค้ดอย่างเดียวตามขอบเขต
- ไม่ได้ `git commit`/`git push` ใด ๆ (ไฟล์นี้เป็นไฟล์ใหม่ที่ยังไม่ add เข้า git)
- ไม่ได้แตะ 4 โฟลเดอร์ `*-ไม่ได้เกี่ยวข้องกับตัวจริง`
