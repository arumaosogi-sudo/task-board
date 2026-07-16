# Editor Revamp — Software Requirements Specification

**Author:** srs-architect (Business Analyst) · **Version:** 1.0 · **สถานะ:** Draft — พร้อมส่งต่อ UX/UI + Architecture
**ขอบเขต:** (A) แก้ 3 บั๊กใน `CollabEditor` (ใส่ภาพบันทึกไม่ได้ / redo ไม่ทำงาน / วาดไม่ลง A4) และ (B) รื้อ toolbar เป็น 3 โหมดหลัก (เขียน/วาด/แทรก)

**อ่านคู่กับ:** `docs/SRS-sprint4.md` (pattern เดิมของ editor), `docs/decisions/` (ถ้ามี ADR เกี่ยวกับ Yjs/Collaboration)

**โค้ดที่ตรวจจริงก่อนเขียนสเปกนี้ (branch `chore/sprint4-prep`):**
`apps/web/src/components/CollabEditor.tsx`, `apps/web/src/components/DrawingCanvas.tsx`, `apps/web/src/components/editor/{Box.ts,ResizableImage.ts,ResizableImageView.tsx,drawing.ts}`, `apps/api/src/main.ts`, `apps/api/src/files/dto/file.dto.ts`, `apps/api/src/files/files.controller.ts`, `apps/api/src/collab/collab.service.ts`

---

## 1. Project Overview

- **Goal:** ทำให้ผู้ใช้พิมพ์รายงาน วาดภาพ และแทรกสื่อในเอกสารได้โดยไม่เจอบั๊กที่บล็อกงาน พร้อมจัดหมวด toolbar ใหม่ให้ตรงกับ 3 พฤติกรรมการทำเอกสารจริง
- **Problem Statement:** (1) ใส่ภาพแล้วกด save ได้ 413 เพราะ REST body limit เริ่มต้นของ Express (~100KB) เตะก่อนถึง DB — ภาพเป็น base64 data URL ฝังใน `getHTML()` mirror ที่ยิงผ่าน `PUT :fileId/content`; (2) ปุ่ม redo เรียก `editor.chain().focus().redo().run()` ผ่าน Yjs `UndoManager` ซึ่งไม่ reliable (คอมเมนต์ในโค้ดยืนยันเอง: "redo returns false spuriously"); (3) `DrawingCanvas` ใช้ canvas คงที่ 720×460 (สัดส่วน ≈1.565) ไม่ตรง A4 (1.414/0.707) และไม่รับรู้ orientation ของเอกสาร; (4) toolbar ปัจจุบันยัดทุกปุ่ม (ฟอนต์/format/table/checklist/image/draw/box) เป็นแถวเดียว ไม่มีการจัดกลุ่มตามงาน
- **Scope (IN):** แก้ root cause ของบั๊กทั้ง 3, ปรับ `CollabEditor` toolbar เป็น 3 โหมด (Write/Draw/Insert), เปลี่ยน `DrawingCanvas` ให้ใช้สัดส่วน A4 ตาม orientation, (ถ้าเลือก Option A) เพิ่ม image-upload endpoint + storage
- **Scope (OUT):** เปลี่ยน engine วาด (ยังใช้ pointer-event SVG เดิม), เพิ่มเครื่องมือวาดใหม่ (shape tool, layer), เปลี่ยน schema `File.ydoc`/Hocuspocus persistence, mobile-native gesture tuning (คงพฤติกรรม pointer เดิม), รื้อ Box/Table/Checklist extension ภายใน (map เข้าโหมดใหม่เท่านั้น ไม่แก้ logic)
- **Key Assumptions:**
  1. **Image upload = Option (a) แนะนำ** — ดูเหตุผลใน §7 Open Decisions #1 (ต้อง confirm กับ owner ก่อน implement)
  2. Yjs `Collaboration` extension คุมเนื้อหาเอกสารอยู่แล้ว — แก้ redo ต้องอยู่ "ภายใต้" Yjs UndoManager ไม่ใช่เปิด StarterKit `history` กลับมา (จะชนกัน ตามคอมเมนต์ในโค้ดบรรทัด 8-9)
  3. โหมด Draw ยังคง modal-based UX เดิม (ไม่ inline บนหน้าเอกสาร) — เปลี่ยนแค่ trigger ที่ toolbar + สัดส่วน canvas ภายใน
  4. ผู้ใช้เอกสารเดียวมี orientation เดียว (`portrait`/`landscape`) อยู่แล้วใน `File.orientation` — ใช้ค่านี้กำหนด A4 canvas โดยตรง ไม่ต้องเพิ่ม field ใหม่

