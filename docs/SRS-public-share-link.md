# Public Share Link — Software Requirements Specification

**Author:** srs-architect (Business Analyst) · **Version:** 1.0 · **สถานะ:** Draft — พร้อมส่งต่อ Dev
**อ่านคู่กับ:** `docs/decisions/0006-public-share-link-threat-model.md` (ADR 0006 — threat model + 3 open questions ที่ owner ตัดสินใจแล้วเมื่อ 2026-07-17 — **เอกสารนี้แปลงเป็นสเปก ไม่ตัดสินใจใหม่**), `docs/PROJECT_BRIEF-taskboard.md`, `docs/SRS-sprint4.md` (รูปแบบเอกสารอ้างอิง)

**สิ่งที่ตรวจโค้ดจริงก่อนเขียนสเปกนี้:** `apps/api/prisma/schema.prisma`, `apps/api/src/projects/guards/project-role.guard.ts`, `apps/api/src/projects/projects.controller.ts` + `projects.service.ts` (`updateMemberRole`/`removeMember`/`transferOwnership`), `apps/api/src/files/files.controller.ts`, `apps/api/src/files/assets.service.ts`, `apps/api/src/storage/supabase-storage.service.ts`, `apps/api/src/main.ts` (Helmet/CSP), `apps/api/src/search/search.controller.ts` (`@Throttle` pattern), `apps/web/src/App.tsx` + `ProtectedRoute.tsx`

**ขอบเขต:** Public read-only share link ต่อไฟล์เดียว (manual publish snapshot, asset-proxy, auto-revoke ตาม ADR 0006)
**นอกขอบเขต:** share ระดับ project, real-time mirror, anon เข้า collab WS, comment/revision/member ปรากฏใน public view — ทั้งหมดคือเงื่อนไข NO-GO ตาม ADR 0006 §6

---

## 1. Project Overview

- **Goal:** เปิดให้ Owner แชร์เนื้อหาไฟล์รายงาน 1 ไฟล์ให้บุคคลภายนอกที่ไม่มีบัญชี Task Board ดูได้ผ่านลิงก์สาธารณะ โดยไม่กระทบ trust boundary auth-gated เดิมของระบบ
- **User Story หลัก:** As an Owner ฉันต้องการสร้างลิงก์แชร์ไฟล์รายงานให้คนนอกทีมดูได้โดยไม่ต้อง login เพื่อส่งต่อผลงานให้ผู้มีส่วนได้ส่วนเสียภายนอกโดยไม่ต้อง invite เข้าเป็นสมาชิก project
- **Problem Statement:** ปัจจุบันการดูไฟล์ต้องเป็นสมาชิก project เท่านั้น (JWT + Membership ทุก route) — ไม่มีทางแชร์ "ดูอย่างเดียว" ให้คนนอกทีมโดยไม่ต้องสร้างบัญชีหรือรับ invite
- **Scope (IN):** สร้าง/เผยแพร่/เพิกถอนลิงก์ (Owner เท่านั้น), หน้า public viewer readonly นอก AppShell, asset-proxy สำหรับรูปภาพ, auto-revoke เมื่อผู้สร้างไม่ใช่ Owner แล้ว, manual publish snapshot (ไม่ real-time)
- **Scope (OUT):** share ระดับ project/หลายไฟล์, live/real-time mirror ของ `File.content`, anon เข้า Yjs collab WS, comment/revision/member/asset-ownership ปรากฏในหน้า public, การเปิด Supabase Storage bucket เป็น public ทั้งใบ
- **Key Assumptions:**
  1. **3 open questions ของ ADR 0006 ถือเป็นตัดสินใจสุดท้าย** (asset-proxy ใหม่ / manual publish snapshot / auto-revoke เมื่อผู้สร้างไม่ใช่ Owner) — เอกสารนี้แปลงเป็น AC เท่านั้น ไม่เปิดทางเลือกใหม่
  2. **จุด trigger จริงของ auto-revoke ต่างจากที่ ADR ระบุคร่าวๆ เล็กน้อย** — ADR §8 อ้างอิง `PATCH members/:userId` และ `DELETE members/:userId` เป็นจุด hook แต่จากการอ่าน `projects.service.ts` จริง (บรรทัด 181-212) ทั้งสอง endpoint นี้ **throw `BadRequestException` ทันทีถ้า target เป็น Role.Owner** (`cannot-change-owner` / `cannot-remove-owner`) — ระบบปัจจุบันมี Owner ได้ทีละ 1 คนต่อ project เท่านั้น และเปลี่ยนได้ทางเดียวคือ `transferOwnership()` (`POST /:id/transfer`, บรรทัด 229-250) ซึ่งลด role เดิมของ current owner เหลือ `Editor` แบบ transactional ดังนั้น **จุด hook ที่ถูกต้องจริงคือ `transferOwnership()` เท่านั้น** ไม่ใช่ 2 endpoint ที่ ADR ยกตัวอย่างไว้ (ดูหมวด 3 Feature "เพิกถอนลิงก์" และหมวด 6) — เจตนาของการตัดสินใจ (auto-revoke เมื่อผู้สร้างไม่ใช่ Owner) ยังคงเดิมทุกประการ นี่คือแค่การแก้ตำแหน่ง implementation ให้ตรงกับโค้ดจริง ไม่ใช่การเปิดประเด็นใหม่
  3. **CSP ของหน้า public viewer ต้องตั้งที่ web layer ไม่ใช่ reuse ของ API** — Helmet CSP ปัจจุบันใน `apps/api/src/main.ts` (บรรทัด 42-55) ตั้งใจ lock `default-src: 'none'` เพราะ API เสิร์ฟ JSON เท่านั้น ("ไม่เคยตั้งใจให้โหลดอะไรเลย") หน้า `/share/:token` เป็น React SPA route ที่เสิร์ฟจาก **web app** ไม่ใช่ API จึงต้องตั้ง CSP header แยกที่ web server/hosting layer (หรือ `<meta http-equiv>` ใน `index.html` เฉพาะ route นี้) — CSP ของ API เดิมไม่ครอบคลุมหน้านี้ (ต่างจากที่ ADR §4 dependency note สื่อว่า "Helmet ปิด CSP อยู่" ซึ่งไม่ตรงกับโค้ดปัจจุบันที่ CSP เปิดอยู่แล้วฝั่ง API — แต่ประเด็นสำหรับฟีเจอร์นี้คือ CSP ฝั่ง web ต่างหาก ไม่ใช่ API)
  4. **Rate-limit ของ public route ใช้ `@Throttle` ต่อ route ตาม pattern `search.controller.ts`** (`@Throttle({ default: { limit, ttl } })`) ซ้อนกับ global `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` — ใช้ค่า **20/min ต่อ IP** สำหรับ public read และ asset-proxy ตาม ADR §4 (เข้มกว่า global 100/min)

