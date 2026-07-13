# Sprint 4 — Software Requirements Specification (Shortlist: 4 Features)

**Author:** srs-architect (Business Analyst) · **Version:** 1.0 · **สถานะ:** Draft — พร้อมส่งต่อ Architecture
**อ่านคู่กับ:** `docs/sprint4-feature-candidates.md` (การประเมิน UX/effort), `docs/decisions/0003-tech-stack-sprint4.md` (library ที่เลือกต่อฟีเจอร์), `design/DESIGN_SPEC.md` + `design/UI_GUIDELINES.md` (token/anti-slop)

**ขอบเขต sprint นี้:** Comments & inline annotations, Task/checklist blocks, Mention autocomplete UI, Templates รายงาน
**นอกขอบเขต (แยก track ตาม `0003-tech-stack-sprint4.md`):** AI ช่วยเขียน/แปล, Public share link, Export Word/Markdown/ทั้งโปรเจกต์, Tags

**สิ่งที่ตรวจโค้ดจริงก่อนเขียนสเปกนี้:** `apps/api/prisma/schema.prisma`, `apps/api/src/files/{files.controller,files.service,revisions.service}.ts`, `apps/api/src/files/dto/{file,revision}.dto.ts`, `apps/api/src/notifications/notifications.service.ts`, `apps/web/src/components/CollabEditor.tsx`, `apps/web/src/components/editor/Box.ts`, `apps/web/src/components/RevisionDiffDrawer.tsx`, `apps/web/src/pages/WorkPage.tsx`, `apps/api/src/projects/projects.controller.ts` (endpoint `members`)

---

## 1. Project Overview