---

## 2. User Roles & Permissions

ใช้ role เดิม (`Owner`/`Editor`/`Viewer`) ไม่เพิ่ม role ใหม่ — ทุก requirement ในเอกสารนี้ใช้กับผู้ใช้ที่มีสิทธิ์แก้ไข (Owner/Editor) เท่านั้น เพราะ toolbar ทั้งหมดถูกซ่อนเมื่อ `readOnly` (`{!readOnly && ...}` ใน `CollabEditor.tsx:363`)

| Role | เขียน/วาด/แทรก | อัปโหลดภาพ |
|---|---|---|
| Owner / Editor | ทำได้ทั้งหมดตามสิทธิ์แก้เอกสารเดิม | ได้ |
| Viewer | ไม่เห็น toolbar (เดิม) | ไม่ได้ |

---

## 3. Functional Requirements

### Module A — Bug Fixes

#### Feature A1: ใส่ภาพแล้วบันทึกได้จริง
- **Description:** แก้ root cause 413 ที่ `PUT :fileId/content` เมื่อ HTML mirror มีภาพ base64 ฝังอยู่
- **User Story:** As an Editor ฉันต้องการแทรกภาพในรายงานแล้วให้ระบบบันทึกสำเร็จ โดยไม่เจอ error หรือข้อมูลหาย
- **Acceptance Criteria:**
  - [ ] **Given** แทรกภาพขนาด ≤ ขีดจำกัดที่กำหนด (ดู §7 #1), **When** รอ autosave (1s debounce) หรือกด save, **Then** `PUT :fileId/content` ตอบ 200 ไม่ใช่ 413
  - [ ] **Given** ภาพถูกแทรกและ sync ผ่าน Yjs แล้ว, **When** reload หน้า/เปิดไฟล์ใหม่, **Then** ภาพยังอยู่ครบ (ไม่เพี้ยน/ไม่หาย)
  - [ ] **Given** ผู้ใช้เลือกไฟล์เกินขีดจำกัดขนาด/ผิดชนิด, **When** เลือกไฟล์, **Then** แจ้งเตือนก่อน upload (ไม่ปล่อยให้ fail หลัง sync)
  - [ ] **Given** เครือข่ายขาดหายระหว่าง upload, **When** upload ล้มเหลว, **Then** แจ้ง error ชัดเจน + ไม่ insert node ภาพเปล่า/broken ลงเอกสาร
  - [ ] **Given** สอง client แทรกภาพพร้อมกันในเอกสารเดียว (real-time), **When** ทั้งคู่ sync, **Then** ภาพทั้งสองปรากฏถูกตำแหน่งไม่ conflict (Yjs CRDT รับประกันอยู่แล้ว แต่ต้องยืนยันด้วย test)

#### Feature A2: Undo/Redo ทำงานถูกต้องทั้งคู่
- **Description:** แก้ redo ให้ reliable ภายใต้ Yjs `UndoManager`, คง keyboard shortcut เดิม
- **User Story:** As an Editor ฉันต้องการกด redo แล้วเนื้อหาที่ undo ไปกลับมาจริง ทั้งจากปุ่มและ Ctrl+Y
- **Acceptance Criteria:**
  - [ ] **Given** พิมพ์ข้อความแล้วกด undo, **When** กด redo (ปุ่มหรือ Ctrl+Y/Ctrl+Shift+Z), **Then** ข้อความที่ถูก undo กลับมาครบ
  - [ ] **Given** undo/redo stack ว่าง, **When** กดปุ่ม, **Then** ปุ่ม disabled (ไม่ no-op เงียบ ๆ เหมือนปัจจุบัน) — ต้องหาทางอ่าน stack state ที่ reliable กว่า `can().undo()/redo()` เดิม หรือ track เอง
  - [ ] **Given** มีผู้ใช้อื่น edit เอกสารพร้อมกัน (multi-client), **When** ผู้ใช้ A กด undo/redo, **Then** กระทบเฉพาะ edit ของ A เท่านั้น (Yjs UndoManager scope ต่อ client-origin อยู่แล้ว — ต้องยืนยันด้วย test ไม่ regress)
  - [ ] **Given** วาดภาพแล้วแทรกเป็นภาพในเอกสาร, **When** undo, **Then** ภาพถูกลบออกจาก doc ได้เหมือน node อื่น (drawing ไม่มี undo stack แยกในตัวเอกสาร — เฉพาะภายใน modal เท่านั้น)

#### Feature A3: วาดภาพลง canvas สัดส่วน A4
- **Description:** เปลี่ยน `DrawingCanvas` จาก 720×460 คงที่ เป็นสัดส่วน A4 (210:297) โดยอิง `orientation` ของเอกสารที่กำลังแก้ไข
- **User Story:** As an Editor ฉันต้องการวาดภาพที่พอดีกับหน้ากระดาษ A4 ของรายงาน โดยไม่ต้องมาปรับสัดส่วนเองทีหลัง
- **Acceptance Criteria:**
  - [ ] **Given** เอกสาร orientation = portrait, **When** เปิดโหมดวาด, **Then** canvas viewBox มีอัตราส่วน 210:297 (เช่น 420×594)
  - [ ] **Given** เอกสาร orientation = landscape, **When** เปิดโหมดวาด, **Then** canvas viewBox มีอัตราส่วน 297:210
  - [ ] **Given** วาดเสร็จแล้วกด "แทรกลงเอกสาร", **When** SVG ถูกแปลงเป็น data URL ภาพ, **Then** ภาพที่แทรกคงสัดส่วน A4 เดิม ไม่ถูก stretch โดย `ResizableImage`
  - [ ] **Given** เปิดโหมดวาดบนอุปกรณ์จอเล็ก (mobile/tablet), **When** canvas render, **Then** ยังคง aspect ratio A4 (scale ลงทั้งกรอบ ไม่ crop)

### Module B — Toolbar 3 โหมด

#### Feature B1: สลับโหมด เขียน/วาด/แทรก
- **Description:** แทน toolbar แถวเดียวปัจจุบันด้วย segmented control 3 โหมด ที่ด้านบน; แต่ละโหมดโชว์เฉพาะปุ่มของตัวเอง
- **User Story:** As an Editor ฉันต้องการสลับโหมดชัดเจนระหว่างพิมพ์/วาด/แทรกสื่อ เพื่อไม่ต้องหาปุ่มท่ามกลาง toolbar ยาว
- **Mapping ของเดิม → โหมดใหม่:**

| ของเดิม (ปุ่ม/ฟีเจอร์) | โหมดใหม่ |
|---|---|
| Font family/size, bold/italic/underline, H1/H2/¶, bullet/ordered list, align L/C/R, Table (`insertTable` + `TABLE_ACTIONS` BubbleMenu), Checklist (`toggleChecklist`) | **เขียน (Write)** |
| ปุ่มวาดภาพ (`setDrawOpen(true)`) → เปิด `DrawingCanvas` modal | **วาด (Draw)** |
| ปุ่มแทรกรูปภาพ (`fileRef.current?.click()`), แทรก/ลบ Box (`insertBox`, ปุ่มลบ box) | **แทรก (Insert)** |
| Undo/Redo | **ใช้ร่วมทุกโหมด** (ดู state sharing ด้านล่าง) |

- **State ที่ใช้ร่วมข้ามโหมด (ไม่ผูกกับโหมดใดโหมดหนึ่ง):**
  - Undo/Redo — คง global ที่หัว toolbar เสมอ (แก้ตาม A2) เพราะ user ต้อง undo ได้ไม่ว่ากำลังอยู่โหมดไหน
  - Save/autosave (`onChange` debounce 1s) — ทำงานเบื้องหลังไม่ขึ้นกับโหมด
  - Yjs sync/presence/cursor — ไม่ผูกกับโหมด (โหมดเป็น UI state ฝั่ง client ล้วน ๆ ไม่ sync ข้าม client)
- **Acceptance Criteria:**
  - [ ] **Given** เปิดเอกสารที่มีสิทธิ์แก้ไข, **When** โหลด editor, **Then** เริ่มที่โหมด "เขียน" เป็นค่าเริ่มต้น
  - [ ] **Given** อยู่โหมดใดก็ตาม, **When** คลิก segmented control อีกโหมด, **Then** สลับ UI ปุ่มทันทีโดยไม่ reset selection/caret ในเอกสาร
  - [ ] **Given** สลับโหมด, **When** ดู undo/redo, **Then** ปุ่มยังอยู่และ enable/disable ตาม stack เดิม (ไม่ reset)
  - [ ] **Given** ใช้คีย์บอร์ด, **When** กด Tab ไปยัง segmented control, **Then** เปลี่ยนโหมดได้ด้วยลูกศรซ้าย/ขวา + Enter (a11y — ARIA `role="tablist"`/`role="tab"`)
  - [ ] **Given** ผู้ใช้อื่น online บนเอกสารเดียวกัน, **When** ผู้ใช้ A สลับโหมด, **Then** ไม่กระทบ UI ของผู้ใช้ B (โหมดเป็น local UI state ไม่ sync)

#### Feature B2: โหมดเขียน (Write)
- **Description:** รวม format controls + table + checklist ของเดิมทั้งหมด ไม่เปลี่ยน logic เพียงย้ายตำแหน่ง
- **Acceptance Criteria:**
  - [ ] ปุ่มทั้งหมดใน GROUPS เดิม (bold/italic/underline/heading/list/align) + font family/size + insertTable + toggleChecklist ปรากฏในโหมดนี้เท่านั้น
  - [ ] Table BubbleMenu ยังทำงานเหมือนเดิมเมื่อ caret อยู่ในตาราง โดยไม่ขึ้นกับโหมดปัจจุบัน (BubbleMenu ผูกกับ selection ไม่ใช่โหมด)

#### Feature B3: โหมดวาด (Draw)
- **Description:** ปุ่มเปิด `DrawingCanvas` modal (ปากกา/เน้นข้อความ/ยางลบ/สี/ขนาด/undo-redo-ภายใน-modal) บน canvas A4 ตาม A3
- **Acceptance Criteria:**
  - [ ] อยู่โหมดวาด, **When** เปิด modal, **Then** modal เปิดแบบ portal เดิม (ไม่ชนกับ ProseMirror DOM ตาม comment ในโค้ด)
  - [ ] Undo/redo **ภายใน** modal (`history`/`ptr` ของ DrawingCanvas) เป็นคนละ stack กับ undo/redo ของเอกสาร — ต้องระบุใน UI ให้ชัด (ปุ่มแยกกัน ไม่ปนกับ toolbar หลัก) เพื่อไม่ให้ผู้ใช้สับสน

#### Feature B4: โหมดแทรก (Insert)
- **Description:** ปุ่มแทรกภาพ (upload) และแทรก/ลบ Box
- **Acceptance Criteria:**
  - [ ] ปุ่มแทรกภาพเปิด file picker → รัน flow ตาม A1 (upload หรือ base64 ตาม decision ที่เลือก)
  - [ ] ปุ่มแทรก Box และปุ่มลบ Box (enable เฉพาะ caret อยู่ใน box) อยู่ในโหมดนี้ พฤติกรรมเดิมไม่เปลี่ยน

---

## 4. Non-Functional Requirements

- **Real-time:** ทุกการแก้ไข (ภาพ/box/table/checklist/format) ต้อง sync ผ่าน Yjs เหมือนเดิม — การรื้อ toolbar เป็น UI-only change ต้องไม่แตะ extension list ที่กระทบ CRDT schema (`ResizableImage`, `Box`, `Table*`, `TaskList/TaskItem`)
- **Performance:** เปิดโหมดวาด/แทรกต้องไม่ block main thread ใน editor (modal lazy ตามเดิม); autosave debounce คงที่ 1s
- **Accessibility:** segmented control ต้องมี keyboard navigation + `aria-label`/`aria-selected` (ตาม pattern `aria-pressed` ที่ใช้อยู่แล้วในปุ่มอื่นของไฟล์นี้); ปุ่มทุกปุ่มต้องมี `title`/`aria-label` ภาษาที่ตรงกับ locale
- **i18n (th/en):** ป้ายชื่อโหมด ("เขียน"/"Write", "วาด"/"Draw", "แทรก"/"Insert") ต้องผ่าน `useTranslation()` เหมือน key `tasklist.insert` ที่มีอยู่แล้ว — ปุ่มอื่นในไฟล์นี้ปัจจุบัน hardcode ภาษาไทย (tech debt เดิม ไม่ใช่ scope ของงานนี้ แต่ label โหมดใหม่ต้องไม่เพิ่ม debt ซ้ำ)
- **ขนาดไฟล์:** ดู §7 #1 — ไม่ว่าเลือก option ใด ต้องมี hard limit ที่ enforce ทั้ง client (แจ้งก่อน upload) และ server (validate ก่อนเขียน DB)

---

## 5. Data Models / Endpoint ที่ต้องเปลี่ยน

**เฉพาะกรณีเลือก Option (a) ใน §7 #1 (แนะนำ):**

### Entity: `FileAsset` (ใหม่ — ถ้าไม่มี asset table อยู่แล้ว)
```json
{
  "id": "string (cuid) — PK",
  "fileId": "string — FK -> File.id",
  "projectId": "string — FK -> Project.id (denormalized สำหรับ authz query เร็ว)",
  "url": "string — storage URL/key",
  "mimeType": "string — image/png | image/jpeg | image/webp | image/svg+xml",
  "sizeBytes": "int",
  "createdBy": "string — FK -> User.id",
  "createdAt": "datetime"
}
```
**Relationships:** `File` has many `FileAsset`; `Project` has many `FileAsset` (cascade delete ตาม `File`/`Project` เดิม)

### Endpoint ใหม่
- `POST /projects/:projectId/files/:fileId/assets` — multipart upload, auth เดิม (`ProjectRoleGuard` + `@MinRole(Editor)`), validate mimeType/size, เก็บลง storage (Supabase Storage หรือ local `/uploads` + reverse proxy — ตัดสินใจใน ARCHITECTURE.md), คืน `{ url }`
- ภาพในเอกสารเปลี่ยนจาก `<img src="data:image/...">` เป็น `<img src="{storage url}">` — `ResizableImage` extension ไม่ต้องแก้ (ยัง render `<img src>` ปกติ) แต่ `allowBase64: true` ที่ `CollabEditor.tsx:207` ควรพิจารณาปิดหลังย้าย (กันโค้ดเก่า/paste รูปกลับมา base64 อีก — ระบุใน Open Decision #1)

**เฉพาะกรณีเลือก Option (b) (ไม่แนะนำ):**
- แก้ `apps/api/src/main.ts`: เพิ่ม `app.useBodyParser('json', { limit: '10mb' })` (หรือเทียบเท่าใน Nest 10) ก่อน `ValidationPipe`
- แก้ `SaveContentDto.content` และ `CreateFileDto.content` ที่ `apps/api/src/files/dto/file.dto.ts` — เพิ่ม `@MaxLength` ให้พอสำหรับ base64 ภาพที่อนุญาต (เช่น ภาพ 3MB → base64 ~4MB → ต้องเผื่อ multiple ภาพต่อเอกสาร)
- **ไม่ต้องมี** entity/endpoint ใหม่ — แต่ `ydoc` (Postgres `Bytes`) และ `File.content` mirror จะโตขึ้นเรื่อย ๆ ตามจำนวนภาพ (ผลกระทบระยะยาวต่อ query/backup — ระบุใน Open Decision #1)

---

## 6. Logic Flows & Edge Cases

### Flow: แทรกภาพ (Option a — upload)
1. ผู้ใช้อยู่โหมด "แทรก" → กดปุ่มภาพ → เลือกไฟล์
2. Client validate: ชนิดไฟล์ (image/*), ขนาด ≤ limit → ถ้าไม่ผ่าน แจ้ง error ทันที ไม่ยิง request
3. Client upload multipart ไป `POST .../assets` → รับ `{ url }`
4. Client เรียก `editor.chain().focus().setImage({ src: url }).run()` → sync ผ่าน Yjs ตามปกติ
5. Debounced HTML mirror (`onChange`) ส่ง `<img src="{url}">` ไป `PUT :fileId/content` — payload เล็กมาก ไม่ชน body limit อีกต่อไป

**Edge Cases & Required Handling:**
| Scenario | Expected System Behavior |
|---|---|
| Upload ภาพล้มเหลว (network/5xx) | ไม่ insert node ภาพ, แจ้ง error, ให้ retry ได้ |
| ภาพขนาด/ชนิดไม่ผ่าน validate | Reject ก่อน upload พร้อมข้อความชัดเจน (ชนิด/ขนาดที่รองรับ) |
| ผู้ใช้ปิดแท็บระหว่าง upload กำลังทำงาน | Upload ที่ยังไม่จบไม่ถูก insert (ไม่มี partial node ค้าง) |
| Storage ลบ/ไฟล์หาย ภายหลัง (URL 404) | `<img>` แสดง broken-image icon ปกติของ browser — ไม่ crash editor (ไม่ต้องมี custom fallback ใน scope นี้ ระบุเป็น future work) |
| ลบไฟล์เอกสารทั้งไฟล์ | `FileAsset` ของไฟล์นั้นถูกลบ (cascade) — ป้องกัน storage orphan |

### Flow: Undo/Redo ข้ามโหมด
1. ผู้ใช้พิมพ์ในโหมดเขียน → สลับไปโหมดแทรก → แทรกภาพ → กด undo
2. Undo ต้องย้อน "การกระทำล่าสุดของ client นี้" (แทรกภาพ) ไม่ว่ากำลังอยู่โหมดไหน — undo stack ไม่ผูกกับโหมด

**Edge Cases & Required Handling:**
| Scenario | Expected System Behavior |
|---|---|
| Undo stack ว่าง (เพิ่งเปิดไฟล์ ยังไม่แก้อะไร) | ปุ่ม undo disabled |
| Redo stack ว่าง (undo จนสุดหรือยังไม่ undo) | ปุ่ม redo disabled |
| แก้ไขใหม่หลัง undo (ไม่ redo) | Redo stack ถูกล้าง (พฤติกรรมมาตรฐาน, Yjs UndoManager ทำให้อยู่แล้ว) |
| ผู้ใช้อื่น edit แทรกระหว่างที่เรา undo/redo | Undo/redo กระทบเฉพาะ origin ของ client ตัวเอง (Yjs UndoManager `trackedOrigins`) — ต้องยืนยันด้วย test ว่า config ปัจจุบันตั้ง `trackedOrigins` ถูกต้อง ไม่ใช่แค่ default |

### Flow: วาดภาพ A4 → แทรกเอกสาร
1. โหมดวาด → เปิด modal → canvas ตั้งสัดส่วนตาม `orientation` ของไฟล์ที่เปิดอยู่
2. วาดเสร็จ → "แทรกลงเอกสาร" → SVG → data URL → `setImage`

**Edge Cases & Required Handling:**
| Scenario | Expected System Behavior |
|---|---|
| ผู้ใช้เปลี่ยน orientation เอกสาร (ถ้าฟีเจอร์นี้มีอยู่แล้ว) ขณะ modal เปิดค้าง | canvas ที่กำลังวาดอยู่ **ไม่** เปลี่ยนสัดส่วนกลางคัน (จะทำ stroke เพี้ยน) — อ่าน orientation ตอนเปิด modal ครั้งเดียว |
| วาดว่างเปล่าแล้วกดแทรก | ปุ่ม "แทรกลงเอกสาร" disabled เมื่อ `strokes.length === 0` (พฤติกรรมเดิม คงไว้) |
| วาดบน viewBox ใหญ่ขึ้น (A4 ที่ 420×594 แทน 720×460) | เส้นที่วาด (`pointFromEvent` แปลงพิกัดผ่าน `rect.width`/`W`) ต้อง scale ถูกต้องไม่เพี้ยนสัดส่วนสไตลัส |

---

## 7. Open Decisions (ต้องยืนยันกับ owner ก่อน implement)

1. **Image handling: Option (a) Upload เป็นไฟล์/URL [แนะนำ] vs Option (b) ขยาย body limit + คง base64**
   - **(a) แนะนำ:** แก้ root cause จริง (payload เอกสารเล็กลงมหาศาล, `ydoc`/`File.content` ไม่บวมตามจำนวนภาพ, เปิดทางทำ CDN/resize ในอนาคต) — เสียเวลาทำเพิ่ม (storage integration + endpoint ใหม่ + migration ภาพเก่าที่เป็น base64 อยู่แล้ว)
   - **(b) เร็วกว่า:** แค่ปรับ `main.ts` body limit + DTO `MaxLength` — แต่ `ydoc`/`File.content` โตไม่จำกัดตามจำนวน/ขนาดภาพ, WS sync payload ใหญ่ขึ้นกระทบ real-time latency, ไม่แก้ tech debt ที่ระบุไว้แล้วในคอมเมนต์โค้ด
   - **ต้องยืนยัน:** เลือก (a) หรือ (b); ถ้า (a) — ใช้ Supabase Storage (มี MCP tool พร้อมใน workspace นี้) หรือ local disk + serve ผ่าน API; ขนาดสูงสุดต่อภาพ (คง 3MB เดิม หรือปรับ); ชนิดไฟล์ที่รองรับ (คง `image/*` หรือ whitelist png/jpg/webp); ภาพเก่าที่เป็น base64 อยู่แล้วต้อง migrate หรือปล่อยไว้ (legacy read-path)
2. **Undo/redo:** ยอมรับแนวทาง "คง Yjs UndoManager แต่ patch การอ่าน stack state" หรือต้องการ evaluate ทางเลือกอื่น (เช่น `y-prosemirror` version ใหม่กว่า, custom undo tracking) — ต้องให้ Architect ประเมินก่อน assign dev
3. **Segmented control ตำแหน่ง/สไตล์:** tab แนวนอนเหนือ toolbar เดิม หรือแทนที่ toolbar ทั้งแถว — ส่งต่อให้ UX/UI ตัดสินใจ (เอกสารนี้กำหนดแค่ grouping/behavior ไม่กำหนด visual)
4. **`allowBase64: true` ใน `ResizableImage`:** ปิดหลัง migrate (option a) หรือคงไว้รองรับ paste ภาพจาก clipboard — ถ้าคงไว้ ต้อง validate ขนาดตอน paste ด้วยเช่นกัน (ปัจจุบัน `onImagePick` validate เฉพาะ path file-picker ไม่ครอบ paste)

---

## 8. ลำดับ Implement แนะนำ

1. **A1 (image save)** ก่อนสุด — บล็อกงานจริงของผู้ใช้ตอนนี้ ต้องปิด Open Decision #1 ก่อนเริ่ม
2. **A2 (redo)** — อิสระจาก A1/A3 ทำขนานได้
3. **A3 (A4 canvas)** — อิสระ ทำขนานได้
4. **B1-B4 (toolbar 3 โหมด)** — ทำหลัง A1-A3 เสร็จ (ย้ายปุ่มที่ behavior นิ่งแล้วเข้าโหมดใหม่ ไม่ย้ายของที่ยังแก้บั๊กอยู่) ส่งต่อ UX/UI ก่อนเริ่ม dev จริง

---

## 9. Recommended Enhancements (Analyst Notes)

- **Redo/Undo stack indicator:** เพิ่ม tooltip/label สั้น ๆ แสดงว่า "ไม่มีอะไรให้ redo" แทนปุ่ม disabled เฉย ๆ — ลด friction ตอนผู้ใช้งง (ไม่บังคับ ใส่ไว้เป็นข้อเสนอ)
- **Paste-image validate:** ตอนนี้ validate ขนาด/ชนิดเฉพาะ file-picker (`onImagePick`) — ถ้าเลือก Option (a) ควรครอบ path paste/drag-drop ด้วย ไม่งั้นช่องโหว่เดิมย้อนกลับมาทางอื่น (ระบุใน Open Decision #4 แล้ว แต่เน้นย้ำเพราะเป็นช่องโหว่ที่มองข้ามง่าย)
