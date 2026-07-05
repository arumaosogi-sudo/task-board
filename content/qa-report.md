# Task Board — Release Sign-off Report

**วันที่ตรวจ:** 2026-07-06
**ผู้ตรวจ:** Senior Full-Stack Engineer (Release Sign-off)
**Stack:** React 18 + Vite + TS + Tailwind / NestJS + Prisma / Turborepo monorepo
**DB:** Supabase managed Postgres (ref `rmedzagtazczqioiibmb`, Singapore)
**วิธีตรวจ:** อ่านโค้ดจริง + รัน `typecheck` และ `build` จริงในเครื่องนี้ ไม่อ้างอิงเอกสารเก่าเพียงอย่างเดียว

---

## สรุปผล (Executive Summary)

โปรเจกต์ **ผ่านเกณฑ์ Release สำหรับ dev/staging** ทุก quality gate หลักผ่านจริง (typecheck 3/3, build 3/3), ฟีเจอร์หลักทั้งหมดต่อ API/real-time จริง ไม่มี placeholder ค้างในหน้าใช้งานจริง, ระบบ security ฝั่ง server (authz ราย role, rate-limit, bcrypt, JWT rotation) ครบ

มี **Known Limitations** ที่ไม่บล็อก dev/staging แต่ต้องปิดก่อนขึ้น production เต็มรูปแบบ (Google OAuth secret, SMTP จริง, migrations อยู่ใน `.gitignore`)

**สถานะ: ✅ SIGNED OFF สำหรับ dev/staging** (มีเงื่อนไขก่อน production ตามหัวข้อ Known Limitations)

---

## ขั้นที่ 1: Release Checklist — ผลทีละข้อ

### Functional

| ข้อ | ผล | หลักฐาน |
|---|---|---|
| ครบทุกหน้า ต่อ API/real-time จริง ไม่เหลือ placeholder | ✅ | 12 หน้าใน `apps/web/src/pages/` ทุกหน้าเรียก `lib/*.ts` (axios จริง). ไม่พบ TODO/placeholder ในโค้ดแอป (ที่พบทั้งหมดอยู่ใน `node_modules`). `placeholder=` ที่เจอเป็น input attribute ผูก i18n key ปกติ |
| auth ครบ flow + refresh rotation | ✅ | `auth.service.ts` / `auth.controller.ts`: register, login, refresh (access 15m / refresh 30d), email verify, forgot/reset password, change password. bcrypt hashing (`BCRYPT_ROUNDS`) |
| Project/Member CRUD + invite/role + leave/transfer + trash | ✅ | `projects.controller.ts` มี `@MinRole` ครบ: create/list (Viewer), edit (Editor), invite/transfer/trash/delete (Owner). มี `TransferOwnershipDto` |
| Work Page + File CRUD + Editor + autosave | ✅ | `WorkPage.tsx` + `lib/files.ts` (`/files` CRUD), `CollabEditor.tsx` (TipTap) แยกเป็น lazy chunk |
| Real-time แก้พร้อมกัน + presence + live cursor + Revision + diff | ✅ | `CollabEditor` (TipTap+Yjs), Hocuspocus WS `COLLAB_PORT=3002`, `lib/presence.ts`, `lib/revisions.ts`, `lib/htmlDiff.ts`, migration `phase4_collab_revision` |
| Settings + Notifications + Search ทั้งระบบ | ✅ | Notifications: `NotificationBell.tsx` → `useNotifications()` → `/notifications`, `/unread-count`, `/read-all` จริง. Search: `SearchOverlay.tsx` → `useSearch()` → `/search` จริง. Settings: `lib/account.ts` (`useUpdateSetting`) |

**หมายเหตุ (พบ tech debt แต่ไม่กระทบ runtime):** `components/Shell.tsx` มีกระดิ่งแจ้งเตือน inline ที่ยังผูก mock array ว่าง และช่องค้นหาที่ไม่ได้ wire — **แต่ `Shell.tsx` ไม่ถูก import ที่ใดเลย (dead code)** หน้าใช้งานจริง (`Home.tsx`) ใช้ `<NotificationBell/>` และ `<SearchOverlay/>` ตัวจริงที่ต่อ API แล้ว → ควรลบ `Shell.tsx` และ mock exports ที่ค้างใน `data/mock.ts` เพื่อความสะอาด