- **Goal:** เพิ่ม 4 ฟีเจอร์ที่ปิดช่องว่างหลักของ concept "GitHub diff + Google Docs" ให้ Task Board — เปิดให้ review/discuss เนื้อหา (Comments), จัดการ action items ในเอกสาร (Task blocks), ลด friction การ mention (autocomplete), และลด blank-page problem ตอนเริ่มไฟล์ใหม่ (Templates)
- **Problem Statement:** ระบบมี diff/version-history (GitHub-like) และ freehand annotation บน canvas (GoodNotes-like) แต่ไม่มีช่องทาง "คุยกันเรื่องข้อความ" แบบ Google Docs comment; ระบบ mention ฝั่ง backend เสร็จแล้วแต่ user ต้องพิมพ์ `@username` เดาเอง; ไฟล์ใหม่เริ่มจากหน้าว่างเสมอ
- **Scope (IN):** โครงสร้างข้อมูล/endpoint/UI ของทั้ง 4 ฟีเจอร์ตามหมวด 3; การเปลี่ยน `CreateFileDto` ให้รับ initial content (จำเป็นสำหรับ Templates)
- **Scope (OUT):** AI-assisted writing, public unauthenticated share, export Word/Markdown/zip, Tag model ใหม่ — ทั้งหมดมีเหตุผล defer อยู่แล้วใน `docs/sprint4-feature-candidates.md` §3 (ไม่ใช่การตัดสินใจใหม่ของเอกสารนี้)
- **Key Assumptions** (ระบุชัดเพราะสเปกกำกวมบางจุด — assume แล้วต้อง validate กับ owner):
  1. **Comment ใครสร้าง/ตอบกลับได้:** สมมติว่า **ทุก role ที่เห็นไฟล์ได้ (Viewer ขึ้นไป)** สร้าง/ตอบกลับ comment ได้ — ตรงกับ mental model "Google Docs comment" ที่ candidate doc อ้างอิง (คนละสิทธิ์กับ resolve — ดูหมวด 4 open decision #2)
  2. **Comment ไม่ real-time ผ่าน Yjs awareness:** เก็บใน Postgres query ผ่าน REST เหมือน Revision/Notification (ตาม pattern rule ของ `0003-tech-stack-sprint4.md`: "เนื้อหา doc → Yjs, metadata ที่ต้อง query/notify → Postgres") — ไม่ implement WebSocket broadcast ของ comment ใหม่ใน sprint นี้ (list ใหม่เห็นได้เมื่อ refetch/เปิด panel เท่านั้น; ไม่ block ใครจากการทำงาน)
  3. **Task blocks ไม่ต้องมี "assignee" หรือ "due date"** ใน v1 — เป็นแค่ checkbox + text ตาม `@tiptap/extension-task-item` เดิม ไม่ผูกกับ user/notification
  4. **Templates เป็น static content ที่ hardcode ในโค้ด** (ไม่ใช่ user-created/editable ผ่าน UI) — ตรงกับคำแนะนำ effort **M** ใน candidate doc

---

## 2. User Roles & Permissions

ใช้ enum `Role` เดิมของระบบ (`Owner` / `Editor` / `Viewer`) ผ่าน `ProjectRoleGuard` + `@MinRole()` — ไม่เพิ่ม role ใหม่

| Role | Comments | Task blocks | Mention autocomplete | Templates |
|---|---|---|---|---|
| **Owner** | สร้าง/ตอบ/resolve/reopen/ลบของตัวเอง + ลบของทุกคน | แก้ไข (ผ่านสิทธิ์แก้เอกสารเดิม) | ใช้งานได้ | สร้างไฟล์จาก template ได้ |
| **Editor** | สร้าง/ตอบ/resolve/reopen/ลบของตัวเอง | แก้ไข | ใช้งานได้ | สร้างไฟล์จาก template ได้ |
| **Viewer** | สร้าง/ตอบได้ (ดู Assumption #1), **resolve/reopen ไม่ได้** (ดู open decision #2), ลบได้เฉพาะของตัวเอง | อ่านอย่างเดียว (เอกสารทั้งฉบับ read-only ตามสิทธิ์เดิม) | ใช้ในโหมด comment เท่านั้น (ไม่มีสิทธิ์แก้เนื้อหาเอกสาร) | สร้างไฟล์ไม่ได้ (ไม่มีสิทธิ์สร้างไฟล์อยู่แล้วในระบบเดิม) |

---

## 3. Functional Requirements

### Module: Comments & Inline Annotations
*(ลำดับทำก่อนสุดของ shortlist — ดูหมวด 6)*

#### Feature: สร้างคอมเมนต์ผูกกับข้อความที่เลือก
- **Description:** ผู้ใช้เลือกข้อความในเอกสาร → กดปุ่มคอมเมนต์ใน BubbleMenu ที่มีอยู่แล้ว (`CollabEditor.tsx`) → พิมพ์ข้อความ → ระบบไฮไลต์ช่วงที่เลือกด้วย TipTap **Mark** ใหม่ (`commentHighlight`) และบันทึกตำแหน่งแบบทนต่อการแก้ไขพร้อมกัน (Yjs `RelativePosition`)
- **User Story:** As an Editor/Owner/Viewer ที่เห็นไฟล์นี้ ฉันต้องการเลือกข้อความแล้วคอมเมนต์ตรงจุด เพื่อรีวิวเนื้อหาโดยไม่ต้องแก้เอกสารเอง
- **Acceptance Criteria:**
  - [ ] **Given** เลือกข้อความในเอกสาร (selection ไม่ว่าง), **When** กดปุ่ม "💬 คอมเมนต์" ใน BubbleMenu, **Then** เปิด popover ให้พิมพ์ข้อความแรก
  - [ ] **Given** พิมพ์ข้อความแล้วกด Enter/ส่ง, **When** บันทึกสำเร็จ, **Then** ช่วงข้อความที่เลือกไฮไลต์ทันที + comment ปรากฏใน `CommentsPanel`
  - [ ] **Given** ไม่ได้เลือกข้อความ (caret ว่าง), **When** ดู BubbleMenu, **Then** ปุ่มคอมเมนต์ไม่แสดง (BubbleMenu ทั้งก้อนไม่โผล่ตาม behavior เดิมของ TipTap)
  - [ ] **Given** body ว่างหรือมีแต่ whitespace, **When** กดส่ง, **Then** ปุ่มส่ง disabled (ไม่ยิง request เปล่า)
  - [ ] **Given** อยู่ในโหมด read-only (ไม่มีสิทธิ์แก้เอกสาร), **When** เลือกข้อความ, **Then** ยังเห็นปุ่มคอมเมนต์ (คอมเมนต์ไม่ใช่การแก้เอกสาร — ดู Assumption #1)

#### Feature: ตอบกลับ (reply) และ resolve/reopen thread
- **Description:** แต่ละคอมเมนต์เป็น root ของ thread ตอบกลับได้ 1 ระดับ (ไม่ nested ลึกกว่านี้ใน v1) พร้อมปุ่ม resolve/reopen
- **User Story:** As a reviewer ฉันต้องการตอบกลับคอมเมนต์และปิด thread เมื่อแก้ไขตามแล้ว เพื่อติดตามว่าอะไรยัง pending
- **Acceptance Criteria:**
  - [ ] **Given** เปิด `CommentsPanel`, **When** กด "ตอบกลับ" ใต้คอมเมนต์ root, **Then** เพิ่ม reply เข้า thread เดียวกัน (แสดง indent) — reply ใหม่ตอบกลับ reply อีกที **ไม่ได้** (บังคับ 1 ระดับ)
  - [ ] **Given** thread ยังไม่ resolve, **When** ผู้มีสิทธิ์กด "✓ Resolve", **Then** thread ทั้งก้อน (root+replies) เปลี่ยนสถานะเป็น resolved, mark ในเอกสารจางลง + ไอคอน checkmark
  - [ ] **Given** thread resolved แล้ว, **When** ผู้มีสิทธิ์กด "Reopen", **Then** กลับเป็น unresolved, mark กลับสีปกติ
  - [ ] **Given** ผู้ใช้ไม่มีสิทธิ์ resolve (ตาม open decision #2), **When** ดู thread, **Then** ปุ่ม Resolve ไม่แสดง (ไม่ใช่แค่ disabled — ซ่อนเพื่อไม่ชวนกดแล้ว error)

#### Feature: Comments panel (side drawer)
- **Description:** Panel รายการคอมเมนต์ทั้งไฟล์ เปิดจากปุ่มใหม่ข้าง header ของ `WorkPage.tsx` (แถวเดียวกับปุ่ม settings/history ที่มีอยู่แล้ว บรรทัด ~328) ใช้ pattern slide-in เดียวกับ `RevisionDiffDrawer.tsx`
- **User Story:** As a user ฉันต้องการดูคอมเมนต์ทั้งหมดของไฟล์ในที่เดียว กรองตามสถานะ และกระโดดไปตำแหน่งในเอกสารได้
- **Acceptance Criteria:**
  - [ ] **Given** ไฟล์มีคอมเมนต์, **When** เปิด panel, **Then** แสดง segmented filter "ทั้งหมด / ยังไม่ปิด / ปิดแล้ว" + จำนวนคอมเมนต์ที่ header (`Comments (12)`)
  - [ ] **Given** คลิกคอมเมนต์ใน list ที่ anchor resolve ตำแหน่งได้, **When** คลิก, **Then** editor scroll ไปตำแหน่งนั้น + flash highlight ชั่วคราว
  - [ ] **Given** คอมเมนต์ที่ anchor หาตำแหน่งไม่เจอ (ดูหมวด Edge Cases), **When** ดูใน list, **Then** แสดง comment ปกติแต่ **ไม่มีปุ่ม "ไปที่ตำแหน่ง"** และมี label "ตำแหน่งเดิมถูกแก้ไขแล้ว"
  - [ ] **Given** ไฟล์ไม่มีคอมเมนต์เลย, **When** เปิด panel, **Then** แสดง `EmptyState`: title "ยังไม่มีคอมเมนต์ในไฟล์นี้", body "เลือกข้อความแล้วกดไอคอนคอมเมนต์เพื่อเริ่ม"
  - [ ] **Given** กำลังโหลด comments, **When** เปิด panel, **Then** แสดง `Skeleton` 3 แถว (ไม่ใช่ spinner/ข้อความ ตาม UI_GUIDELINES กฎข้อ 3)

#### Feature: แจ้งเตือนคอมเมนต์ใหม่/ตอบกลับ
- **Description:** ต่อยอด `NotificationsService.notify()` เดิม (pattern เดียวกับ `Mention`/`Revision`) เพิ่ม `NotificationType` ใหม่ 2 ค่า
- **User Story:** As a file participant ฉันต้องการรู้เมื่อมีคนคอมเมนต์หรือตอบกลับ thread ที่ฉันเกี่ยวข้อง โดยไม่ต้องเปิดไฟล์ตลอดเวลา
- **Acceptance Criteria:**
  - [ ] **Given** user A สร้างคอมเมนต์ใหม่ในไฟล์ของ project, **When** บันทึกสำเร็จ, **Then** สมาชิก project ทุกคนยกเว้น A ที่ opt-in `notifyComment=true` ได้รับ `Notification(type=Comment)`
  - [ ] **Given** user B ตอบกลับ thread ที่ user A เป็นเจ้าของ comment root, **When** บันทึกสำเร็จ, **Then** A ได้รับ `Notification(type=CommentReply)` เพิ่มเติมจาก fan-out ปกติ (ไม่ซ้ำถ้า A อยู่ใน fan-out เดิมอยู่แล้ว — dedupe ด้วย `notify()` ที่มีอยู่แล้ว unique ids)
  - [ ] **Given** user ปิด `notifyComment` ใน settings, **When** มีคอมเมนต์ใหม่, **Then** ไม่มี notification แถวใหม่สร้างให้ user นั้น (opt-in gate เดิมทำงานเหมือน Mention/Revision)
  - [ ] **Given** การสร้าง notification ล้มเหลว (เช่น DB timeout), **When** เกิด error, **Then** การสร้าง comment ยัง**สำเร็จ** — notify เป็น side effect ที่ catch เงียบ (pattern เดียวกับ `fanOut().catch(() => undefined)` ใน `revisions.service.ts`)

---

### Module: Task/Checklist Blocks

#### Feature: แทรกและใช้งาน checklist ในเอกสาร
- **Description:** เพิ่ม `@tiptap/extension-task-list` + `@tiptap/extension-task-item` (family `^2.27.x` ตรงกับที่ติดตั้งแล้ว) เป็น extension ใหม่ใน `CollabEditor.tsx`; ไม่แตะ backend/schema — content ไหลผ่าน `Collaboration` extension เดิมเหมือน node อื่น (precedent: `Box.ts`)
- **User Story:** As a report writer ฉันต้องการแทรก action items แบบ checkbox ในเอกสาร เพื่อติดตามสิ่งที่ต้องทำโดยไม่ต้องพิมพ์ `- [ ]` เอง
- **Acceptance Criteria:**
  - [ ] **Given** วางเคอร์เซอร์ในเอกสาร, **When** กดปุ่ม "☑ Checklist" ในทูลบาร์ (เพิ่มปุ่มใหม่ข้างปุ่มแทรกตาราง/รูปภาพเดิม), **Then** แทรก task-item แรกว่างเปล่าพร้อม checkbox ที่ตำแหน่ง caret
  - [ ] **Given** กำลังพิมพ์ใน task-item, **When** กด Enter, **Then** สร้าง task-item ใหม่ต่อท้าย (ค่า default ของ extension); กด Enter บนบรรทัดว่าง → ออกจาก list (behavior มาตรฐานของ extension)
  - [ ] **Given** task-item มีข้อความแล้ว, **When** คลิก checkbox, **Then** toggle checked state และ sync ผ่าน Yjs ทันที (เหมือนพิมพ์ข้อความปกติ ไม่มี debounce เพิ่ม)
  - [ ] **Given** เอกสารมี checklist อยู่แล้ว, **When** ผู้ใช้อีกคนเปิดไฟล์เดียวกันพร้อมกัน (multi-user), **Then** เห็น toggle ของอีกฝ่าย real-time ผ่าน `Collaboration` เดิม (ไม่ต้องเขียน sync logic เพิ่ม)
  - [ ] **Given** เอกสารถูก export เป็น PDF (ปุ่มเดิม), **When** export, **Then** checklist render เป็น checkbox/checked mark ใน PDF ไม่พัง (ต้องเพิ่ม CSS สำหรับ `<ul data-type="taskList">` ใน print stylesheet ของ `WorkPage.tsx`)

---

### Module: Mention Autocomplete UI

> **หมายเหตุ:** Backend (regex-diff detection + `NotificationType.Mention` + opt-in `notifyMention`) **เสร็จสมบูรณ์แล้ว** — ฟีเจอร์นี้คือ UI-only เพิ่มเติม ไม่มี functional requirement ฝั่ง backend

#### Feature: Autocomplete รายชื่อสมาชิกเมื่อพิมพ์ `@`
- **Description:** เพิ่ม `@tiptap/extension-mention` + `@tiptap/suggestion` เรียก endpoint `GET /projects/:id/members` ที่มีอยู่แล้วมาแสดง popup กรองตามที่พิมพ์ต่อ
- **User Story:** As a document editor ฉันต้องการเห็นรายชื่อสมาชิก project ตอนพิมพ์ `@` เพื่อเลือกคนที่ถูกต้องแทนการพิมพ์เดา
- **Acceptance Criteria:**
  - [ ] **Given** เคอร์เซอร์อยู่ในเอกสาร, **When** พิมพ์ `@`, **Then** popup dropdown แสดงรายชื่อสมาชิก project (avatar + username + role tag) ดึงจาก `GET /projects/:id/members`
  - [ ] **Given** popup เปิดอยู่, **When** พิมพ์ตัวอักษรต่อจาก `@`, **Then** list กรองแบบ substring-match บน username (case-insensitive)
  - [ ] **Given** popup เปิดอยู่, **When** เลือกด้วยคลิกหรือลูกศร+Enter, **Then** แทรกเป็น mention chip (inline node, พื้นหลัง `primary-soft`) — **ต้อง render เป็น `@username` เป็น text จริงใน `getHTML()`** (ไม่ใช่แค่ data-attribute) เพื่อให้ regex เดิมใน `revisions.service.ts:169-174` จับได้
  - [ ] **Given** พิมพ์ `@` แล้วไม่มีสมาชิกที่ match, **When** ดู popup, **Then** แสดง empty state สั้น "ไม่พบสมาชิก" (ไม่ใช่ popup ว่างเปล่า)
  - [ ] **Given** พิมพ์ `@` แล้วกด Escape หรือคลิกที่อื่น, **When** ยกเลิก, **Then** popup ปิดโดยไม่แทรกอะไร ข้อความ `@` ที่พิมพ์ไปแล้วยังอยู่เป็น plain text
  - [ ] **Given** มี mention chip ที่แทรกไปแล้วถูกลบบางส่วน (เช่น backspace กลางคำ), **When** แก้ไข, **Then** chip ทั้งก้อนถูกลบเป็นหน่วยเดียว (atomic node, ไม่แตกเป็นตัวอักษร) — ป้องกัน mention เพี้ยนที่ regex จับไม่ได้

---

### Module: Templates รายงาน

#### Feature: เลือก template ตอนสร้างไฟล์ใหม่
- **Description:** เพิ่ม step เลือก template ใน modal "สร้างไฟล์ใหม่" เดิม; เนื้อหาเริ่มต้นเป็น static HTML constant (th/en) hardcode ในโค้ด ผูก locale ปัจจุบันของ user
- **User Story:** As a new user ฉันต้องการเริ่มไฟล์จาก template สำเร็จรูป เพื่อไม่ต้องเผชิญหน้าว่างและจัด format รายงานเอง
- **Acceptance Criteria:**
  - [ ] **Given** เปิด modal "+ ไฟล์ใหม่", **When** ดู modal, **Then** เห็นตัวเลือก "เริ่มจาก": เอกสารเปล่า (ค่าเดิม, default) / รายงานความคืบหน้า / สรุปการประชุม / ข้อเสนอโครงการ
  - [ ] **Given** เลือก template ที่ไม่ใช่ "เอกสารเปล่า" แล้วกด "สร้าง", **When** สร้างสำเร็จ, **Then** `File.content` ถูก seed ด้วย template string ของภาษาที่ตรงกับ `UserSetting.language` ปัจจุบัน (th/en)
  - [ ] **Given** เลือก "เอกสารเปล่า" (ค่าเดิม), **When** สร้าง, **Then** พฤติกรรมเหมือนเดิมทุกประการ (`content: ''`) — ไม่ regression ของ path เดิม
  - [ ] **Given** สร้างไฟล์จาก template สำเร็จ, **When** เปิดไฟล์ครั้งแรก, **Then** เนื้อหาที่เห็นในเอกสาร (ผ่าน editor init) ตรงกับ template ที่เลือก 100% (ไม่มี artifact จาก HTML escape ผิด)
  - [ ] **Given** สร้างไฟล์จาก template แล้วเปิด editor พร้อมกัน 2 คน (collab), **When** ทั้งคู่ดู, **Then** เห็นเนื้อหา template เดียวกัน (content ถูก seed ก่อน Yjs doc เริ่มต้น ไม่ใช่ race condition ระหว่าง 2 client)

---

## 4. Non-Functional Requirements

- **Performance:**
  - Comments panel โหลด initial list < 300ms สำหรับไฟล์ที่มี comment ≤ 200 รายการ (pagination ยังไม่บังคับใน v1 แต่ถ้า > 200 ให้ธง backlog ไว้)
  - Mention autocomplete popup แสดงผล < 150ms หลังพิมพ์ `@` (endpoint `members` มีอยู่แล้ว, cache ผลใน frontend ระหว่างเปิดไฟล์เดียวกัน — ไม่ query ซ้ำทุกครั้งที่พิมพ์)
  - Task block toggle ต้องไม่เพิ่ม latency ที่สังเกตได้เหนือการพิมพ์ข้อความปกติ (เพราะเดินทาง Yjs channel เดียวกัน)
- **Security / Authz:**
  - ทุก endpoint ของ Comments อยู่ใต้ `JwtGuard` + `ProjectRoleGuard` + `@MinRole()` แบบเดียวกับ `FilesController` (nested `/projects/:id/files/:fileId/comments`)
  - แก้ไข/ลบ comment ต้องตรวจ **ownership** เพิ่มเติมจาก role (เจ้าของ comment หรือ Owner ของ project เท่านั้น) — ป้องกัน Editor คนหนึ่งลบ comment ของอีกคน
  - Input sanitize: `body` ผ่าน `class-validator` (`@IsString`, `@MaxLength`) เหมือน pattern เดิมทุก DTO ในระบบ — เนื้อหา comment เป็น plain text ไม่ใช่ HTML (ป้องกัน XSS โดยไม่ต้อง render เป็น HTML)
  - Mention autocomplete เรียก endpoint `members` ที่มี guard เดิมอยู่แล้ว — ไม่เพิ่ม attack surface ใหม่
- **Realtime (Yjs):**
  - Task blocks: บังคับต้องเป็น ProseMirror node ภายใต้ `Collaboration` extension เดิม (ไม่สร้าง state channel แยก)
  - Comments: anchor **ต้อง**ใช้ Yjs `RelativePosition` ไม่ใช่ absolute offset (absolute offset จะเพี้ยนทันทีที่มีคนอื่นแก้ไขเอกสารก่อนหน้าตำแหน่งนั้น) — metadata (body/author/resolvedAt) เก็บ Postgres ไม่ใช่ Yjs doc (query/notify ได้)
- **i18n (th/en):**
  - i18n keys ใหม่ที่ต้องเพิ่มทั้งสองภาษา: `comments.*` (panel, empty states, filter labels), `tasklist.*` (toolbar tooltip), `mentions.*` (empty state), `templates.*` (ชื่อ template ทั้ง 4 ชุด + label "เริ่มจาก")
  - Template content เอง (เนื้อหาตัวอย่างในเอกสาร) ต้องมีชุด th และ en แยกกัน ไม่ใช่แปลอัตโนมัติ
- **Accessibility:**
  - ปุ่มคอมเมนต์ใน BubbleMenu, checkbox ใน task-item, mention chip, radio selector ใน template modal — ทั้งหมดต้องเป็น `<button>`/`<input>` จริง มี `aria-label` ตามกฎ UI_GUIDELINES ข้อ 6 (ห้าม `<div onClick>`)
  - Comments panel segmented filter ใช้ `role="tablist"`/`aria-selected` (pattern เดียวกับ `ColorSwatches` ใน `ThemeSwitcher.tsx`)
  - Mention popup ต้อง keyboard-navigable เต็ม (ลูกศรขึ้น/ลง + Enter + Escape) ไม่พึ่งเมาส์อย่างเดียว
- **Reliability:** Notification fan-out ของ Comments เป็น side effect เท่านั้น — ห้าม throw/block การสร้าง comment หลัก (pattern `.catch(() => undefined)` เดิม)

---

## 5. Data Models / Database Entities

### Entity: Comment *(ใหม่)*

```json
{
  "id": "String @id @default(cuid())",
  "fileId": "String — FK File.id, onDelete: Cascade",
  "authorId": "String — FK User.id",
  "parentId": "String? — FK Comment.id (self-relation), null = root ของ thread, non-null = reply (จำกัด 1 ระดับ บังคับที่ application layer ไม่ใช่ schema)",
  "body": "String @db.Text — เนื้อหาคอมเมนต์ plain text, max 5000 ตัวอักษร (validate ที่ DTO)",
  "anchorFrom": "Json — serialized Yjs RelativePosition ของจุดเริ่มไฮไลต์",
  "anchorTo": "Json — serialized Yjs RelativePosition ของจุดสิ้นสุดไฮไลต์",
  "anchorText": "String — plain-text snapshot ของช่วงที่ถูกไฮไลต์ ณ เวลาสร้าง ใช้เป็น fallback label เมื่อ anchor resolve ไม่ได้ (ดู Edge Cases)",
  "sourceRevisionId": "String? — FK Revision.id (nullable, onDelete: SetNull) ⚠️ รอ ADR: ใช้ตามกลยุทธ์ anchor-restore ที่ architect เลือก (ดูหมวด 6 Open Decision #1) — ถ้าเลือก option (b) field นี้อาจไม่จำเป็น",
  "resolvedAt": "DateTime?",
  "resolvedById": "String? — FK User.id",
  "createdAt": "DateTime @default(now())",
  "updatedAt": "DateTime @updatedAt"
}
```
**Relationships:** `File` has many `Comment` (cascade delete เมื่อไฟล์ถูกลบถาวร — ไม่ใช่ soft-delete). `User` has many `Comment` (as author) และ many (as resolver ผ่าน `resolvedById`). `Comment` self-relation (`parentId` → replies). `Comment` optionally references `Revision` (`sourceRevisionId`).

**Index ที่ต้องมี:** `@@index([fileId])` (list ต่อไฟล์), `@@index([fileId, resolvedAt])` (filter ทั้งหมด/ยังไม่ปิด/ปิดแล้วเร็ว), `@@index([parentId])` (โหลด replies ของ thread)

### Entity: Notification *(แก้ enum เดิม — ไม่ใช่ model ใหม่)*

```json
{
  "type": "NotificationType — เพิ่มค่าใหม่ 2 ค่า: 'Comment', 'CommentReply' (ต่อยอด enum เดิม: ProjectInvite | Mention | Revision)"
}
```
**Migration note:** เพิ่มค่า enum ใน Postgres ต้องใช้ `ALTER TYPE ... ADD VALUE` (Prisma migration ปกติ) — ไม่ breaking กับข้อมูลเดิม

### Entity: UserSetting *(แก้ field เดิม — ไม่ใช่ model ใหม่)*

```json
{
  "notifyComment": "Boolean @default(true) — opt-in สำหรับ NotificationType.Comment และ CommentReply ร่วมกัน (ไม่แยก 2 toggle ใน v1 เพื่อลด UI ซับซ้อน — ถ้า owner ต้องการแยกภายหลังค่อยเพิ่ม field)"
}
```

### DTO Change: CreateFileDto *(ไม่ใช่ schema — เป็น API contract change จำเป็นสำหรับ Templates)*

```json
{
  "content": "String? @IsOptional @IsString @MaxLength(5_000_000) — เนื้อหาเริ่มต้นเมื่อสร้างไฟล์จาก template; ถ้าไม่ส่งมา ใช้ default '' เหมือนเดิม (backward-compatible กับ path เอกสารเปล่า)"
}
```
**หมายเหตุสถาปัตยกรรม:** `FilesService.create()` ปัจจุบัน hardcode `content: dto.kind === 'Document' ? '' : null` (`files.service.ts:79`) — ต้องแก้เป็น `dto.kind === 'Document' ? (dto.content ?? '') : null`

### Entity: Template Registry *(ไม่ใช่ Prisma model — frontend constant ตามคำแนะนำ effort M ใน candidate doc)*

```json
{
  "id": "string — 'progress' | 'meeting-notes' | 'proposal' (คงที่ ไม่ query จาก DB)",
  "labelTh": "string",
  "labelEn": "string",
  "contentTh": "string — HTML seed ภาษาไทย",
  "contentEn": "string — HTML seed ภาษาอังกฤษ"
}
```
**เก็บที่:** ไฟล์ constant ใหม่ฝั่ง `apps/web/src` (เช่น `lib/templates.ts`) — ไม่มี CRUD/endpoint ใน v1

---

## 6. Logic Flows & Important Edge Cases

### Flow: สร้างและ resolve คอมเมนต์

1. User เลือกข้อความ → editor คำนวณ Yjs `RelativePosition` ของจุดเริ่ม/จบ selection ปัจจุบัน
2. Client ส่ง `POST /projects/:id/files/:fileId/comments` พร้อม `{ body, anchorFrom, anchorTo, anchorText }`
3. Server validate role (Viewer ขึ้นไป — ตาม Assumption #1) + สร้าง `Comment` row + fan-out notification (non-blocking)
4. Client ได้ comment ใหม่กลับมา → เพิ่ม mark ไฮไลต์ใน editor local ทันที (optimistic) + เพิ่มใน `CommentsPanel`
5. User อื่นเปิด panel/refetch → เห็นคอมเมนต์ใหม่ (ไม่ real-time ผ่าน WS ตาม Assumption #2)
6. ผู้มีสิทธิ์กด Resolve → `PATCH .../comments/:commentId/resolve` → mark จางลง

**Edge Cases & Required Handling:**

| Scenario | Expected System Behavior |
|---|---|
| Selection ครอบคลุมหลาย block (เช่น ข้าม paragraph, ข้าม table cell) | อนุญาต — mark ต้องรองรับ multi-node range เหมือน bold/italic mark ปัจจุบันทำได้ |
| Selection ครอบคลุมช่วงที่มี comment mark อยู่แล้ว (ซ้อนคอมเมนต์) | อนุญาตให้ซ้อนได้ (marks ซ้อนกันได้ตาม ProseMirror ปกติ) — เมื่อคลิกข้อความที่ซ้อน ให้แสดง comment ทั้งหมดที่ anchor คาบเกี่ยว ไม่ใช่แค่ตัวบนสุด |
| Anchor resolve ไม่ได้ (ข้อความที่เคย highlight ถูกลบทิ้งไปแล้วโดยการแก้ไขปกติ ไม่ใช่ restore) | comment ยังอยู่ใน list, ไม่มีปุ่ม "ไปที่ตำแหน่ง", label "ตำแหน่งเดิมถูกแก้ไขแล้ว" (เหมือนกรณี restore revision) |
| **User restore revision เก่าผ่าน `HistoryModal`** | ⚠️ **ต้องตัดสินใจ — ดูหมวด 6 Open Decision #1 ไม่ใช่ปล่อยให้ dev เจอเอง** |
| ลบไฟล์ (soft-delete เข้า Trash) | Comments ยังอยู่ใน DB (ไม่ cascade เพราะ File แค่ soft-delete) — panel ต้องไม่ query ไฟล์ที่ `deletedAt != null` ได้ (ใช้ guard เดิมของ `requireDocument` pattern) |
| ลบไฟล์ถาวร (purge จาก Trash) | Comments ถูกลบจริงตาม cascade (`onDelete: Cascade` ที่ FK `fileId`) |
| User ที่ resolve comment ถูกลบออกจาก project ภายหลัง | `resolvedById` ยังเก็บไว้ (ไม่ null) — แสดงชื่อผู้ resolve จาก snapshot ตอน query join กับ `User` (ถ้า user ถูกลบทั้งระบบจริง onDelete cascade จาก `User` จะลบ comment ของเขาด้วย ไม่ใช่แค่ leave project) |
| สร้าง comment พร้อมกัน 2 คนในตำแหน่งใกล้กันมาก (concurrent) | ไม่ conflict — แต่ละ comment เป็น row อิสระ Yjs RelativePosition แต่ละอันคำนวณจาก state ของตัวเอง ไม่ชนกัน |
| Reply ถูกส่งไปยัง comment ที่เพิ่ง resolve พร้อมกัน (race) | Reply ยังบันทึกได้ (ไม่บล็อกการตอบ thread ที่ resolved) — แต่ UI ควรแจ้งเตือนเบาๆ ว่า thread นี้ resolved แล้ว |

### Flow: Mention autocomplete → ตรวจว่า regex เดิมยังจับได้

1. User พิมพ์ `@` → popup แสดงสมาชิก (จาก `GET /projects/:id/members`, cache ระดับ session ของไฟล์ที่เปิด)
2. User เลือกสมาชิก → editor แทรก mention node
3. **จุดเสี่ยงต้อง QA เข้ม:** `renderHTML()` ของ mention node ต้อง output ข้อความที่มี `@username` literal อยู่จริงใน HTML string (ไม่ใช่แค่ `data-mention="username"` โดยไม่มี `@` ปรากฏ) เพราะ `mentions()` regex ใน `revisions.service.ts:169-174` ทำงานกับ HTML string ตรงๆ — ถ้า render ผิด mention จะเงียบไม่มี notification เลยโดยไม่มี error ให้เห็น

**Edge Cases & Required Handling:**

| Scenario | Expected System Behavior |
|---|---|
| พิมพ์ `@` ตามด้วย username ที่ไม่ใช่สมาชิก project (พิมพ์เอง ไม่ผ่าน autocomplete) | ยังคงเป็น plain text ตามพฤติกรรมเดิม (ไม่ error) — regex เดิมจะไม่ match เพราะ user ไม่อยู่ใน `members` query อยู่แล้ว ระบบเงียบเหมือนเดิม (ไม่ใช่ regression แต่เป็น known gap ที่ autocomplete แก้แค่ discoverability ไม่ได้แก้ 100%) |
| Username มีอักขระพิเศษที่ regex ต้อง escape (`.`, `+`, ฯลฯ) | มี `.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` อยู่แล้วใน backend — ฝั่ง frontend ไม่ต้องทำอะไรเพิ่ม แค่ต้องมั่นใจว่า render HTML ตรงตัวอักษรไม่ encode ผิด |
| Project มีสมาชิกจำนวนมาก (> 50 คน) | popup ต้อง scroll ได้ และควร limit แสดงผล ~10 รายการแรกที่ match ก่อน scroll (ไม่ query ใหม่ทุก keystroke — filter ฝั่ง client จาก cache) |
| ลบสมาชิกออกจาก project หลังมี mention เก่าอยู่ในเอกสารแล้ว | mention chip เดิมยังอยู่ในเอกสาร (เป็นแค่ text/node) — ไม่ auto-cleanup ใน v1 |

### Flow: สร้างไฟล์จาก Template

1. User เปิด modal สร้างไฟล์ → เลือก template card (แทน radio ธรรมดา ตาม UI_GUIDELINES กฎ "หลีกเลี่ยง AI tell" — การ์ดเลือกได้ ไม่ใช่ 3-feature-card ตกแต่ง)
2. Client resolve `templateId` → content string ตาม locale ปัจจุบัน (`i18n.language`)
3. `POST /projects/:id/files` พร้อม `{ name, kind: 'Document', parentId, orientation, content }`
4. Backend เก็บ `content` ตรงตามที่ส่งมา (ไม่มี transform เพิ่ม)

**Edge Cases & Required Handling:**

| Scenario | Expected System Behavior |
|---|---|
| User สลับภาษา (th↔en) ระหว่างเปิด modal ค้างไว้ | content ที่ seed ใช้ locale ณ ตอนกด "สร้าง" ไม่ใช่ตอนเปิด modal |
| Template content string เกิน `MaxLength(5_000_000)` ของ DTO | ไม่เกิดขึ้นจริง (template เป็น seed สั้นๆ) — แต่ validation เดิมจะ reject ถ้ามีคน tamper request ตรงๆ ผ่าน API |
| สร้างไฟล์แบบ "เอกสารเปล่า" (ไม่เลือก template) | `content` ไม่ส่งไปเลย (undefined) → backend fallback `''` เหมือน behavior เดิมทุกประการ — ห้าม regression |
| Kind เป็น `Folder` แต่ dto มี `content` ติดมาด้วย (ผิดปกติ/tamper) | Backend ignore `content` เมื่อ `kind !== 'Document'` (ตาม logic เดิม `dto.kind === 'Document' ? (dto.content ?? '') : null`) |

---

## 7. Recommended Enhancements (Analyst Notes)

- **Comment mark สีตาม token ระบบ** — ใช้ `warn`/`accent` token ที่มีอยู่ใน `UI_GUIDELINES.md` ไม่ hardcode สีใหม่ (highlight สีเหลืองอ่อนที่ candidate doc พูดถึงต้อง map เป็น semantic token จริง ไม่ใช่ hex ใหม่)
- **ปุ่ม "ดูกิจกรรมทั้งหมด" เชื่อม Comments เข้ากับ Activity feed ในอนาคต** — ไม่ใช่ scope sprint นี้ แต่ตั้งชื่อ `NotificationType.Comment`/`CommentReply` ให้สอดคล้องกับ pattern เดิมเพื่อให้ Activity page ในอนาคต query รวมได้ง่าย (ไม่ต้อง refactor enum ทีหลัง)
- **Task list ควร reuse toolbar ปุ่มเดิม ไม่สร้าง slash-command menu ใหม่** — ตาม feedback ของ candidate doc (`ต้องดูโค้ด toolbar จริงตอนทำ SRS ว่าปัจจุบันมี "/" command menu หรือใช้ปุ่ม toolbar ธรรมดา`) — ตรวจโค้ดแล้วพบว่า `CollabEditor.tsx` **ไม่มี slash-command** ใช้ปุ่ม toolbar ธรรมดาทั้งหมด (ปุ่มแทรกตาราง/รูป/กล่อง) → เพิ่มปุ่ม toolbar ธรรมดาตามที่ candidate doc แนะนำไว้แล้วเป็นทางเลือกเดียวที่ถูกต้อง ไม่ต้องสร้าง command palette ใหม่

---

## 8. ลำดับ Implement + Dependency

| ลำดับ | ฟีเจอร์ | Dependency | เหตุผล |
|---|---|---|---|
| **1** | **Comments & inline annotations** | **ต้องรอ ADR จาก `fullstack-architect-mentor` ก่อนเริ่ม dev จริง** (Open Decision #1 ด้านล่าง) | เป็นตัวเดียวที่มีคำถามสถาปัตยกรรมค้าง — ถ้าปล่อยไว้ท้าย sprint จะกลายเป็นคอขวด ตาม `sprint4-feature-candidates.md` §5 |
| 2 | Task/checklist blocks | ไม่มี — เริ่มคู่ขนานได้ทันที | Effort ต่ำสุด, ไม่แตะ backend/schema, ไม่มีคำถามค้าง |
| 3 | Mention autocomplete UI | ไม่มี — เริ่มคู่ขนานได้ทันที | Backend เสร็จแล้ว 100%, เป็น UI-only |
| 4 | Templates รายงาน | ไม่มี dependency ต่อฟีเจอร์อื่น แต่ต้องรอ dev สร้าง `CreateFileDto.content` field ก่อน (งาน backend เล็กมาก 1 บรรทัด) | เป็น quick win ที่โน้มเอียง M effort เพราะต้องแก้ backend DTO+service เล็กน้อย |

**คำแนะนำการมอบหมาย:** ส่ง Comments เข้าคิว `fullstack-architect-mentor` ก่อนสุดเพื่อปิด Open Decision #1/#2 → จากนั้น `senior-fullstack-dev` ทำ Task blocks + Mentions UI + Templates คู่ขนานได้ทันทีโดยไม่ต้องรอผล Comments (ไม่มี shared file ที่ชนกันยกเว้น `CollabEditor.tsx` ที่ทั้ง Comments/Task-blocks/Mentions ต้องแตะร่วมกัน — **แนะนำให้ dev คนเดียวรับทั้ง 3 ฟีเจอร์ที่แตะ `CollabEditor.tsx`** เพื่อลด merge conflict แทนที่จะกระจาย 3 คน)

---

## Open Decisions — ต้องให้ Architecture ตัดสินใจก่อนเริ่ม Dev (ไม่ตัดสินในเอกสารนี้)

### Open Decision #1: กลยุทธ์ anchor ของ Comment เมื่อ user restore revision เก่า

**ปัญหา:** เมื่อ user ใช้ `HistoryModal` restore เอกสารกลับไปเวอร์ชันเก่า เนื้อหาปัจจุบันถูกเขียนทับ ตำแหน่ง Yjs `RelativePosition` ของ comment ที่ผูกกับเนื้อหา "หลัง" revision ที่ถูก restore ทับอาจไม่มีอยู่จริงในเอกสารใหม่แล้ว หรือ resolve ไปตำแหน่งที่บริบทเปลี่ยนไปโดยสิ้นเชิง

**ทางเลือก (ตามที่ ux-ui-design-architect เสนอไว้ใน `sprint4-feature-candidates.md`):**

| ตัวเลือก | กลไก | ข้อดี | ข้อเสีย |
|---|---|---|---|
| **(a) Mark เป็น "orphaned" แต่ยังอ่านได้** *(แนะนำ — ปลอดภัยสุด)* | ผูก `sourceRevisionId` ตอนสร้าง comment; เมื่อ restore เกิดขึ้นและ revision ปัจจุบันของไฟล์เปลี่ยนไปจาก `sourceRevisionId` เดิม (หรือ anchor resolve ไม่ได้จริง) → แสดง comment เป็น orphaned (ไม่มีปุ่มไปตำแหน่ง, label ชัดเจน) แต่ไม่ลบ ไม่ block การใช้งาน | Implement ง่าย, ไม่มีความเสี่ยง false-positive re-anchor ผิดตำแหน่ง, UX สื่อสารตรงไปตรงมา | User ต้องอ่าน comment "ลอย" โดยไม่เห็นบริบทเดิมในเอกสาร (mitigation: มี `anchorText` snapshot ให้อ่านใน panel) |
| **(b) Re-anchor อัตโนมัติด้วย fuzzy text match** | ใช้ `anchorText` snapshot ค้นหาข้อความใกล้เคียงในเอกสารหลัง restore แล้วคำนวณ `RelativePosition` ใหม่ | Comment ยังคง "ติดอยู่" กับข้อความแม้ตำแหน่งเปลี่ยน UX ลื่นกว่า | ซับซ้อนกว่ามาก, ความเสี่ยง bug สูง (fuzzy match ผิดตำแหน่งแบบ silent เสี่ยงกว่าการบอกตรงๆ ว่า orphaned), effort เพิ่มขึ้นมาก |

**ผลต่อ schema:** field `sourceRevisionId` ใน `Comment` model (หมวด 5) ออกแบบรองรับ option (a) ไว้แล้ว — ถ้า architect เลือก (b) อาจต้องเพิ่ม field เก็บ fuzzy-match metadata เพิ่มเติม (ไม่ได้ออกแบบไว้ในเอกสารนี้เพราะยังไม่ตัดสินใจ)

**ผู้ตัดสินใจ:** `fullstack-architect-mentor` (ตามที่ `sprint4-feature-candidates.md` §5 ระบุไว้ว่าต้องคุยกับ srs-architect ก่อนสเปกละเอียด — ตอนนี้ทั้งสองทางเลือกถูกวางเป็น requirement + ทางเลือกแล้ว พร้อมให้ตัดสินใจ)

### Open Decision #2: ระดับสิทธิ์ resolve comment

**ปัญหา:** Owner/Editor เท่านั้นที่ resolve/reopen ได้ หรือ Viewer ที่เห็นไฟล์ทำได้ด้วย

**สมมติฐานที่ใช้เขียน AC ในเอกสารนี้ (หมวด 3):** **Owner/Editor เท่านั้น** resolve/reopen ได้ — Viewer สร้าง/ตอบกลับ comment ได้ (เหมือน Google Docs commenter) แต่ resolve ไม่ได้ (เหตุผล: resolve เปลี่ยนสถานะ thread ที่กระทบทุกคน ใกล้เคียงกับสิทธิ์ "แก้ไข" มากกว่า "แสดงความเห็น")

**ทางเลือกอื่น:** เปิดให้ Viewer resolve ได้ด้วย (ลดความซับซ้อนของ permission matrix แต่เสี่ยง Viewer ปิด thread ที่ Editor ยังไม่แก้จริง)

**ผู้ตัดสินใจ:** Owner/PM ยืนยันสมมติฐานนี้ก่อน dev เริ่ม (ความเสี่ยงต่ำกว่า Open Decision #1 มาก — ถ้าไม่ยืนยัน ให้ยึดสมมติฐานเริ่มต้นนี้ไปก่อนได้)

---

### 🤝 HANDOFF

**จาก:** srs-architect (Business Analyst)
**ถึง:** `fullstack-architect-mentor` — ตัดสินใจ Open Decision #1 (บังคับก่อนเริ่ม dev Comments) และยืนยัน/แก้ Open Decision #2 → ต่อด้วย `senior-fullstack-dev` (Task blocks, Mentions UI, Templates เริ่มคู่ขนานได้ทันทีไม่ต้องรอ)

**ไฟล์ผลงาน:** `docs/SRS-sprint4.md` (ไฟล์นี้)

**Definition of Done ของเอกสารนี้:** ทั้ง 4 ฟีเจอร์มี user story + acceptance criteria (Given/When/Then) + edge cases + data entity ครบตามที่ตรวจสอบแล้วในหมวด 3/5/6 — Comments มี open decision ที่ตั้งใจ**ไม่ตัดสินเอง** (ตามคำสั่ง PM) ส่งต่อให้ architect ตัดสินใจก่อน

**สิ่งที่ผู้รับงานต่อควรอ่านก่อนเริ่ม:**
1. หมวด 6 "Open Decisions" — โดยเฉพาะ Open Decision #1 ที่บล็อกการเริ่ม dev Comments
2. หมวด 5 "Data Models" — field `sourceRevisionId` ของ `Comment` ออกแบบรองรับ option (a) ไว้ล่วงหน้า แต่ยังไม่ finalize
3. หมวด 8 "ลำดับ Implement" — คำแนะนำให้ dev คนเดียวรับ 3 ฟีเจอร์ที่แตะ `CollabEditor.tsx` ร่วมกัน เพื่อลด merge conflict
