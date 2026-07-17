# ADR 0006 — Public Share Link: Threat Model & Security Design

- **สถานะ:** Proposed — security design review (เอกสาร/threat-model เท่านั้น ยังไม่แตะโค้ด)
- **ผู้เขียน:** security-engineer (AgentsTown)
- **วันที่:** 2026-07-17
- **Sprint:** 4 prep (feature candidate #5 — ในชอร์ตลิสต์ถูกจัด **Defer** จนกว่าจะมี threat model ฉบับนี้)
- **อ่านคู่กับ:** `docs/security-review-2026-07-09.md`, `docs/sprint4-feature-candidates.md` (§1 แถว 5, §3), `apps/api/prisma/schema.prisma`, `apps/api/src/projects/guards/project-role.guard.ts`, `apps/api/src/collab/collab.service.ts`, `supabase-rls-fix.sql`
- **Recommendation (สรุปหัวเอกสาร):** 🟢 **GO-with-constraints** — ทำได้อย่างปลอดภัยถ้ายึด scope "readonly snapshot, ไม่มี WS" + ทำตาม acceptance criteria ใน §7 ครบ ถ้าตัด constraint ข้อใดข้อหนึ่ง (โดยเฉพาะการเปิด anon เข้า collab WS หรือ share ระดับ project) → กลับเป็น **NO-GO**

---

## 1. บริบทและ security posture ปัจจุบัน (ทำไมฟีเจอร์นี้ถึงเสี่ยงเป็นพิเศษ)

Task Board ออกแบบให้ **auth-gated 100%** ทุกเส้นทาง การเพิ่ม "public link ให้คนไม่มีบัญชีเข้าดู" คือการเปิด **trust boundary ใหม่** ที่ไม่เคยมีมาก่อน จึงต้องเข้าใจว่าปัจจุบันอะไรกันข้อมูลไว้จริง:

| ชั้นป้องกัน | ปัจจุบันทำงานอย่างไร | เกี่ยวกับ share link อย่างไร |
|---|---|---|
| **JWT (`JwtGuard`)** | ทุก REST route ต้องมี access token ที่ verify ได้ | share link **ไม่มี** JWT — ต้องมี authority ใหม่แทน (opaque token) |
| **`ProjectRoleGuard` + `@MinRole`** | โหลด `Membership` ของ `req.params.id` → 404 ถ้าไม่ใช่สมาชิก (ไม่ leak การมีอยู่) | anon **ไม่มี** Membership เลย → guard เดิมใช้กับ anon ไม่ได้โดยธรรมชาติ |
| **Collab WS `onAuthenticate`** | verify JWT → resolve file→project → require Membership → Viewer=readOnly | ต้อง **ไม่เปิด** ให้ anon เด็ดขาด (ดู §2 S-2, §3) |
| **Supabase RLS (12 ตาราง)** | ENABLE+FORCE, `REVOKE ALL` จาก anon/authenticated | **สำคัญมาก — อ่าน §1.1** |

### 1.1 ⚠️ ความเข้าใจผิดที่ต้องแก้ก่อน: "bypass RLS ผ่าน service-role" — ไม่จำเป็นและไม่ควรทำ

feature-candidates §1 เขียนว่า *"ต้องตัดสินใจว่า bypass RLS ผ่าน service-role connection อย่างไรให้ปลอดภัย"* — **ข้อนี้ตั้งอยู่บนความเข้าใจผิดเกี่ยวกับ security model จริงของระบบ** ยืนยันจาก `supabase-rls-fix.sql` (บรรทัด 4-8) และ `security-review-2026-07-09.md` §5:

> แอปเชื่อมต่อ DB ในฐานะ **postgres (superuser) role ซึ่ง bypass RLS อยู่แล้วโดยอัตโนมัติ** RLS ถูกเปิดไว้เพื่อปิดช่องทาง **Supabase PostgREST API** (anon/authenticated Supabase role) เท่านั้น — **ไม่ใช่** ชั้น authz ของแอป per-row authorization ทั้งหมดอยู่ใน NestJS guards

**นัยสำคัญต่อ share link (critical):**
- ไม่ต้องเปิด service-role connection ใหม่ ไม่ต้อง "หาวิธี bypass RLS" — Prisma bypass อยู่แล้ว
- แต่นั่นแปลว่า **ไม่มี safety net ระดับ DB อยู่ใต้ guard เลย** ถ้า query ใน endpoint ใหม่ scope ผิด (เช่นลืม filter `fileId`) จะรั่วทันทีโดยไม่มีอะไรมากันชั้นสอง
- ดังนั้น **ภาระความปลอดภัยทั้งหมดของ share link อยู่ที่ application query layer** ต้อง scope query ด้วยมือให้ถูก 100% ทุกครั้ง (ดู S-3, I-1)
- RLS/PostgREST surface ไม่เกี่ยวกับ share link — ห้ามเผลอเอา Supabase anon key มาใช้เสิร์ฟ public link (จะเปิด PostgREST surface กลับมา) share link ต้องผ่าน NestJS API เท่านั้น

**หลักการนำ:** share link ไม่ได้ "ปิด" หรือ "หลบ" การป้องกันเดิม แต่ **สร้างเส้นทาง authz เส้นที่สองที่แยกกันโดยสิ้นเชิง** โดยมี opaque token เป็น authority แทน (JWT+Membership) และ scope แคบที่สุดเท่าที่จะทำได้ (1 ไฟล์, readonly, snapshot)

---

## 2. Threat Model (STRIDE)

**Trust boundary ใหม่:** `Anonymous Internet (no account) ──[opaque token in URL]──▶ NestJS REST (public route) ──▶ Postgres (superuser, no RLS net)`
**Asset ที่ปกป้อง:** เนื้อหาไฟล์รายงาน 1 ไฟล์ (HTML snapshot) + ต้องไม่รั่วไปถึง: ไฟล์อื่นในโปรเจกต์, membership, PII ของสมาชิก, revision history, comment, โครงสร้าง project tree

| ID | STRIDE | ภัยคุกคาม | Likelihood × Impact | มาตรการป้องกัน (ออกแบบไว้ใน §3–§5) |
|---|---|---|---|---|
| **S-1** | Spoofing | เดา/brute-force token เพื่อเข้าถึงลิงก์ที่ไม่ได้ถูกแชร์ให้ | ต่ำ × สูง = 🟠 | token opaque ≥256-bit entropy (32 bytes CSPRNG) → search space 2^256 เดาไม่ได้เชิงปฏิบัติ; ตอบ 404 เท่ากันทั้ง "ไม่มี/หมดอายุ/ถูกเพิกถอน" (ไม่ leak สถานะ); rate-limit เข้ม (S-4) |
| **S-2** | Spoofing | anon ปลอมเป็น collaborator เข้า Yjs WS ผ่าน token | ต่ำ × สูงมาก = 🟠 | **ไม่เปิด WS ให้ anon เลย** `onAuthenticate` ยังคงบังคับ JWT+Membership ไม่แตะ ไม่เพิ่ม token path ใน collab (ดู §3 ข้อ 4) |
| **T-1** | Tampering | anon แก้เนื้อหา/แอบเขียนผ่าน public endpoint | ต่ำ × สูง = 🟠 | public route เป็น **GET-only readonly** ไม่มี mutation endpoint ใด ๆ ผูกกับ share guard; เสิร์ฟ snapshot ไม่ใช่ live doc |
| **T-2** | Tampering | ยัด token ปลอม/แก้ token เพื่อชนกับลิงก์อื่น | ต่ำ × กลาง = 🟡 | เทียบด้วย SHA-256 hash ที่เก็บใน DB (unique) token ที่ไม่ hash-match = 404 |
| **R-1** | Repudiation | เจ้าของอ้างว่าไม่ได้สร้างลิงก์ / ไม่รู้ว่าใครเปิดดู | กลาง × กลาง = 🟡 | เก็บ `createdBy`, `createdAt` ต่อ ShareLink; (optional) access log แบบ privacy-preserving (§5.2) |
| **I-1** | **Info Disclosure (ภัยหลัก)** | IDOR — anon เข้าถึงไฟล์อื่นในโปรเจกต์เดียวกันที่ไม่ได้แชร์ | กลาง × สูงมาก = 🔴 | token ผูก **1:1 กับ `fileId` เดียว** (ไม่ใช่ project); query scope ด้วย `shareLink.fileId` เท่านั้น; ห้ามรับ `fileId`/`projectId` จาก client มา query (ดู §3, §4) |
| **I-2** | Info Disclosure | token รั่วผ่าน Referer header, browser history, proxy log, chat preview | กลาง × สูง = 🟠 | `Referrer-Policy: no-referrer` บนหน้า viewer; token ใน **path segment** ไม่ใช่ query string; `Cache-Control: no-store`; `X-Robots-Tag: noindex`; แนะนำ expiry สั้น (§3) |
| **I-3** | Info Disclosure | snapshot มี PII/ข้อมูลลับที่ owner ไม่ตั้งใจเปิด (รวม comment, mention, revision) | กลาง × สูง = 🟠 | เสิร์ฟ **เฉพาะ `File.content` (HTML snapshot)** ห้าม join comment/revision/membership/asset ownership; owner ต้องยืนยันตอนสร้าง (UX §4); ระบุชัดว่า "ใครมีลิงก์ = เห็นได้" |
| **I-4** | Info Disclosure | รูปภาพในเอกสาร (FileAsset URL / Supabase Storage) เข้าถึงไม่ได้ หรือ กลับกัน—เข้าถึงได้แบบไม่คุม | กลาง × กลาง = 🟡 | ตัดสินใจ asset access ให้ชัด (§3.1) — ต้องไม่ทำให้ share link พึ่ง public bucket ที่เปิดทุกไฟล์ |
| **D-1** | DoS | scrape/hammer public endpoint (ไม่มี auth = ไม่มี user ให้ throttle ต่อ user) | กลาง × กลาง = 🟡 | rate-limit ต่อ **IP + ต่อ token**; snapshot cache สั้น ๆ ฝั่ง server; payload cap เท่าเดิม (5MB) |
| **D-2** | DoS | brute-force token จำนวนมหาศาลเพื่อทั้ง enumerate และถล่ม DB | ต่ำ × กลาง = 🟡 | rate-limit เข้มต่อ IP บน public route (เข้มกว่า global 100/min); 404 ราคาถูก (hash lookup มี index) |
| **E-1** | **Elevation of Privilege (ภัยหลัก)** | guard ใหม่หลุดไปให้สิทธิ์เกิน readonly หรือทำให้ authz เดิมหลวมลง | ต่ำ × สูงมาก = 🔴 | guard แยกไฟล์/แยก decorator คนละตัวกับ `JwtGuard`/`ProjectRoleGuard`; public controller แยก module; ไม่มีจุดที่ share-token ให้สิทธิ์ mutate; test ครอบว่า token ใช้กับ route อื่นไม่ได้ (§3, §7) |
| **E-2** | EoP | ใช้ token ของไฟล์ A ไปเปิดไฟล์ B (token confusion) | ต่ำ × สูง = 🟠 | resolve fileId **จาก record ของ token เอง** เท่านั้น ไม่รับ path param fileId มาประกอบ |
| **E-3** | EoP | ลิงก์ยังใช้ได้หลังไฟล์ถูกลบ/โปรเจกต์ถูก trash/สมาชิกที่สร้างถูกถอด | กลาง × กลาง = 🟡 | validate cascade: ปฏิเสธถ้า `file.deletedAt` หรือ `project.deletedAt` ไม่ null; (นโยบาย: ผูกความ valid กับสถานะไฟล์ ไม่ผูกกับ session ผู้สร้าง — ดู §3.2) |

---

## 3. สถาปัตยกรรมที่แนะนำ

### 3.1 หลักการออกแบบ (ยืนยันข้อเสนอเดิม + เพิ่มเงื่อนไข)

**✅ ยืนยัน:** ข้อเสนอ "เสิร์ฟ snapshot ล่าสุด (readonly, ไม่ real-time) ไม่เปิด Yjs WS ให้ anon" ในfeature-candidates **ถูกต้องและเป็นเงื่อนไขบังคับ** เป็นการตัดความเสี่ยง S-2/T-1 ทั้งกลุ่มออกไปโดยสิ้นเชิง — เห็นด้วยเต็มที่

**เพิ่มเงื่อนไขบังคับ (constraints ของ GO):**
1. **Scope = 1 ไฟล์ ไม่ใช่ project** — token ผูก `fileId` เดียว (กัน I-1) ถ้าอนาคตจะ share ทั้ง project ต้องมี ADR ใหม่ + threat model รอบใหม่
2. **Readonly snapshot จาก `File.content`** (HTML mirror) เท่านั้น ไม่แตะ `File.ydoc` ไม่เปิด collab
3. **ไม่ join ข้อมูลข้างเคียง** — ไม่ส่ง comment, revision list, member list, asset ownership, mention resolve ไปกับ snapshot
4. **Asset/รูปภาพ (I-4):** v1 แนะนำ **inline/proxy ผ่าน API แบบ token-scoped** หรือกำหนดว่า snapshot เสิร์ฟเฉพาะข้อความ+รูปที่ฝัง URL ที่เปิด public อยู่แล้ว — **ต้องตัดสินใจร่วม architect** ก่อน SRS: ถ้า FileAsset ใช้ Supabase Storage แบบ signed URL อายุสั้น จะไม่ตรงกับ share link อายุยาว → อาจต้องมี asset proxy route ที่ตรวจ share token เดียวกัน ห้ามแก้ปัญหาด้วยการเปิด bucket เป็น public ทั้งใบ

### 3.2 Data model ใหม่ — `ShareLink`

ยึด pattern เดียวกับ `Invitation`/`RefreshToken` ที่มีอยู่ (opaque + SHA-256 hashed at rest — ยืนยันแล้วใน security-review §5):

```prisma
model ShareLink {
  id        String    @id @default(cuid())
  fileId    String    // scope 1:1 กับไฟล์เดียว (กัน IDOR I-1)
  projectId String    // denormalized เพื่อ validate project.deletedAt แบบ 1 hop (ตาม pattern FileAsset)
  token     String    @unique // SHA-256 hash ของ opaque token — ไม่เก็บ plaintext
  createdById String  // ต้องเป็น Owner ตอนสร้าง (audit + revoke authority)
  expiresAt DateTime? // null = ไม่หมดอายุ (ดู §3.3 — แนะนำบังคับ default TTL)
  revokedAt DateTime? // เพิกถอนทันที = set ค่านี้ (revocation แบบ soft, เก็บ audit)
  lastAccessedAt DateTime? // optional — สำหรับ UX "เปิดล่าสุด" (privacy-preserving)
  accessCount    Int      @default(0) // optional — นับการเข้าถึง ไม่เก็บ IP รายตัว
  createdAt DateTime  @default(now())

  file    File    @relation(fields: [fileId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdBy User  @relation(fields: [createdById], references: [id])

  @@index([fileId])
  @@index([projectId])
}
```

**Token design:**
- **สร้าง:** `crypto.randomBytes(32)` → base64url (256-bit entropy, ตรงกับ invite/refresh token pattern ที่ review รับรองแล้ว) — เดา/brute-force ไม่ได้เชิงปฏิบัติ (S-1)
- **เก็บ:** เก็บเฉพาะ `sha256(token)` ใน `ShareLink.token` (unique) — DB รั่วก็ไม่ได้ plaintext token (เหมือน refresh token)
- **URL:** `https://<web-origin>/share/<token>` — token อยู่ใน **path segment** (ไม่ใช่ query string — กัน I-2 ผ่าน log/referrer/analytics; สอดคล้องกฎ privacy "ห้ามใส่ข้อมูล sensitive ใน query string")
- **Lookup:** hash token ที่รับมา → `findUnique({ where: { token: hash } })` → validate revoked/expired/file-deleted → เสิร์ฟ ไม่มี match = **404** (ตอบเท่ากันทุกกรณี fail — ไม่ leak)

### 3.3 Expiry & Revocation policy

| นโยบาย | ค่าที่แนะนำ | เหตุผล |
|---|---|---|
| **Default TTL** | บังคับเลือกตอนสร้าง (เช่น 7 / 30 / 90 วัน) **แนะนำ default 30 วัน** ไม่แนะนำ "ไม่มีวันหมดอายุ" เป็น default | ลิงก์ที่ไม่หมดอายุคือหนี้ security ระยะยาว (I-2 สะสม) ให้ owner เลือก "no expiry" ได้แต่ต้องจงใจ + มี warning |
| **Revocation** | `revokedAt = now()` → มีผล **ทันทีทุก request ถัดไป** เพราะ validate ทุกครั้งที่ DB (ไม่มี cache สถานะ token, snapshot cache ต้อง key รวม revoke check) | owner ต้องยกเลิกได้ทันที (requirement) — เพราะไม่มี session/JWT ให้หมดอายุ การ validate ต่อ request คือกลไกเดียว |
| **Cascade invalidation** | ไฟล์ถูกลบ / โปรเจกต์ trash → ลิงก์ตอบ 404 อัตโนมัติ (validate `deletedAt`) | E-3 |
| **ผูกกับผู้สร้าง?** | **ไม่** ผูกความ valid กับ session ผู้สร้าง (ลิงก์ไม่ตายเมื่อ owner logout) แต่ **ควร** พิจารณา revoke ลิงก์ที่คนคนนั้นสร้างเมื่อเขาถูกถอดจาก Owner (นโยบาย — ให้ owner ปัจจุบันเห็น/จัดการได้) | สมดุลระหว่าง usability กับ least privilege |

### 3.4 การไหลของข้อมูล (public read path)

```
GET /public/share/:token              (NestJS REST, ไม่มี JwtGuard)
  └─ ShareLinkGuard (ใหม่, แยกสิ้นเชิง):
       hash(:token) → findUnique → ต้องมี & revokedAt=null & (expiresAt=null||>now)
                    → file.deletedAt=null & project.deletedAt=null
       ไม่ผ่านข้อใด → throw NotFound (404 เท่ากันหมด)
       ผ่าน → attach req.shareLink = { fileId, projectId }
  └─ Controller: อ่าน File.content ด้วย fileId "จาก req.shareLink เท่านั้น"
       (ห้ามอ่าน fileId จาก query/param อื่น — กัน E-2/I-1)
       return { fileName, contentHtml, updatedAt }  ← ไม่มี field อื่น
```

---

## 4. Guard ใหม่ (แยกจาก authz เดิมโดยสิ้นเชิง — กัน E-1)

**หลักการ:** guard ใหม่ **ต้องไม่แตะ ไม่ import ไม่ extend** `JwtGuard`/`ProjectRoleGuard` เพื่อให้เป็นไปไม่ได้ที่การเพิ่ม share link จะทำให้ authz เดิมหลวมลงโดยไม่ตั้งใจ

| ประเด็น | ข้อกำหนด |
|---|---|
| **ไฟล์/โมดูล** | โมดูลใหม่ `apps/api/src/share/` (controller/service/guard/dto แยก) — public route ทั้งหมดกระจุกที่เดียว review ง่าย |
| **Guard** | `ShareLinkGuard` ใหม่ อ่าน token จาก path param, hash, validate ตาม §3.4 — **ไม่มี** logic JWT/Membership เลย |
| **Route prefix** | แยก namespace ชัด เช่น `/public/*` หรือ `/share/*` — ตรวจใน review/test ได้ว่า route ใต้ prefix นี้ **ไม่มี** `@UseGuards(JwtGuard)` และ route อื่น **ไม่มี** `ShareLinkGuard` |
| **ห้ามปน guard** | ห้ามมี route ใดใช้ทั้งสอง guard พร้อมกัน; ห้าม share token ให้สิทธิ์กับ controller เดิม (projects/files) |
| **No mutation** | ทุก route ใต้ share guard เป็น `GET` เท่านั้น ไม่มี POST/PATCH/PUT/DELETE ผูกกับ ShareLinkGuard |
| **Collab WS ไม่แตะ** | `collab.service.ts onAuthenticate` **คงเดิมทุกบรรทัด** ไม่เพิ่ม token path — anon เข้า WS ไม่ได้ (S-2) |
| **Rate limit** | ใช้ `@Throttle` เข้มเฉพาะ public route (เข้มกว่า global 100/min เช่น 20–30/min ต่อ IP) + พิจารณา throttle ต่อ token; ปิด D-1/D-2 โดยไม่กระทบ throttle ของ authenticated route |

---

## 5. UI/UX ที่ต้องมี

### 5.1 หน้า Public Viewer (สำหรับ anon)
- **นอก `AppShell` ทั้งหมด** — ไม่มี sidebar, ⌘K command palette, notification bell, user menu (anon ไม่มีสิทธิ์เห็น + ป้องกันข้อมูลรั่วผ่าน component ที่ fetch authenticated data)
- Route ฝั่ง web: `/share/:token` — **ไม่ผ่าน `ProtectedRoute`** (เส้นทางเดียวที่ไม่ผ่าน)
- แสดง: ชื่อไฟล์, เนื้อหา HTML readonly (ใช้ renderer เดียวกับ read-mode แต่ไม่โหลด editor/Yjs bundle), badge "อ่านอย่างเดียว · แชร์แบบสาธารณะ", เวลาอัปเดตล่าสุด
- **States:** valid → เนื้อหา; 404 (ไม่มี/หมดอายุ/ถูกเพิกถอน/ไฟล์ถูกลบ) → หน้า generic "ลิงก์นี้ใช้ไม่ได้แล้ว" **เหมือนกันทุกกรณี** (ไม่บอกว่าเพราะอะไร — กัน enumeration); loading = skeleton
- **HTTP headers บนหน้านี้:** `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`, CSP เข้ม (กัน token รั่ว I-2 + กัน XSS จากเนื้อหา user-generated — ต้อง sanitize HTML snapshot ก่อน render)
- **XSS note:** เนื้อหามาจาก user-generated HTML — ต้อง sanitize (เช่น DOMPurify) ก่อน render ในหน้า public เพราะ anon viewer เป็นเป้า cross-user XSS ได้ (attacker=Editor ยัด script, victim=anon เปิดลิงก์)
- **i18n:** microcopy th/en; คำเฉพาะ `Owner/Viewer/Project` คงอังกฤษ (กฎเหล็ก #5)

### 5.2 หน้า "จัดการลิงก์แชร์" (สำหรับ Owner เท่านั้น)
- เข้าจาก header ของ WorkPage (ข้างปุ่ม history/gear) หรือ context menu ของไฟล์
- **สิทธิ์:** สร้าง/ดู/เพิกถอน = **Owner เท่านั้น** (`@MinRole(Owner)` บน management route ฝั่ง authenticated — อยู่คนละ guard กับ ShareLinkGuard) — เหตุผล: การเปิดข้อมูลสู่สาธารณะเป็นการตัดสินใจระดับ project ต้องเป็นสิทธิ์สูงสุด (ป้องกัน Editor เปิดข้อมูลรั่วโดยพลการ)
- **ตอนสร้าง:** dialog ยืนยันชัดเจน — เตือน "ใครมีลิงก์นี้เข้าดูได้โดยไม่ต้องล็อกอิน" + บังคับเลือก TTL + แสดง scope ("เฉพาะไฟล์นี้ อ่านอย่างเดียว") (ปิด I-3)
- **แสดง:** รายการลิงก์ของไฟล์, วันสร้าง/ผู้สร้าง, วันหมดอายุ, ปุ่ม **เพิกถอน** (มีผลทันที), (optional) `lastAccessedAt` + `accessCount`
- **Access log (optional, privacy-preserving):** ถ้าเก็บ "ใครเปิดดูบ้าง" — anon **ไม่มีตัวตน** ให้เก็บแค่ aggregate (`accessCount`, `lastAccessedAt`) **ห้ามเก็บ IP รายตัว/ตำแหน่ง/fingerprint** เพราะเป็น PII ของบุคคลภายนอกที่เราไม่มี consent (ผิดหลัก data minimization) — ถ้าต้องการ audit ละเอียดต้องมี ADR ความเป็นส่วนตัวแยก

---

## 6. Recommendation

### 🟢 GO-with-constraints

ฟีเจอร์นี้ **ทำได้อย่างปลอดภัย** ถ้ายึด scope แคบและทำตาม acceptance criteria §7 ครบ เหตุผล:
- ความเสี่ยงสูงสุด (I-1 IDOR, E-1 authz หลวม) จัดการได้ด้วย design: token ผูก 1 ไฟล์ + guard แยกสิ้นเชิง + no-mutation
- pattern ที่ต้องใช้ (opaque+hashed token, TTL, revoke) **มีอยู่แล้วในระบบ** (invite/refresh token) และ security review รับรองว่า implement ถูกต้อง — ความเสี่ยง implementation ต่ำเพราะลอก pattern ที่พิสูจน์แล้ว
- ความเข้าใจผิดเรื่อง "bypass RLS" ถูกเคลียร์แล้ว (§1.1) — ไม่มีการเปลี่ยน DB security model จริง มีแค่การเพิ่ม application-layer route ที่ scope แคบ

**เงื่อนไขที่ทำให้กลับเป็น 🔴 NO-GO ทันที (ถ้าละเมิดข้อใดข้อหนึ่ง):**
1. เปิด anon เข้า collab WS / เสิร์ฟ live Yjs doc แทน snapshot
2. Token scope ระดับ project (หลายไฟล์) แทน 1 ไฟล์
3. ใช้ Supabase anon key เสิร์ฟ public link (เปิด PostgREST surface กลับมา)
4. เปิด Supabase Storage bucket เป็น public ทั้งใบเพื่อแก้ปัญหารูปภาพ
5. share guard ปนกับ authz เดิม หรือมี mutation route ใต้ share token

### ⚠️ Dependency ก่อนเริ่ม (แนะนำ — ไม่บังคับ แต่ควร)
ก่อนเปิด public surface แรกของระบบ ควรปิด finding ค้างจาก `security-review-2026-07-09.md` ที่เกี่ยวข้อง: **#6 CSP** (Helmet ปิด CSP อยู่ — public viewer ต้องมี CSP), และ **#3 JWT_SECRET boot-check** (public path จะเพิ่ม attack surface โดยรวม) ส่วน #1 (dep upgrade) เป็น policy gate ของ production อยู่แล้ว

---

## 7. Acceptance Criteria ด้าน Security (srs-architect ต้องรวมใน SRS)

Token & Data:
- [ ] Token = `randomBytes(32)` (256-bit) base64url; เก็บเฉพาะ `sha256(token)` ใน DB; ไม่มี plaintext token ใน DB/log/response หลังสร้างครั้งแรก
- [ ] Token อยู่ใน URL **path segment** ไม่ใช่ query string
- [ ] `ShareLink` ผูก `fileId` เดียว (ไม่ใช่ project); response เสิร์ฟเฉพาะ **`ShareLink.publishedContent`** (snapshot ณ เวลากด "เผยแพร่" — ไม่ใช่ `File.content` แบบ real-time ตามที่เจ้าของยืนยัน 2026-07-17) + ชื่อไฟล์ + `publishedAt` — ไม่มี comment/revision/member/asset-ownership
- [ ] รูปภาพเสิร์ฟผ่าน asset-proxy ใหม่ (`GET /share/:token/assets/:assetId`) ที่ตรวจ share token เดียวกัน — ไม่ redirect ไป signed URL ของ Supabase ตรง ๆ (ตัดสินใจแล้ว)
- [ ] `ShareLink.revokedAt` ถูกตั้งอัตโนมัติเมื่อ `createdById` ไม่ใช่ Owner ของ project นั้นอีกต่อไป (ตัดสินใจแล้ว)

Guard & Authz:
- [ ] `ShareLinkGuard` เป็นไฟล์แยก ไม่ import/extend `JwtGuard`/`ProjectRoleGuard`; อยู่ใน `apps/api/src/share/` (หรือ prefix `/public`)
- [ ] ทุก share route เป็น GET; ไม่มี mutation route ใดผูกกับ ShareLinkGuard
- [ ] `collab.service.ts onAuthenticate` ไม่ถูกแก้ (test ยืนยัน anon token เข้า WS ไม่ได้)
- [ ] Test: token ของไฟล์ A เปิดไฟล์ B ไม่ได้ (E-2); token ใช้กับ route authenticated เดิมไม่ได้ (E-1); non-Owner สร้าง/เพิกถอนลิงก์ไม่ได้

Validation & Lifecycle:
- [ ] ทุก fail case (ไม่มี/หมดอายุ/ถูกเพิกถอน/ไฟล์ถูกลบ/โปรเจกต์ trash) ตอบ **404 เหมือนกัน** (ไม่ leak สถานะ)
- [ ] `revokedAt` มีผลทันทีใน request ถัดไป (validate ทุก request; snapshot cache ต้องเคารพ revoke)
- [ ] บังคับเลือก TTL ตอนสร้าง (default 30 วัน); "no expiry" ต้องจงใจเลือก + มี warning

Anti-abuse & Privacy:
- [ ] Rate-limit เฉพาะ public route ต่อ IP (เข้มกว่า global) + พิจารณาต่อ token; ไม่กระทบ throttle ของ authenticated route
- [ ] หน้า viewer ส่ง `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `Cache-Control: no-store`, CSP เข้ม
- [ ] เนื้อหา HTML snapshot ถูก **sanitize** ก่อน render (กัน stored XSS ข้าม cross-user)
- [ ] Access log (ถ้ามี) เก็บแค่ aggregate (`accessCount`/`lastAccessedAt`) — **ไม่เก็บ IP/PII ของ anon viewer**

UI:
- [ ] หน้า `/share/:token` อยู่นอก `AppShell` และไม่ผ่าน `ProtectedRoute`; ไม่ fetch authenticated data ใด ๆ
- [ ] สร้าง/เพิกถอนลิงก์ = Owner เท่านั้น; dialog สร้างมี warning "ใครมีลิงก์เข้าดูได้โดยไม่ต้องล็อกอิน" + แสดง scope

### ✅ Open questions — เจ้าของโปรเจกต์ตัดสินใจแล้ว (2026-07-17)

1. **Asset/รูปภาพ (I-4) — ตัดสิน: ทำ asset-proxy ใหม่.** เพิ่ม endpoint เฉพาะสำหรับ public link
   (เช่น `GET /share/:token/assets/:assetId`) ที่ตรวจ share token เดียวกันกับที่ยืนยัน `File.content`
   แล้วสตรีมรูปจาก Supabase Storage ผ่าน backend (ไม่ redirect ไป signed URL ตรง ๆ) — รูปจึงไม่เสีย
   แม้ signed URL เดิมของ `FileAsset` หมดอายุก่อนลิงก์ share; **ห้าม**เปิด bucket เป็น public ทั้งใบ
2. **`File.content` freshness — ตัดสิน: กด "เผยแพร่" เอง (manual publish).** เพิ่ม field
   `ShareLink.publishedContent` (snapshot HTML ณ เวลาที่ Owner กดเผยแพร่ล่าสุด) แทนการ mirror
   `File.content` แบบ real-time — Owner ต้องกดปุ่มยืนยันทุกครั้งที่ต้องการอัปเดตสิ่งที่คนนอกเห็น
   (ปลอดภัยสุดต่อ I-3: คนนอกไม่มีทางเห็นงานที่ยังแก้ไม่เสร็จ) UI ต้องมีตัวบ่งชี้ชัดเจนว่า
   "เนื้อหาที่แชร์อยู่" ต่างจาก "เนื้อหาปัจจุบันในเอกสาร" เมื่อมีการแก้ไขหลัง publish ครั้งล่าสุด
3. **นโยบายเมื่อผู้สร้างลิงก์ถูกถอด Owner — ตัดสิน: ยกเลิกอัตโนมัติ.** ผูก revoke เข้ากับ
   lifecycle ของ `Membership` — เมื่อ `createdById` ของ `ShareLink` ไม่ใช่ Owner ของ `Project` อีกต่อไป
   (ถูกลดสิทธิ์ หรือถูกเอาออกจาก project) ให้ตั้ง `revokedAt` ทันที (trigger จาก service เดียวกับที่
   จัดการ role change/removal — ดู `projects.service.ts` `PATCH members/:userId` และ `DELETE members/:userId`
   ที่มีอยู่แล้ว) ปลอดภัยสุด: ไม่มีลิงก์กำพร้าที่ไม่มีใครดูแลอยู่

---

## 8. ผลกระทบไฟล์ (อ้างอิงให้ dev — ยังไม่แตะโค้ด)
- **Schema:** เพิ่ม `model ShareLink` (รวม `publishedContent: String @db.Text`, `publishedAt: DateTime?`) + relation ใน `File`/`Project`/`User` → migration ใหม่
- **Backend:** โมดูลใหม่ `apps/api/src/share/` (public read + asset-proxy) + management route ใน `files`/`projects` (Owner-only สร้าง/เพิกถอน/เผยแพร่); **ห้ามแตะ** `collab.service.ts`, `project-role.guard.ts`
- **Auto-revoke hook:** `projects.service.ts` — จุดที่จัดการ `PATCH members/:userId` (ลดสิทธิ์) และ `DELETE members/:userId` (ถอดออก) ต้อง revoke `ShareLink` ทุกอันที่ `createdById` ตรงกับ user นั้นถ้าเขาไม่ใช่ Owner ของ project นั้นแล้ว
- **Frontend:** route `/share/:token` นอก `AppShell` + viewer readonly (sanitized) + panel จัดการลิงก์ใน WorkPage (สร้าง/เพิกถอน/**ปุ่ม "เผยแพร่"** ที่ชัดเจนว่าต่างจาก autosave ปกติ + แสดงว่าเนื้อหาที่แชร์อยู่เก่ากว่าปัจจุบันหรือไม่)
- **Shared types:** `packages/shared/src/types.ts` เพิ่ม ShareLink DTO (กฎเหล็ก #8)

---

*Threat-model / design เท่านั้น — ไม่มีการแก้ source, config หรือ Git state ของแอป*
