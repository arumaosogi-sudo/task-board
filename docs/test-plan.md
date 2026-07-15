# Task Board — Coverage Plan (จัดลำดับตามความเสี่ยง)

> คู่กับ [ADR 0001 — Test Strategy](decisions/0001-test-strategy.md)
> เอกสารนี้คือ **backlog เทสต์ที่จัดลำดับแล้ว** ส่งต่อให้ dev รอบถัดไปหยิบทำเรียงจากบนลงล่าง
> เกณฑ์จัดลำดับ: **Security → Data-integrity → Core flow → ส่วนที่เหลือ**
> Sprint 2 รอบนี้วางแค่ **ฐาน (smoke × 4)** ที่ทำเสร็จแล้ว — ตารางด้านล่างคือสิ่งที่ยังต้องเขียน

## สถานะปัจจุบัน (Sprint 2 — ฐาน)

| ไฟล์เทสต์ | ครอบ | ชนิด | ต้องมี DB/browser? |
|---|---|---|---|
| `apps/api/src/auth/token.util.spec.ts` | `hashToken`, `generateOpaqueToken` | unit | ไม่ |
| `apps/api/src/projects/decorators/min-role.decorator.spec.ts` | `ROLE_RANK` hierarchy | unit | ไม่ |
| `apps/web/src/lib/htmlDiff.test.ts` | `htmlToLines`, `diffHtml` | unit (jsdom) | ไม่ |
| `apps/web/src/components/ui.test.tsx` | `<Button>` render | component | ไม่ |

รวม **19 เทสต์ผ่านทั้งหมด** — พิสูจน์ว่า toolchain ทั้ง 2 ฝั่งรันเขียวจริง

---

## ลำดับที่ต้องเขียนต่อ (เรียงจากความเสี่ยงสูงสุด)

### 🔴 P0 — Security / Authorization (เขียนก่อน)

1. **`ProjectRoleGuard` + `@MinRole`** — `apps/api/src/projects/guards/project-role.guard.ts`
   - non-member ได้ **404** ไม่ใช่ 403 (ไม่ leak การมีอยู่ของ project)
   - role ต่ำกว่า `@MinRole` → **403 `insufficient-role`**; role พอ → ผ่าน + attach `req.membership`
   - ไม่มี `user`/`projectId` → 404
   - *ชนิด:* integration (mock `PrismaService.membership.findUnique` + `Reflector`) — ไม่ต้องมี DB จริง

2. **IDOR guard — `FilesService.requireFile`** — `apps/api/src/files/files.service.ts:125`
   - ขอ `fileId` ที่อยู่คนละ `projectId` → ต้องโยน (ไม่คืนไฟล์ข้าม project)
   - ครอบผ่านทุกทางเข้า: `get`/`update`/`delete`/revisions ที่เรียก `requireFile`
   - *ชนิด:* integration (mock Prisma) — จุดนี้คือ IDOR ตัวเป็น ๆ ถ้าพลาดคือช่องโหว่

3. **Collab WS auth — `CollabService.authenticate`** — `apps/api/src/collab/collab.service.ts:86`
   - token ไม่ถูกต้อง/หมดอายุ → ปฏิเสธ connection
   - ไม่ใช่ member ของ document's project → ปฏิเสธ
   - `Viewer` → ถูกบังคับ **read-only**; `Editor`/`Owner` → เขียนได้
   - *ชนิด:* unit (mock `JwtService` + Prisma) เรียก `authenticate(payload)` ตรง ๆ

4. **Search scoping — `SearchService.search`** — `apps/api/src/search/search.service.ts:39`
   - ผู้ใช้ที่ไม่มี membership → คืน `EMPTY` (ไม่ query อะไรต่อ)
   - ผลลัพธ์จำกัดเฉพาะ `projectId` ที่ผู้ใช้เป็นสมาชิก (กัน cross-tenant leak)
   - *ชนิด:* integration (mock Prisma memberships)

