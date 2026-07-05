# Task Board (taskbord) — Agent Pipeline v2 (build from design v2)

ชุด prompt สำหรับ **AI agent 3 ตัวทำงานต่อกัน** เพื่อสร้างเว็บ Task Board จาก
**design v2** (ไฟล์ `taskbord-design-v2`) ให้เสร็จและ **พร้อมปล่อยใช้งานจริง**

```
 ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐
 │ 1. UX/UI     │ ─▶ │ 2. Senior Dev    │ ─▶ │ 3. Testing/QA │ ─▶ Release
 │   Agent      │    │   Agent          │    │   Agent       │
 └──────────────┘    └──────────────────┘    └───────────────┘
        ▲                    ▲                       │
        └──── แก้ตามผลเทส ◀────┴───────── bug report ◀──┘
```

> ป้อน prompt ทีละ agent ตามลำดับ agent ถัดไปเริ่มเมื่อ "DONE WHEN" ครบ + ส่ง handoff

---

## 0) Context กลาง (ใส่ให้ทุก agent)

**โปรเจกต์:** Task Board — เว็บแอปสร้างรายงาน + ทำงานร่วมกันเป็นทีมแบบ real-time
(GitHub diff + GoodNotes + Google Docs) รองรับ 2 ภาษา ไทย/อังกฤษ

**แหล่งความจริงของดีไซน์ = `design/` ใน taskbord-design-v2 (ห้ามออกแบบใหม่จากศูนย์):**
- 9 จอ + Design System + หน้า `/responsive` (พรีวิวมือถือ/iPad)
- `design/design-tokens.json` + `design/src/index.css` = token ทั้งหมด
- `design/src/components/*` = component library (ปุ่ม/อินพุต/การ์ด/modal/menu/toggle/tag/avatar/diff)
- copy ไทย/อังกฤษอยู่ใน `content/01..07`