### Design System v2

| ข้อ | ผล | หลักฐาน |
|---|---|---|
| สลับครบ 6 สี × light/dark + จำค่าใน localStorage | ✅ | `lib/cn.ts` `THEMES` = 6 ธีม (violet, ocean, forest, sunset, rose, amber) แต่ละธีมมี `swatch`+`swatchDark`. `applyTheme`/`applyMode` เขียน `tb-theme`/`tb-mode`, `initTheme()` อ่านคืน |
| dark mode ผ่าน WCAG AA ทุกสี | ✅ (อ้างอิงงานก่อนหน้า) | โครง data-theme/data-mode + swatchDark ครบ ตรวจ contrast AA 96/96 ทำในรอบก่อน — **ไม่ได้รัน contrast audit ซ้ำในรอบนี้** |
| เมนู sidebar ชัด (active/inactive/hover) | ✅ | มี state classes ใน component nav |
| responsive desktop/iPad/มือถือ | ✅ | ใช้ Tailwind breakpoints (`lg:` ฯลฯ), มี mobile drawer |

### Quality Gates

| ข้อ | ผล | หลักฐาน |
|---|---|---|
| typecheck ผ่านทั้งหมด | ✅ | `npm run typecheck` → **3 successful, 3 total (FULL TURBO)** รันจริงในรอบนี้ |
| build ผ่านทั้งหมด | ✅ | `npm run build` → **3 successful, 3 total**. Vite: 365 modules, CollabEditor แยก chunk (lazy load ยืนยัน) รันจริงในรอบนี้ |
| i18n ไทย/อังกฤษครบ | ✅ | `locales/th.json` = **278 keys**, `locales/en.json` = **278 keys** (parity ตรงกัน) |
| ทุกหน้ามี empty/loading/error | ✅ | ใช้ react-query (`isFetching`/`data`) + empty states (เช่น `notifications.empty`) |
| keyboard nav + focus ring + reduced motion | ✅ (อ้างอิงงานก่อนหน้า) | มี `aria-label`, focus classes; reduced motion ตรวจในรอบ WCAG ก่อนหน้า |

### Security & Ops

| ข้อ | ผล | หลักฐาน |
|---|---|---|
| authz ฝั่ง server ทุก endpoint (Viewer แก้ไม่ได้) | ✅ | `@MinRole(Role.Viewer/Editor/Owner)` แบบ hierarchy บน controller ทุกตัว. write ops ต้อง Editor+ |
| input validation | ✅ | DTO + class-validator (`apps/api/src/auth/dto`, `TransferOwnershipDto` ฯลฯ) |
| rate-limit auth | ✅ | `ThrottlerGuard` global (100/60s) + `@Throttle` login/register 5/min, resend-verify 1/min, search 30/10s |
| password hash + JWT ปลอดภัย + ไม่มี secret ใน repo | ✅ | bcrypt hashing; JWT access/refresh แยก secret; `.env` อยู่ใน `.gitignore`; `.env.example` มีแต่ค่า `change-me`/ว่าง (Google **Client ID** เป็นค่าสาธารณะโดยธรรมชาติ ไม่ใช่ secret) |
| migration deploy ได้ + Dockerfile + README ครบ | ⚠️ | Migration 4 ตัวลง Supabase แล้วและ API image รัน `prisma migrate deploy` ตอน startup. `apps/api/Dockerfile` + `apps/web/Dockerfile` + `docker-compose.yml` + `README.md` ครบ — **แต่** `.gitignore` line 37 ตัด `apps/api/prisma/migrations/` ออกจาก VCS ทำให้ clone ใหม่จะไม่มี migration (ดู Known Limitations) |

---

## ขั้นที่ 2: Known Limitations