### 🟠 P1 — Auth Flow (core, เขียนต่อจาก P0)

5. **`AuthService.register`** (`:94`) — hash password (bcrypt), กัน username/email ซ้ำ, ออก verify token (เก็บ **hash** ไม่ใช่ raw), ส่งเมล
6. **`AuthService.login`** (`:199`) — รหัสผิด → ปฏิเสธ, ยังไม่ verify email → พฤติกรรมที่กำหนด, สำเร็จ → ออก access+refresh
7. **`AuthService.rotateRefresh`** (`:231`) — **refresh rotation**: token เก่าใช้ซ้ำไม่ได้, ออกคู่ใหม่, detect reuse
8. **`AuthService.verifyEmail`** (`:246`) / **`resetPassword`** (`:292`) — token หมดอายุ/ผิด → ปฏิเสธ, lookup ด้วย `hashToken(raw)`
9. **`loginWithGoogle`** (`:310`) — link/create account จาก Google profile
   - *ชนิด:* integration (mock Prisma + MailService + JwtService)

### 🟡 P2 — Sprint 1 Hardening (กันของที่เพิ่ง fix ถอยหลัง)

10. **Email HTML escape — `escapeHtml`** ใน `apps/api/src/mail/mail.service.ts`
    - `<script>`, `"`, `'`, `&`, `<`, `>` ใน `projectName`/`inviterName` ต้องถูก escape ในส่วน `html`
    - ⚠️ ปัจจุบัน `escapeHtml` **ไม่ได้ export** — ต้อง refactor เล็กน้อยให้ testable (export ตัว helper หรือทดสอบผ่าน `sendInvitationEmail` ด้วย mock transporter แล้วตรวจ `html` payload) — ให้ dev เลือกวิธีที่ไม่กระทบ API สาธารณะ
11. **JWT boot-check** — แอป fail-fast เมื่อ `JWT_SECRET` หาย/อ่อน (ทดสอบตอน bootstrap/config validation)
12. **`/health/ready`** — `apps/api/src/app.controller.ts` — DB ปกติ → 200; DB ล่ม → 503
13. **Throttle username** — `@nestjs/throttler` บน login/register — เกิน limit → 429
    - *ชนิด:* ผสม unit + integration (Supertest ต้องรัน)

### 🟢 P3 — Web logic & components

14. `lib/api.ts` interceptor — แนบ token, refresh บน 401, redirect เมื่อ refresh fail
15. `lib/auth.tsx` context/provider — state transitions
16. Utilities อื่นใน `lib/` (`account.ts`, `notifications.ts`, `presence.ts`, `revisions.ts`)
17. Component สำคัญ: form validation, error/empty states

### 🔵 P4 — E2E (Playwright, ต้องมี stack จริง)

18. Happy-path: **register → verify email → login → เห็น dashboard**
19. สร้าง project → สร้าง file → แก้ไข → เห็น version history/diff
20. Real-time collab: 2 browser context แก้ document เดียวกัน เห็น presence + sync

---

## เงื่อนไขปลดล็อกที่ยังขาด (สำหรับ dev รอบหน้า)

- **PostgreSQL ใน CI** (service container) + test DB + `prisma migrate deploy` → ปลดล็อก P0–P2 แบบ integration จริง (ถ้าเลือกไม่ mock)
- **Test data factory / fixtures** — helper สร้าง user/project/membership/file ซ้ำ ๆ
- **`@nestjs/testing` `Test.createTestingModule`** pattern กลาง สำหรับ wire module + override provider
- ตัดสินใจนโยบาย **mock vs. real DB**: P0/P1 mock Prisma ได้เร็วและพอ; แต่ auth flow + rotation ควรมีชั้น integration แตะ DB จริงอย่างน้อย 1 ชุด เพื่อจับ divergence ระหว่าง mock กับ schema จริง