---

## 2. User Roles & Permissions

ใช้ enum `Role` เดิม (`Owner` / `Editor` / `Viewer`) สำหรับสิทธิ์จัดการฝั่ง authenticated เท่านั้น — **ไม่เพิ่ม role ใหม่** ผู้ชม public viewer ไม่มี role ใดๆ (anon, no identity)

| บทบาท | สร้างลิงก์ | เผยแพร่ (publish) | เพิกถอน | ดูรายการลิงก์ | ดู public viewer |
|---|---|---|---|---|---|
| **Owner** | ✅ | ✅ | ✅ (manual) | ✅ | ✅ (เหมือนคนนอก) |
| **Editor** | ❌ | ❌ | ❌ | ❌ (ไม่มี management route ให้เห็น) | ✅ (เหมือนคนนอก) |
| **Viewer** | ❌ | ❌ | ❌ | ❌ | ✅ (เหมือนคนนอก) |
| **Anonymous (ไม่มีบัญชี)** | ❌ | ❌ | ❌ | ❌ | ✅ เห็นเฉพาะ `ShareLink.publishedContent` ล่าสุดที่ยังไม่ revoked/expired |

**เหตุผลจำกัดเฉพาะ Owner (ตาม ADR 0006 §5.2):** การเปิดข้อมูลสู่สาธารณะเป็นการตัดสินใจระดับ project ต้องเป็นสิทธิ์สูงสุด ป้องกัน Editor เปิดข้อมูลรั่วโดยพลการ — enforce ด้วย `@MinRole(Role.Owner)` บน management route ทั้งหมด ผ่าน `ProjectRoleGuard` เดิม (คนละ guard กับ `ShareLinkGuard` ของ public route — ดูหมวด 4 NFR)

---

## 3. Functional Requirements

### Module: Share Link Management (Owner-only, authenticated)

Endpoint นัยตาม pattern เดียวกับ `revisions` ใน `FilesController` (nested ใต้ `/projects/:id/files/:fileId`, ใช้ `JwtGuard` + `ProjectRoleGuard` เดิมที่ controller ระดับบนสุดอยู่แล้ว):

```
POST   /projects/:id/files/:fileId/share-links                    @MinRole(Owner)  — สร้างลิงก์
GET    /projects/:id/files/:fileId/share-links                    @MinRole(Owner)  — รายการลิงก์ของไฟล์
PATCH  /projects/:id/files/:fileId/share-links/:shareLinkId/publish  @MinRole(Owner)  — เผยแพร่ snapshot ปัจจุบัน
DELETE /projects/:id/files/:fileId/share-links/:shareLinkId       @MinRole(Owner)  — เพิกถอน (manual revoke)
```

#### Feature: สร้างลิงก์แชร์

- **Description:** Owner สร้าง `ShareLink` ผูกกับไฟล์เดียว ระบบ generate opaque token (`crypto.randomBytes(32)` → base64url) คืนให้ frontend **ครั้งเดียวตอนสร้าง** เท่านั้น เก็บใน DB เฉพาะ `sha256(token)`
- **User Story:** As an Owner ฉันต้องการสร้างลิงก์แชร์สำหรับไฟล์ที่เลือก พร้อมกำหนดวันหมดอายุ เพื่อควบคุมว่าใครเข้าถึงได้นานแค่ไหน
- **Acceptance Criteria:**
  - [ ] **Given** เป็น Owner ของ project และเปิดไฟล์ (kind = Document), **When** กด "สร้างลิงก์แชร์" แล้วเลือก TTL (7/30/90 วัน หรือ "ไม่มีวันหมดอายุ"), **Then** ระบบสร้าง `ShareLink` ใหม่ ส่ง `{ url, expiresAt }` กลับ **ครั้งเดียว** — token เต็มไม่ถูกเก็บ/log ที่ใดอีกหลังจากนี้
  - [ ] **Given** ไม่เลือก TTL ใดๆ (ปล่อยว่าง), **When** กด "สร้าง", **Then** ปุ่มยืนยัน disabled หรือ dialog บังคับเลือกก่อน — "ไม่มีวันหมดอายุ" ต้องเป็นการเลือกที่ตั้งใจ (checkbox แยก + คำเตือนสั้น) ไม่ใช่ default เงียบๆ
  - [ ] **Given** ผู้เรียกไม่ใช่ Owner (Editor/Viewer), **When** เรียก `POST .../share-links`, **Then** `ProjectRoleGuard` ปฏิเสธด้วย 403/404 ตาม behavior เดิมของ guard (ไม่ leak การมีอยู่ของ route)
  - [ ] **Given** ไฟล์เป็น kind `Folder`, **When** พยายามสร้างลิงก์, **Then** ปฏิเสธด้วย 400 (`code: 'not-a-document'`) — share link ผูกกับเอกสารเท่านั้น (สอดคล้อง pattern เดิมใน `assets.service.ts` บรรทัด 51-53)
  - [ ] **Given** สร้างลิงก์สำเร็จ, **When** ดูผล, **Then** ยังไม่มี `publishedContent` (เป็น `null`) จนกว่า Owner จะกด "เผยแพร่" แยกต่างหาก (ดู Feature ถัดไป) — สร้างลิงก์ ≠ เผยแพร่เนื้อหา