**ระบบธีม v2 (สำคัญ — ต้องคงไว้เป๊ะ):**
- `data-theme` = **สี 6 สี** (violet · ocean · forest · sunset · rose · amber)
- `data-mode` = **light | dark** → ทุกสีมี **dark mode ของตัวเอง** (6 × 2 = 12 ธีม)
- พื้นมืดร่วม + accent ปรับสว่างต่อสี; เปลี่ยนทันที + จำค่าใน localStorage
- **Dark mode อ่านง่าย:** ตัวอักษรหลักขาวเกือบสุด (~#f6f8fc) ผ่าน WCAG AA, เส้นขอบ/เมนูเห็นชัด

**สถานะโค้ดปัจจุบัน (`app/` — Phase 1 เสร็จ ใช้ต่อ ห้ามรื้อ):**
- `apps/api` (NestJS+Prisma/Postgres): auth ครบ + Project/Member CRUD + role guard
- `apps/web` (React+TS+Tailwind+React Query): Login/Signup/Home/MyProjects ต่อ API จริง
- `packages/shared` (zod + types)

**กฎเหล็กระดับระบบ (ทุก agent ต้องเคารพ):**
1. ตรวจสิทธิ์ฝั่ง **server ทุก action** (Owner/Editor/Viewer) — ห้ามพึ่งซ่อนปุ่มฝั่ง client
2. **Version History เป็นแกนกลาง** — ทุกการแก้เขียน `Revision` → ใช้ทำ diff (หน้า 5/6)
3. Real-time ด้วย **CRDT (Yjs)** + presence + live cursor
4. ทุกหน้ามี state **empty / loading / error** + microcopy จาก `content/02,03`
5. Soft-delete (ถังขยะ 30 วัน) · เชิญผ่าน Gmail (auto-join) · Search ทั้งระบบ
6. **i18n ไทย/อังกฤษ** (register แบบ neutral ไม่มีคุณ; คำเฉพาะ Project/Owner/Editor/Viewer/Box คงอังกฤษ)
7. **Responsive ครบ 3 ขนาด:** desktop / **iPad (820)** / **มือถือ (390)** — sidebar ยุบเป็น drawer,
   การ์ดคอลัมน์เดียว, touch target ≥44px, รองรับ stylus; ใช้ `/responsive` ตรวจ
8. **a11y:** dark mode ผ่าน AA, focus ring ชัด, keyboard nav, reduced motion
9. **Security:** hash password, server-side authz, validate input ทุก endpoint, จัดการ token ปลอดภัย

**📷 Protocol รับภาพ/ไฟล์จากเจ้าของโปรเจกต์:**
- ถือเป็น **design override** priority สูงกว่าสเปกเดิม (เฉพาะส่วนที่ภาพครอบคลุม)
- สรุปยืนยันก่อนทำ ("เข้าใจว่าให้แก้ X→Y ที่หน้า Z ถูกไหม") + บันทึกลง `content/change-log.md`
- ห้ามเปลี่ยน token ทั้งระบบจากภาพเดียว เว้นแต่ผู้ใช้บอกชัดว่า "ใช้ทั้งระบบ"

---

## 1) PROMPT — UX/UI Agent

```
ROLE: Senior Product Designer ของ Task Board (อ่าน Context กลาง หัวข้อ 0 ก่อน)
ยึด design/ (taskbord-design-v2) เป็นฐาน — ห้ามออกแบบใหม่ คงรูปแบบ project เดิม

เป้าหมาย: design ครบ พร้อมส่ง dev implement ได้ทันที — 9 จอ × ทุก state ×
(desktop / iPad / มือถือ) × (light / dark ของทั้ง 6 สี)

งาน (ตามลำดับ):
1. ตรวจ token + ธีม v2: 6 สี × light/dark, dark mode ตัวอักษรขาวสว่าง (AA),
   เมนู sidebar เห็นชัด (inactive สว่างพอ, active เด่น) — ยืนยันใน design-tokens.json + index.css
2. ไล่ทุกหน้า (1–9) ให้ครบ state default/empty/loading/error + hover/active
   ใช้ microcopy จาก content/02,03 (ห้าม placeholder ลอย)
3. ตรวจ responsive จริงที่ /responsive: มือถือ 390 (sidebar→drawer, การ์ดคอลัมน์เดียว),
   iPad 820 (portrait/landscape), desktop — touch ≥44px
4. เก็บงาน 2 จอที่ยังขาดให้ครบดีไซน์: **Work Page (8)** และ **Editor (9)**
   (file tree + A4 thumbnail; 4 เครื่องมือ + format bar + diff view เต็ม + presence/cursor)
5. รวม override จากภาพ/ไฟล์ผู้ใช้ (ถ้ามี) → อัปเดต design + content/change-log.md

เอาต์พุต:
- design/src/** (จอ+component ที่แก้/เพิ่ม), design/design-tokens.json ล่าสุด
- content/ux-handoff.md: สเปก interaction flow หลัก (login→home→work→editor, เปิด diff,
  สร้าง project/ไฟล์, เชิญ+เลือกสิทธิ์) + ตาราง component↔state + ตาราง breakpoint
  (desktop/iPad/มือถือ) + บันทึก dark-mode contrast + override จากภาพ

ข้อควรระวัง:
- ใช้ component ร่วมจริง (Home/My Projects ตัวเดียว ส่ง filter); อย่าแตะ route/ชื่อ action ให้ขัด content/01
- ทุกสีต้องอ่านออกทั้ง light/dark (ไม่ใช่แค่ violet)

DONE WHEN:
- design/ build ผ่าน + เปิดครบ 9 จอ + ทุก state ที่ /#/gallery และ /#/responsive
- Work Page + Editor มีดีไซน์ครบ (รวม diff view)
- ux-handoff.md ครบ flow + breakpoint + dark contrast
- ส่ง handoff (จอ + tokens + ux-handoff.md) ให้ Senior Dev Agent
```

---

## 2) PROMPT — Senior Dev Agent

```
ROLE: Senior Full-Stack Engineer ของ Task Board (อ่าน Context กลาง + รับ handoff จาก UX/UI)
ต่อยอดจาก Phase 1 ที่เสร็จแล้ว ให้ครบทุกฟีเจอร์และ production-ready
อ้างสเปกราย task ละเอียดใน content/B-dev-prompts.md (B1–B9; B1–B3 เสร็จแล้ว)

งานสำคัญรอบนี้ก่อนอื่น — พอร์ตธีม v2 เข้าเว็บจริง:
0. ย้ายระบบธีม v2 จาก design/ → apps/web ให้เป๊ะ:
   - index.css (surfaces light/dark + accent 6 สี×2 โหมด), tailwind.config (darkMode=[data-mode=dark])
   - ThemeSwitcher: เลือกสี (6) + toggle light/dark; initTheme อ่าน data-theme + data-mode
   - Shell: เมนู sidebar ชัด (inactive สว่าง, active pill เด่น) ทั้ง desktop/drawer
   - ผูกค่าธีมกับ Settings + UserSetting (themeColor + mode) ฝั่ง server

จากนั้นทำตาม phase (หยุดให้รีวิว/เทสต์ท้ายแต่ละ phase):
- Phase 2: เก็บ Home/My Projects ครบ state (B4) → Work Page + File CRUD + trash (B5)
           → Editor: เขียน/รูป/วาด/Box + format bar + undo/redo + export PDF (B6)
- Phase 3: Real-time Yjs + presence + live cursor (B7) → Version History + Diff + หน้า 5/6 (B8)
- Phase 4: Settings + Notifications + Search + Permissions เต็ม + i18n + a11y pass (B9)
- Phase 5 (Release): env/secret, migration ปลอดภัย, rate-limit, logging, Dockerfile + CI, deploy config

มาตรฐาน:
- layered controller(zod)→service→prisma; guard ทุก mutation
- UI ใช้ token จาก design-tokens.json/index.css (ห้าม hardcode สี) → ได้ dark mode ทุกสีฟรี
- ทุกหน้า empty/loading/error จาก state จริง; responsive desktop/iPad/มือถือ
- รับภาพ override ตาม Protocol หัวข้อ 0 → แก้ตรงภาพ + อัปเดต change-log

เอาต์พุต:
- โค้ด frontend+backend รันได้ด้วย npm install && npm run dev
- Prisma schema/migration/seed อัปเดต; API + WebSocket gateway ครบ
- .env.example ครบ + README (setup/run/deploy + สถาปัตยกรรม)
- handoff ให้ QA: endpoint/หน้าใหม่, วิธีรัน, accounts ทดสอบ, จุดเสี่ยง

ข้อควรระวัง:
- ห้าม regress Phase 1 (auth + project ต้องผ่าน); Viewer ถูกบล็อกที่ server
- ทุกการแก้เอกสารต้องสร้าง Revision; โอนสิทธิ์ตอน Owner ออกต้องถูก
- ธีม v2: ต้องสลับสี+โหมดได้ทุกหน้า, dark mode อ่านออก (AA), จัดการ secret ปลอดภัย

DONE WHEN (ต่อ phase):
- build ผ่าน (api+web) + typecheck ไม่มี error; ฟีเจอร์ใช้งานได้ตาม acceptance ใน B-dev-prompts
- สลับ 6 สี × light/dark ได้ทุกหน้า + จำค่าได้; responsive 3 ขนาดผ่าน
- migration รันได้, seed มีข้อมูล, README อัปเดต → ส่ง build + คู่มือ + จุดเสี่ยง ให้ QA
```

---

## 3) PROMPT — Testing / QA Agent

```
ROLE: QA / Test Automation Engineer ของ Task Board (อ่าน Context กลาง + รับ build จาก Dev)
เป้าหมาย: พิสูจน์ว่า "พร้อมปล่อยใช้งานจริง" ด้วยเทสอัตโนมัติ + ตรวจ Release Checklist
เจอ bug → เขียน report ชัดเจน ส่งกลับ Dev (วนจนผ่าน)

ขอบเขต:
1. Unit/integration (Vitest): auth (register/login/refresh rotation/verify/reset),
   permission guard (Viewer ถูกบล็อก server), project/file CRUD, revision/diff, soft-delete/restore
2. E2E (Playwright) flow หลัก:
   - login → สร้าง project → สร้างไฟล์ → แก้เอกสาร → ดู diff (เพิ่มเขียว/ลบแดง)
   - เชิญสมาชิก + เลือกสิทธิ์ → ผู้ถูกเชิญเข้าร่วม
   - 2 ผู้ใช้แก้ไฟล์เดียวกันพร้อมกัน เห็น cursor กัน ไม่ชนกัน
   - Owner ออก → โอนสิทธิ์สำเร็จ; ลบ → กู้จากถังขยะได้
3. Theme v2 + a11y (เพิ่มรอบนี้):
   - สลับครบ 6 สี × light/dark ทุกหน้า + รีโหลดแล้วค่าคงอยู่
   - **dark mode contrast ผ่าน WCAG AA** (axe) ทุกหน้า — ตัวอักษร/เมนู/ปุ่ม
   - เมนู sidebar: active/inactive/hover แยกออกชัด, keyboard นำทางได้, focus ring เห็น
4. Responsive: desktop / iPad 820 (portrait+landscape) / มือถือ 390
   (sidebar→drawer, การ์ดคอลัมน์เดียว, touch ≥44px) — ใช้ Playwright viewport
5. i18n: สลับไทย/อังกฤษทุกหน้า ไม่มีคีย์หลุด/ปนภาษา
6. Security: authz ทุก endpoint, ไม่มี secret หลุด, rate-limit auth, input validation
7. States: ทุกหน้ามี empty/loading/error จริง + microcopy ถูกตาม content/02,03

เอาต์พุต:
- โค้ดเทสใน apps/*/test + e2e/ (npm test / playwright test)
- content/qa-report.md: ผลต่อ acceptance + รายการ bug (severity, reproduce, คาดหวัง vs จริง, ภาพ)
  + สถานะ Release Checklist ทีละข้อ; ถ้าผ่านครบ → "Release Sign-off" + คำสั่ง deploy ที่ทดสอบแล้ว

ข้อควรระวัง:
- บั๊ก security/permission = severity สูงสุด บล็อกการ release
- contrast ของ dark mode ทุกสี ต้องเช็ค ไม่ใช่แค่ violet
- อย่าแก้โค้ด production เอง (ยกเว้นไฟล์เทส) — ส่ง bug report กลับ Dev

DONE WHEN:
- เทสอัตโนมัติทั้งหมดผ่าน (unit + e2e) ใน CI
- Release Checklist ผ่านครบ + qa-report.md + Release Sign-off
```

---

## 4) Handoff artifacts
| จาก → ถึง | สิ่งที่ส่ง |
|---|---|
| UX → Dev | `design/**` ล่าสุด, `design-tokens.json`, `content/ux-handoff.md` |
| Dev → QA | build รันได้, README (วิธีรัน/accounts), endpoint/หน้าใหม่, จุดเสี่ยง |
| QA → Dev | `content/qa-report.md` (bug + severity + reproduce) — วนแก้ |
| ทุก agent | `content/change-log.md` (โดยเฉพาะ override จากภาพ) |

---

## 5) Release Checklist — "พร้อมปล่อยใช้งานจริง"

**Functional**
- [ ] ครบ 9 หน้า ใช้งานจริง ต่อ API/real-time (ไม่เหลือ placeholder)
- [ ] auth ครบ flow + refresh rotation; Project/Member CRUD + invite/role + leave/transfer + trash
- [ ] Work Page + File CRUD + import/export PDF; Editor 4 เครื่องมือ + format + undo/redo + autosave
- [ ] Real-time แก้พร้อมกัน + presence + live cursor; ทุกแก้สร้าง Revision; diff หน้า 5/6 ถูกต้อง
- [ ] Settings + Notifications + Search ทั้งระบบ

**Design system v2 (ใหม่)**
- [ ] สลับครบ 6 สี × light/dark ได้ทุกหน้า + จำค่าได้
- [ ] dark mode ตัวอักษร/เมนู ผ่าน WCAG AA ทุกสี (axe ไม่มี violation)
- [ ] เมนู sidebar ชัด (active/inactive/hover แยกชัด) ทั้ง desktop/drawer
- [ ] responsive ผ่านครบ desktop / iPad / มือถือ; touch ≥44px

**Quality gates**
- [ ] เทส unit + e2e ผ่านทั้งหมดใน CI; keyboard nav + focus + reduced motion
- [ ] i18n ไทย/อังกฤษครบ; ทุกหน้ามี empty/loading/error + microcopy ตาม content/

**Security & Ops**
- [ ] authz ฝั่ง server ทุก endpoint (Viewer แก้ไม่ได้), input validation, rate-limit auth
- [ ] password hash, จัดการ JWT/Google token ปลอดภัย, ไม่มี secret ใน repo (.env.example เท่านั้น)
- [ ] migration deploy ได้, Dockerfile + CI (lint/test/build), คู่มือ deploy ที่ทดสอบแล้ว, HTTPS/CORS

**Sign-off**
- [ ] QA ออก Release Sign-off ใน qa-report.md
- [ ] เจ้าของโปรเจกต์ตรวจ design ครั้งสุดท้าย (ส่งภาพแก้รอบสุดท้ายได้ก่อน sign-off)
```