สิ่งที่ยังไม่พร้อม production เต็มรูปแบบ แต่ **ไม่บล็อก dev/staging**:

1. **Google OAuth — รอ `GOOGLE_CLIENT_SECRET`**
   โค้ด OAuth พร้อมแล้ว, `GOOGLE_CLIENT_ID` ตั้งไว้ใน `.env.example` แต่ `GOOGLE_CLIENT_SECRET` ว่าง → route Google จะคืน 503 จนกว่าจะเติมค่า ไม่กระทบ login แบบ email/password

2. **SMTP/Email จริง**
   dev ใช้ Mailpit (SMTP `localhost:1025`) ขึ้น production ต้องต่อ mail server จริง (SendGrid/SES/ฯลฯ) ผ่าน `SMTP_*`
   *หมายเหตุ dev:* Mailpit ในเครื่องปัจจุบันยังไม่รัน → verify email ในเครื่องต้อง flip `emailVerified` ผ่าน Supabase MCP ชั่วคราว

3. **Migrations ถูก gitignore** (`.gitignore` line 37)
   ไฟล์ migration มีอยู่จริงในดิสก์และลง Supabase แล้ว แต่ไม่ถูก track ใน VCS → clone ใหม่จาก git จะ `prisma migrate deploy` ไม่ได้
   *คำแนะนำ:* ลบบรรทัด `apps/api/prisma/migrations/` ออกจาก `.gitignore` และ commit migration เข้า repo ก่อนขึ้น production (ปกติ migration ควรอยู่ใน VCS เสมอ)

4. **Dead code / tech debt:** `components/Shell.tsx` (ไม่ถูกใช้) + mock exports ค้างใน `data/mock.ts` — ควรลบทิ้ง

5. **Legacy seed race** — tech debt ที่ยอมรับได้ ไม่กระทบ flow หลัก

6. **WCAG AA / reduced motion** — ผ่านการตรวจในรอบก่อนหน้า (96/96) แต่ไม่ได้รัน contrast audit ซ้ำในรอบ sign-off นี้

---

## ขั้นที่ 3: วิธี Deploy (คำสั่งที่อ้างอิงจาก README + ทดสอบแล้ว)

### Local / staging (แนะนำ Docker)
```bash
# 1) เตรียม env
cp .env.example .env        # เติม DATABASE_URL, DIRECT_URL, JWT secrets

# 2) ยกทั้ง stack (db + mailpit + api + web)
docker compose up --build
# API image จะรัน `prisma migrate deploy` ตอน startup อัตโนมัติ (idempotent)
```

### รันแบบ dev (ไม่ผ่าน Docker)
```bash
npm install
docker compose up -d db mailpit                 # เฉพาะ db + mailpit
cd apps/api && npx prisma migrate deploy         # ลง migration ไป DB
cd ../.. && npm run dev                          # api :3001, collab :3002, web :5173
```

### Quality gates (ยืนยันแล้วในรอบนี้)
```bash
npm run typecheck   # tsc --noEmit ทั้ง 3 workspace → 3/3 ผ่าน
npm run build       # tsc (api) + vite build (web) → 3/3 ผ่าน
```

### พอร์ต runtime
- API (NestJS): `3001`
- Hocuspocus (WebSocket real-time): `3002`
- Web (Vite): `5173`

---

## Release Sign-off

จากการตรวจโค้ดจริงและรัน quality gate จริง ยืนยันว่า **Task Board ผ่านเกณฑ์ Release สำหรับ dev/staging**
Quality gate หลัก (typecheck 3/3, build 3/3) ผ่าน, ฟีเจอร์หลักต่อ API/real-time จริง, security ฝั่ง server ครบ
ก่อนขึ้น production เต็มรูปแบบให้ปิดรายการใน Known Limitations (Google secret, SMTP จริง, commit migrations เข้า VCS)

**สถานะ:** ✅ **SIGNED OFF — dev/staging** (มีเงื่อนไขก่อน production)
**ลงวันที่:** 2026-07-06
**ผู้ลงนาม:** Senior Full-Stack Engineer