#### Feature: ปุ่ม "เผยแพร่" (publish) — manual snapshot

- **Description:** Owner กดปุ่มเผยแพร่แยกต่างหากจากการสร้างลิงก์ ระบบ copy `File.content` (HTML mirror) ปัจจุบัน → เขียนลง `ShareLink.publishedContent` + ตั้ง `publishedAt = now()` **ไม่ใช่ real-time mirror** — ต้องกดยืนยันทุกครั้งที่ต้องการอัปเดตสิ่งที่คนนอกเห็น (ตัดสินใจแล้วใน ADR 0006 §7 open question #2)
- **User Story:** As an Owner ฉันต้องการควบคุมว่าคนนอกเห็นเนื้อหาเวอร์ชันไหน โดยไม่ให้เห็นงานที่ยังแก้ไม่เสร็จโดยไม่ตั้งใจ
- **Acceptance Criteria:**
  - [ ] **Given** มีลิงก์ที่ยังไม่เคย publish (`publishedContent = null`), **When** Owner กด "เผยแพร่", **Then** `publishedContent` ถูก set เป็น `File.content` ปัจจุบัน (HTML string), `publishedAt = now()` — public viewer เริ่มเสิร์ฟเนื้อหาได้ตั้งแต่ตอนนี้ (ก่อนหน้านี้ลิงก์มีอยู่แต่ยังไม่มีอะไรให้ anon เห็น)
  - [ ] **Given** เอกสารถูกแก้ไขหลัง `publishedAt` ล่าสุด, **When** Owner ดูหน้าจัดการลิงก์, **Then** เห็น indicator ชัดเจนว่า "เนื้อหาที่แชร์อยู่เก่ากว่าปัจจุบัน" (เช่น badge "มีการแก้ไขใหม่ตั้งแต่เผยแพร่ครั้งล่าสุด" + timestamp เทียบ `File.updatedAt` vs `ShareLink.publishedAt`)
  - [ ] **Given** เอกสารไม่ถูกแก้ไขเลยหลัง publish ล่าสุด, **When** Owner ดูหน้าจัดการลิงก์, **Then** แสดง "ตรงกับเนื้อหาปัจจุบัน" ไม่มี badge เตือน
  - [ ] **Given** กด "เผยแพร่" ซ้ำ (มี `publishedContent` เดิมอยู่แล้ว), **When** ยืนยัน, **Then** `publishedContent`/`publishedAt` ถูกเขียนทับด้วยค่าใหม่ทั้งคู่ (ไม่เก็บ history ของ publish เก่า ใน v1) — anon viewer ที่กำลังเปิดหน้าอยู่จะเห็นเนื้อหาใหม่เมื่อ refresh เท่านั้น (ไม่ push)
  - [ ] **Given** Owner กด "เผยแพร่" แต่เอกสารว่างเปล่า (`File.content` เป็น `''`/`null`), **When** ยืนยัน, **Then** ระบบยัง publish ได้ (แสดงหน้าเปล่าที่มี badge readonly) — ไม่ block แต่ควรมี confirm dialog เตือนว่าเนื้อหาว่าง

#### Feature: เพิกถอนลิงก์ (revoke)

- **Description:** สองเส้นทาง — (1) Owner กดเพิกถอนเองจากหน้าจัดการลิงก์ (manual), (2) ระบบเพิกถอนอัตโนมัติเมื่อผู้สร้างลิงก์ไม่ใช่ Owner ของ project นั้นอีกต่อไป (auto-revoke, ตัดสินใจแล้วใน ADR 0006 §7 open question #3)
- **User Story:** As an Owner ฉันต้องการยกเลิกลิงก์ได้ทันทีเมื่อไม่ต้องการให้เข้าถึงแล้ว และมั่นใจว่าไม่มีลิงก์กำพร้าที่ไม่มีใครดูแล
- **Acceptance Criteria (manual revoke):**
  - [ ] **Given** Owner ดูรายการลิงก์ของไฟล์, **When** กด "เพิกถอน" แล้วยืนยัน, **Then** `ShareLink.revokedAt = now()` — มีผลทันทีกับ **ทุก request ถัดไป** ของ public route (ไม่มี cache สถานะ token ที่ค้างการ revoke)
  - [ ] **Given** ลิงก์ถูกเพิกถอนแล้ว, **When** anon เปิด URL เดิมอีกครั้ง, **Then** ได้ 404 generic (เหมือนกรณี "ไม่มี/หมดอายุ" ทุกประการ — ไม่ leak ว่าเคยมีอยู่)
- **Acceptance Criteria (auto-revoke เมื่อผู้สร้างไม่ใช่ Owner แล้ว):**
  - [ ] **Given** user A สร้าง `ShareLink` ขณะเป็น Owner ของ project P, **When** เกิด `transferOwnership()` ที่ทำให้ A ถูกลดจาก `Role.Owner` เหลือ `Role.Editor` (เส้นทางเดียวที่มีอยู่จริงในระบบที่เปลี่ยนตัว Owner — ดูหมวด 1 Assumption #2), **Then** ทุก `ShareLink` ที่ `createdById = A.id` และ `projectId = P.id` และยังไม่ถูก revoke ต้องถูกตั้ง `revokedAt = now()` ภายใน transaction เดียวกับการโอนสิทธิ์ (`prisma.$transaction` ที่มีอยู่แล้วใน `transferOwnership()` บรรทัด 238-248 — เพิ่ม `shareLink.updateMany` เข้าไปในชุดเดียวกัน)
  - [ ] **Given** A สร้างลิงก์ในหลาย project ที่ตนเป็น Owner, **When** A ถูก transfer ownership ออกจาก **project P เดียว**, **Then** เฉพาะลิงก์ที่ `projectId = P` ถูก revoke — ลิงก์ของ A ใน project อื่นที่ยังเป็น Owner อยู่ไม่กระทบ
  - [ ] **Given** ปัจจุบันไม่มีเส้นทางใดในระบบที่ "ถอด Owner ออกจาก project โดยไม่ transfer ก่อน" (`removeMember`/`updateMemberRole` ปฏิเสธ target ที่เป็น Owner เสมอ — ยืนยันจากโค้ดจริง), **Then** ไม่ต้อง implement hook auto-revoke ที่จุดอื่นนอกจาก `transferOwnership()` ใน v1 นี้ — ถ้าอนาคตมีเส้นทางใหม่ที่ถอด Owner ได้ (เช่น ลบบัญชีทั้งระบบ) ต้องเพิ่ม hook ที่จุดนั้นแยกต่างหาก (ธงไว้เป็น recommended enhancement หมวด 7)

---

### Module: Public Read Surface (anonymous, no auth)

Endpoint ตาม ADR 0006 §3.4/§4 — โมดูลใหม่ `apps/api/src/share/` แยกจาก authz เดิมโดยสิ้นเชิง:

```
GET /public/share/:token                    (ShareLinkGuard เท่านั้น — ไม่มี JwtGuard)
GET /public/share/:token/assets/:assetId    (ShareLinkGuard เดียวกัน)
```

#### Feature: หน้า public viewer (`/share/:token`)

- **Description:** Route ฝั่ง web ใหม่ นอก `AppShell` ทั้งหมด ไม่ผ่าน `ProtectedRoute` (ดู `App.tsx` — เป็น route เดียวที่ mount แบบไม่มี auth gate) แสดง `publishedContent` แบบ sanitized readonly
- **User Story:** As an anonymous viewer ฉันต้องการเปิดลิงก์ที่ได้รับแล้วเห็นเนื้อหารายงานทันทีโดยไม่ต้อง login หรือสมัครสมาชิก
- **Acceptance Criteria:**
  - [ ] **Given** token valid (มีอยู่, ยังไม่หมดอายุ, ยังไม่ revoked, `file.deletedAt`/`project.deletedAt` เป็น null, `publishedContent != null`), **When** เปิด `/share/:token`, **Then** แสดงชื่อไฟล์ + เนื้อหา `publishedContent` (sanitize ด้วย DOMPurify หรือเทียบเท่าก่อน render) + badge "อ่านอย่างเดียว · แชร์แบบสาธารณะ" + `publishedAt`
  - [ ] **Given** token invalid ไม่ว่าเหตุผลใด (ไม่มี/หมดอายุ/ถูกเพิกถอน/ไฟล์ถูกลบ/project ถูก trash/ยังไม่เคย publish), **When** เปิดลิงก์, **Then** แสดงหน้า generic "ลิงก์นี้ใช้ไม่ได้แล้ว" **เหมือนกันทุกกรณี** — ไม่มี message ที่บอกเหตุผลจำเพาะ (กัน enumeration ตาม ADR S-1/I-2)
  - [ ] **Given** กำลังโหลด, **When** เปิดหน้า, **Then** แสดง skeleton (ไม่ใช่ spinner — ตาม UI_GUIDELINES เดิมของทีมที่ใช้ใน `SRS-sprint4.md` §3)
  - [ ] **Given** เปิดหน้านี้, **When** ตรวจ HTTP response headers, **Then** มี `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` และ CSP ที่ตั้งแยกที่ web layer (ดูหมวด 1 Assumption #3) — ไม่ fetch authenticated data ใดๆ (ไม่มี sidebar/command palette/notification bell/user menu)
  - [ ] **Given** เนื้อหา `publishedContent` มี `<script>` หรือ event handler ฝังอยู่ (เกิดจาก Editor คนใดคนหนึ่งใน project ยัด HTML แปลกๆ ผ่านช่องทางอื่นในอดีต), **When** render, **Then** sanitizer ตัดออกก่อนแสดงผลเสมอ — ไม่ execute (กัน stored XSS ข้าม cross-user ตาม ADR I-3/§5.1)
  - [ ] **Given** i18n, **When** ดูหน้านี้, **Then** microcopy เป็น th/en ตามภาษา browser/query (ไม่ผูกกับ `UserSetting.language` เพราะ anon ไม่มี user) คำเฉพาะ `Owner/Project` คงอังกฤษตามกฎเหล็ก #5 ของ repo

#### Feature: Asset-proxy สำหรับรูปภาพ

- **Description:** เอกสารที่มีรูปภาพ (`FileAsset`, Supabase Storage signed URL) ต้องเสิร์ฟผ่าน endpoint ใหม่ที่ตรวจ share token เดียวกัน สตรีมรูปจาก Supabase Storage ผ่าน backend แทนการฝัง signed URL ตรงในเนื้อหาที่ publish (ตัดสินใจแล้วใน ADR 0006 §7 open question #1) — ป้องกันรูปเสียเมื่อ signed URL เดิมของ `FileAsset` หมดอายุก่อนลิงก์ share (signed TTL ปัจจุบันคือ 10 ปีตาม `supabase-storage.service.ts` บรรทัด 31-35 แต่ share link อาจตั้งไม่มีวันหมดอายุเช่นกัน — ต้องไม่ผูกกับ TTL เดิมที่เป็นค่า config เปลี่ยนได้)
- **User Story:** As an anonymous viewer ฉันต้องการเห็นรูปภาพในรายงานแสดงผลถูกต้อง โดยไม่ต้องมีสิทธิ์เข้าถึง Supabase Storage โดยตรง
- **Acceptance Criteria:**
  - [ ] **Given** `publishedContent` มี `<img>` ที่ชี้ไป asset-proxy URL (`/public/share/:token/assets/:assetId` แทน signed URL ตรงๆ — ต้อง rewrite URL ตอน publish, ดู Edge Cases หมวด 6), **When** browser โหลดรูป, **Then** backend ตรวจ `ShareLinkGuard` เดิม → resolve `assetId` **เฉพาะที่ `fileId` ตรงกับ `req.shareLink.fileId`** → stream buffer จาก Supabase Storage ผ่าน backend (ไม่ redirect 302 ไป signed URL Supabase ตรงๆ)
  - [ ] **Given** `assetId` ไม่ได้เป็นของไฟล์ที่ token นี้ผูกอยู่ (พยายามข้ามไฟล์), **When** เรียก asset-proxy, **Then** ตอบ 404 (IDOR guard เดียวกับ I-1 ของ content หลัก)
  - [ ] **Given** token ถูก revoke/expired ระหว่างที่หน้ายังเปิดค้างอยู่, **When** browser พยายามโหลดรูปซ้ำ (เช่น scroll กลับ), **Then** asset-proxy ตอบ 404 เช่นเดียวกับ content endpoint (validate ทุก request ไม่มี cache สถานะ)
  - [ ] **Given** bucket เป็น private เสมอ (ไม่เปิด public ทั้งใบ — เงื่อนไข NO-GO ข้อ 4 ของ ADR), **When** ตรวจสอบ config, **Then** ไม่มี code path ใดเปลี่ยน bucket ACL หรือ bypass ผ่าน Supabase anon key

---

## 4. Non-Functional Requirements

อ้างอิงตรงจาก ADR 0006 §7 (Acceptance Criteria ด้าน Security) — คัดลอกมาเป็นข้อบังคับของ SRS นี้ทั้งหมด ไม่ตัดทอน:

**Token & Data:**
- Token = `randomBytes(32)` (256-bit) base64url; เก็บเฉพาะ `sha256(token)` ใน DB; ไม่มี plaintext token ใน DB/log/response หลังสร้างครั้งแรก
- Token อยู่ใน URL **path segment** ไม่ใช่ query string
- `ShareLink` ผูก `fileId` เดียว (ไม่ใช่ project); response เสิร์ฟเฉพาะ `publishedContent` + ชื่อไฟล์ + `publishedAt` — ไม่มี comment/revision/member/asset-ownership
- รูปภาพเสิร์ฟผ่าน asset-proxy ใหม่ ไม่ redirect ไป signed URL ของ Supabase ตรงๆ
- `revokedAt` ถูกตั้งอัตโนมัติเมื่อ `createdById` ไม่ใช่ Owner ของ project นั้นอีกต่อไป (จุด hook จริง = `transferOwnership()` — ดูหมวด 1 Assumption #2)

**Guard & Authz:**
- `ShareLinkGuard` เป็นไฟล์แยก ไม่ import/extend `JwtGuard`/`ProjectRoleGuard`; อยู่ใน `apps/api/src/share/`
- ทุก share route เป็น GET; ไม่มี mutation route ใดผูกกับ `ShareLinkGuard`
- `collab.service.ts onAuthenticate` ไม่ถูกแก้เลย (test ยืนยัน anon token เข้า WS ไม่ได้)
- Test บังคับ: token ของไฟล์ A เปิดไฟล์ B ไม่ได้ (E-2); token ใช้กับ route authenticated เดิมไม่ได้ (E-1); non-Owner สร้าง/เผยแพร่/เพิกถอนลิงก์ไม่ได้

**Validation & Lifecycle:**
- ทุก fail case (ไม่มี/หมดอายุ/ถูกเพิกถอน/ไฟล์ถูกลบ/โปรเจกต์ trash/ยังไม่ publish) ตอบ **404 เหมือนกัน**
- `revokedAt` มีผลทันทีในทุก request ถัดไป (validate ทุกครั้ง; ไม่มี cache ที่ทำให้ revoke ล่าช้า)
- บังคับเลือก TTL ตอนสร้าง (default 30 วัน); "no expiry" ต้องจงใจเลือก + มี warning ใน UI

**Anti-abuse & Privacy:**
- Rate-limit เฉพาะ public route ต่อ IP (20/min ตามหมวด 1 Assumption #4, เข้มกว่า global 100/min) + พิจารณาต่อ token; ไม่กระทบ throttle ของ authenticated route
- หน้า viewer ส่ง `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `Cache-Control: no-store`, CSP เข้ม (ตั้งที่ web layer ตามหมวด 1 Assumption #3)
- เนื้อหา HTML snapshot ถูก sanitize ก่อน render (กัน stored XSS ข้าม cross-user)
- Access log (ถ้ามี) เก็บแค่ aggregate (`accessCount`/`lastAccessedAt`) — **ห้ามเก็บ IP/PII ของ anon viewer**

**UI:**
- หน้า `/share/:token` อยู่นอก `AppShell` และไม่ผ่าน `ProtectedRoute`; ไม่ fetch authenticated data ใดๆ
- สร้าง/เผยแพร่/เพิกถอนลิงก์ = Owner เท่านั้น; dialog สร้างมี warning "ใครมีลิงก์เข้าดูได้โดยไม่ต้องล็อกอิน" + แสดง scope

**Performance:**
- `GET /public/share/:token` ตอบ < 300ms (query เดียวจาก index `token` unique — ไม่ join ตารางที่ไม่จำเป็น ตาม I-3)
- Asset-proxy stream รูปภาพโดยไม่บวม memory ทั้งไฟล์ก่อนส่ง (ใช้ stream/pipe pattern เดียวกับที่ Supabase SDK รองรับ ไม่ buffer ทั้งไฟล์ใน Node process ถ้าทำได้)

**Reliability:**
- Public route ต้อง degrade เป็น 404 (ไม่ใช่ 500) เมื่อ Supabase Storage unreachable สำหรับ asset-proxy — แสดง broken-image state ใน viewer ไม่ crash ทั้งหน้า

**Tech Stack:** ใช้ stack เดิมทั้งหมด (NestJS 10 + Prisma 5 + React 18 + Vite) — ไม่เพิ่ม dependency ใหม่ยกเว้น sanitizer ฝั่ง web (เช่น `dompurify`, ถ้ายังไม่มีอยู่แล้วในระบบ — ต้องตรวจก่อนเริ่ม dev)

---

## 5. Data Models / Database Entities

### Entity: ShareLink *(ใหม่)*

```json
{
  "id": "String @id @default(cuid())",
  "fileId": "String — FK File.id, onDelete: Cascade — scope 1:1 กับไฟล์เดียว (กัน IDOR)",
  "projectId": "String — FK Project.id, onDelete: Cascade — denormalized เพื่อ validate project.deletedAt แบบ 1 hop (ตาม pattern FileAsset)",
  "token": "String @unique — SHA-256 hash ของ opaque token (256-bit CSPRNG), ไม่เก็บ plaintext",
  "createdById": "String — FK User.id, ต้องเป็น Owner ของ project ตอนสร้าง (audit + revoke authority)",
  "publishedContent": "String? @db.Text — HTML snapshot ณ เวลาที่ Owner กด 'เผยแพร่' ล่าสุด; null = ยังไม่เคย publish",
  "publishedAt": "DateTime? — เวลาที่ publish ล่าสุด; null คู่กับ publishedContent",
  "expiresAt": "DateTime? — null = ไม่มีวันหมดอายุ (ต้องเลือกจงใจ, ดูหมวด 4)",
  "revokedAt": "DateTime? — เพิกถอนแบบ soft (manual หรือ auto-revoke), เก็บไว้เพื่อ audit ไม่ hard-delete",
  "lastAccessedAt": "DateTime? — optional, privacy-preserving, สำหรับ UX 'เปิดล่าสุด'",
  "accessCount": "Int @default(0) — optional, นับการเข้าถึงแบบ aggregate เท่านั้น ห้ามเก็บ IP รายตัว",
  "createdAt": "DateTime @default(now())"
}
```

```prisma
model ShareLink {
  id               String    @id @default(cuid())
  fileId           String
  projectId        String
  token            String    @unique
  createdById      String
  publishedContent String?   @db.Text
  publishedAt      DateTime?
  expiresAt        DateTime?
  revokedAt        DateTime?
  lastAccessedAt   DateTime?
  accessCount      Int       @default(0)
  createdAt        DateTime  @default(now())

  file      File    @relation(fields: [fileId], references: [id], onDelete: Cascade)
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdBy User    @relation(fields: [createdById], references: [id])

  @@index([fileId])
  @@index([projectId])
  @@index([createdById])
}
```

**Relationships:** `File` has many `ShareLink` (cascade delete เมื่อไฟล์ถูกลบถาวร — ไม่ใช่ soft-delete; ดู Edge Cases หมวด 6 สำหรับ soft-delete). `Project` has many `ShareLink`. `User` has many `ShareLink` (as creator ผ่าน `createdById`).

**Index เพิ่มจาก ADR draft:** `@@index([createdById])` — จำเป็นสำหรับ auto-revoke query (`WHERE createdById = X AND projectId = P AND revokedAt IS NULL`) ให้เร็วตอน `transferOwnership()` (ADR ไม่ได้ระบุ index นี้ไว้ชัด แต่จำเป็นเพราะ query pattern ใหม่ที่ query ตาม `createdById` โดยตรง)

**Relation ที่ต้องเพิ่มในโมเดลเดิม:** `File.shareLinks ShareLink[]`, `Project.shareLinks ShareLink[]`, `User.shareLinks ShareLink[]` (ตั้งชื่อ relation field ตาม convention เดิมของไฟล์ เช่น `revisions`/`comments` ใน `File`)

**Migration note:** model ใหม่ทั้งหมด — ไม่กระทบข้อมูลเดิม ใช้ `npx prisma migrate dev` ปกติจาก `apps/api`

### Shared Types

```json
{
  "ShareLinkDto": {
    "id": "string",
    "fileId": "string",
    "expiresAt": "string | null",
    "revokedAt": "string | null",
    "publishedAt": "string | null",
    "createdAt": "string",
    "createdByUsername": "string",
    "lastAccessedAt": "string | null",
    "accessCount": "number"
  },
  "PublicShareContentDto": {
    "fileName": "string",
    "contentHtml": "string",
    "publishedAt": "string"
  }
}
```
**เก็บที่:** `packages/shared/src/types.ts` (กฎเหล็ก #8 — UI shape ที่ใช้ทั้ง FE/BE ต้องแก้ที่นี่ก่อน) — `ShareLinkDto` ไม่มี `token` field ใดๆ (ทั้ง plaintext และ hash) เพราะ response ของการสร้างลิงก์ (ที่มี `url` เต็ม) เป็น shape แยกต่างหาก (`CreateShareLinkResponseDto` — ส่งครั้งเดียวตอนสร้าง ไม่ reuse กับ `ShareLinkDto` ที่ใช้ในหน้า list)

---

## 6. Logic Flows & Important Edge Cases

### Flow: สร้าง → เผยแพร่ → anon เข้าดู

1. Owner เปิดไฟล์ใน WorkPage → กด "จัดการลิงก์แชร์" → กด "สร้างลิงก์ใหม่" → เลือก TTL → `POST .../share-links`
2. Backend generate token (32 bytes) → hash → บันทึก `ShareLink` (`publishedContent = null`) → คืน `{ url, expiresAt }` ให้ client แสดง **ครั้งเดียว** (มี "คัดลอกลิงก์" ให้กดทันที เพราะเปิดหน้าใหม่จะไม่เห็น token เต็มอีก)
3. Owner กด "เผยแพร่" แยกต่างหาก → `PATCH .../share-links/:id/publish` → backend copy `File.content` ปัจจุบัน → เขียน `publishedContent`/`publishedAt` → **rewrite URL รูปภาพในเนื้อหาให้ชี้ไป asset-proxy** (แทนที่ signed URL ของ Supabase ที่ฝังอยู่ใน `<img src>` เดิมด้วย `/public/share/:token/assets/:assetId` — ต้อง map จาก signed URL เดิมกลับไปหา `FileAsset.id` ที่ตรงกัน ผ่าน `path`/`url` ที่เก็บไว้ใน `FileAsset`)
4. Anon เปิด `/share/:token` → web app เรียก `GET /public/share/:token` → `ShareLinkGuard` validate → คืน `{ fileName, contentHtml, publishedAt }` → frontend sanitize + render

**Edge Cases & Required Handling:**

| Scenario | Expected System Behavior |
|---|---|
| ไฟล์ถูกลบ (soft-delete เข้า Trash) หลังมีลิงก์แชร์ที่ publish อยู่แล้ว | `ShareLinkGuard` validate `file.deletedAt != null` → ตอบ 404 ทันที (ลิงก์ยังอยู่ใน DB ไม่ถูกลบ แต่ใช้ไม่ได้จนกว่าไฟล์จะถูกกู้จาก Trash — เมื่อกู้แล้ว `deletedAt` กลับเป็น null ลิงก์ใช้ได้อีกอัตโนมัติ ไม่ต้องสร้างใหม่) |
| ไฟล์ถูกลบถาวร (purge จาก Trash) | `ShareLink` ถูกลบจริงตาม `onDelete: Cascade` ที่ FK `fileId` — ไม่ orphan |
| Project ถูก trash (ทั้ง project) | validate `project.deletedAt != null` เช่นเดียวกับไฟล์ → 404; กู้ project กลับมา → ลิงก์ใช้ได้อีกถ้าไฟล์ยังไม่ถูกลบเช่นกัน |
| ผู้สร้างลิงก์ถูก `transferOwnership()` ออกจากตำแหน่ง Owner | auto-revoke ทุกลิงก์ของ user นั้นใน project นั้นทันที (ดูหมวด 3 Feature "เพิกถอนลิงก์") — เป็น transaction เดียวกับการโอนสิทธิ์ ไม่มี window ที่ลิงก์ valid อยู่หลัง Owner เปลี่ยนแล้ว |
| Owner กด "เผยแพร่" ซ้ำทับของเก่าขณะมี anon เปิดหน้าเก่าค้างอยู่ | anon เห็นเนื้อหาเก่าจนกว่าจะ refresh (ไม่ push แบบ real-time ตาม assumption manual publish) — ไม่ error |
| Token หมดอายุ/ถูกเพิกถอนแล้วมีคนเปิดลิงก์ | `ShareLinkGuard` ตอบ 404 generic เหมือนทุก fail case อื่น — ไม่มี response ที่บอกว่า "หมดอายุ" ต่างจาก "ไม่เคยมีอยู่" |
| Owner สร้างลิงก์แต่ยังไม่กด "เผยแพร่" แล้วมีคนเปิด URL | `publishedContent = null` → `ShareLinkGuard` ปฏิเสธเป็น 404 เช่นกัน (ไม่มีอะไรให้แสดง = เหมือนไม่มีลิงก์ จากมุมมอง anon) |
| รูปภาพในเอกสารถูกลบ (`FileAsset` ถูกลบ) หลัง publish ไปแล้ว | asset-proxy resolve `assetId` ไม่เจอ → รูปนั้นแสดงเป็น broken-image ใน viewer (ไม่ crash หน้าทั้งหมด, ไม่ retry loop) |
| Owner ลบ `ShareLink` (manual revoke) ขณะ anon กำลังโหลดรูปภาพหลายรูปพร้อมกัน (race) | request ที่ยังไม่เสร็จตอน revoke อาจสำเร็จ (best-effort, ไม่ต้อง lock) แต่ request ถัดไปทั้งหมดตอบ 404 ทันที — ยอมรับ window แคบมากนี้เพราะ revoke ไม่ใช่ operation ที่ time-critical ระดับ millisecond |
| สร้างลิงก์หลายอันสำหรับไฟล์เดียวกันพร้อมกัน (Owner กดสร้างซ้ำ) | อนุญาต — ไม่ unique constraint ที่ `fileId` (Owner อาจต้องการหลายลิงก์ TTL ต่างกันสำหรับกลุ่มผู้รับต่างกัน) แต่ละลิงก์ publish/revoke อิสระจากกัน |
| Rate-limit ถูกชนโดย legitimate viewer (เช่น หน้ามีรูปหลายรูป โหลดพร้อมกันชน 20/min) | asset-proxy ควรพิจารณา rate-limit key แยกจาก content endpoint (หรือ limit สูงกว่าเล็กน้อยเพราะโหลดหลาย asset ต่อการเปิดหน้า 1 ครั้งเป็นเรื่องปกติ) — ธงไว้ให้ dev tune ตัวเลขจริงตอน implement ไม่ fix ที่ 20 ตายตัวสำหรับ asset route |

### Flow: Auto-revoke ผ่าน transferOwnership()

1. Owner ปัจจุบัน (A) เรียก `POST /projects/:id/transfer` พร้อม `{ userId: B }`
2. `transferOwnership()` เปิด `$transaction`: ลด A เป็น `Editor`, ยก B เป็น `Owner`, อัปเดต `Project.ownerId = B`
3. **เพิ่มใน transaction เดียวกัน:** `prisma.shareLink.updateMany({ where: { projectId, createdById: currentOwnerId, revokedAt: null }, data: { revokedAt: now() } })`
4. Commit พร้อมกันทั้งหมด — ไม่มี partial state ที่ Owner เปลี่ยนแล้วแต่ลิงก์ยัง valid

**Edge Cases & Required Handling:**

| Scenario | Expected System Behavior |
|---|---|
| B (Owner ใหม่) เคยสร้างลิงก์ไว้ตั้งแต่ตอนเป็น Editor (เป็นไปไม่ได้ในระบบปัจจุบันเพราะสร้างลิงก์ต้อง Owner เท่านั้น) | ไม่มีกรณีนี้เกิดขึ้นจริง — ธงไว้เผื่อ future edge case ถ้ามีการเปลี่ยน permission model |
| `transferOwnership()` ล้มเหลวกลางทาง (DB error) | ทั้ง transaction rollback รวมถึง auto-revoke — ไม่มี state ที่ revoke ลิงก์ไปแล้วแต่ transfer ไม่สำเร็จ (atomic ตาม `$transaction` เดิม) |

---

## 7. Recommended Enhancements (Analyst Notes)

- **แก้จุดอ้างอิง hook ของ auto-revoke ให้ตรงโค้ดจริง** — ADR 0006 §8 ระบุ `PATCH members/:userId` และ `DELETE members/:userId` เป็นจุด hook แต่โค้ดจริงบล็อก Owner เป็น target ของทั้งสอง endpoint นี้เสมอ จุดที่ถูกต้องคือ `transferOwnership()` เท่านั้น — SRS นี้แก้ไขจุดอ้างอิงให้ตรงแล้ว (หมวด 1, 3, 6) แนะนำอัปเดต ADR 0006 §8 ให้ตรงกันด้วยเพื่อไม่ให้ dev สับสนตอนอ่านสองเอกสารคู่กัน (**flag ให้ PM ตัดสินใจว่าจะแก้ ADR หรือปล่อยให้ SRS เป็นแหล่งที่ถูกต้องกว่า**)
- **เตรียม hook เผื่ออนาคตถ้ามีการ "ถอด Owner" โดยไม่ transfer** — ปัจจุบันไม่มีเส้นทางนี้ในระบบ แต่ถ้าอนาคตเพิ่ม (เช่น ลบบัญชีทั้งระบบ, admin force-remove) ต้องเพิ่ม auto-revoke hook ที่จุดนั้นด้วย ไม่ใช่แค่ `transferOwnership()`
- **สร้าง sanitizer dependency ถ้ายังไม่มี** — ตรวจ `package.json` ของ `apps/web` ก่อนเริ่ม dev ว่ามี DOMPurify หรือเทียบเท่าอยู่แล้วหรือไม่ (editor ปัจจุบันอาจมี sanitizer อยู่แล้วสำหรับ paste-HTML ใน TipTap) เพื่อ reuse แทนเพิ่ม dependency ใหม่โดยไม่จำเป็น
- **พิจารณา CSP ของหน้า public viewer แยกจาก SPA อื่น** — เพราะเป็นหน้าเดียวที่ render เนื้อหา user-generated ให้ anon เห็นโดยไม่มี auth gate ใดๆ ป้องกันไว้ก่อน (defense-in-depth) แม้ sanitizer จะทำงานถูกต้องแล้วก็ตาม

---

### 🤝 HANDOFF

**จาก:** srs-architect (Business Analyst)
**ถึง:** `senior-fullstack-dev` — implement ตาม endpoint contract หมวด 3, schema หมวด 5, และ transaction hook หมวด 6 Flow "Auto-revoke ผ่าน transferOwnership()"; แนะนำให้ `security-engineer` (ผู้เขียน ADR 0006) review PR ก่อน merge เพราะเป็น trust boundary ใหม่ของระบบ

**ไฟล์ผลงาน:** `docs/SRS-public-share-link.md` (ไฟล์นี้)

**Definition of Done ของเอกสารนี้:** ทุก feature มี user story + acceptance criteria (Given/When/Then) + edge cases + data entity ครบ, ไม่ขัดแย้งกับ ADR 0006 (3 open questions ถูกแปลงเป็น AC ตรงๆ ไม่ตัดสินใจใหม่), จุดที่ ADR ระบุคลาดเคลื่อนจากโค้ดจริง (auto-revoke hook location) ถูกแก้ให้ตรงพร้อมอธิบายเหตุผล

**สิ่งที่ผู้รับงานต่อควรอ่านก่อนเริ่ม:**
1. หมวด 1 "Key Assumptions" ข้อ 2 และ 3 — สองจุดที่ SRS นี้แก้ไข/ชี้แจงเพิ่มจาก ADR 0006 (auto-revoke hook ที่แท้จริง, CSP layer ที่ถูกต้อง)
2. หมวด 6 Flow ที่สอง "Auto-revoke ผ่าน transferOwnership()" — ต้องแก้ `transferOwnership()` ใน `projects.service.ts` บรรทัด 229-250 เพิ่ม `shareLink.updateMany` เข้า transaction เดิม ไม่ใช่สร้าง hook แยก
3. หมวด 3 Flow "สร้าง → เผยแพร่" ขั้นตอนที่ 3 — การ rewrite URL รูปภาพจาก signed URL เดิมเป็น asset-proxy URL ตอน publish เป็นจุดที่ซับซ้อนที่สุดของฟีเจอร์นี้ ต้องคุยกับ `fullstack-architect-mentor` ถ้าพบว่าการ map `FileAsset` จาก HTML string ทำได้ยากกว่าที่คาด (เช่น ต้อง parse HTML แทน string-replace ตรงๆ)
4. **จุดที่ยังต้องให้ dev ตัดสินใจระหว่าง implement (ไม่ใช่ open question ระดับสเปก):** ตัวเลข rate-limit ที่แม่นยำของ asset-proxy (หมวด 6 edge case สุดท้าย), รูปแบบ dialog "เผยแพร่ซ้ำทับ" ว่าต้อง confirm หรือกดครั้งเดียว (ไม่กระทบ security เป็นแค่ UX detail)
