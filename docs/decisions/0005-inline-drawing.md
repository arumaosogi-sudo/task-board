# ADR 0005 — Inline Drawing Layer (overlay บนหน้า A4 แทน modal)

- **สถานะ:** Proposed (design override จากเจ้าของ — อนุมัติ scope แล้ว; รอ implement + browser/2-tab verify)
- **วันที่:** 2026-07-16
- **ผู้ตัดสิน:** senior-fullstack-dev
- **บริบท input:** คำสั่งเจ้าของ (design override), `docs/SRS-editor-revamp.md` §B3, `docs/decisions/0004-editor-revamp.md` (ซึ่ง §3 สมมติ modal — ADR นี้ **override** ข้อนั้น)
- **โค้ดที่ตรวจจริง (branch `chore/sprint4-prep`):** `apps/web/src/components/{CollabEditor,DrawingCanvas}.tsx`, `apps/web/src/components/editor/drawing.ts`, `apps/web/src/pages/WorkPage.tsx` (`exportPdf`), `apps/api/src/collab/collab.service.ts`, `apps/web/src/index.css` (`tb-page`)

---

## Context

เจ้าของขอพฤติกรรมแบบ Google Docs / GoodNotes: กดแท็บ "วาด" แล้ววาดทับหน้ากระดาษ A4 ได้ทันที
(ไม่เปิด modal), ยางลบเป็นวงกลมที่ลบเฉพาะส่วนของเส้นในวง (segment-level). ADR 0004 §3
สมมติว่าโหมดวาดยังเป็น modal — ADR นี้แทนที่สมมติฐานนั้น.

**Constraint จากเจ้าของ (บังคับ):** (ก) sync real-time ผ่าน Yjs, (ข) ผูกตำแหน่งกับหน้ากระดาษ,
(ค) PDF export เห็นภาพวาด, (ง) Viewer เห็นแต่วาดไม่ได้, (จ) undo/redo integrate สมเหตุสมผล.

---

## Decision

### D1 — เก็บ stroke เป็น `Y.Array<YMap>` แยกใน Y.Doc เดิม (ไม่ใช่ ProseMirror node)

`ydoc.getArray('drawings')` — แต่ละ element เป็น `Y.Map` ต่อ 1 stroke:

```ts
// stroke schema (ใน Y.Map)
{ id: string, tool: 'pen'|'highlighter', color: string, width: number,
  opacity: number, points: number[] /* [x0,y0,x1,y1,…] ใน A4 viewBox */ }
```

**เหตุผล:**
- `collab.service.ts` persist **ทั้ง Y.Doc** ด้วย `Y.encodeStateAsUpdate` และโหลดกลับด้วย
  `Y.applyUpdate` (บรรทัด 144/154). Field ใหม่ใน Y.Doc เดียวกันจึง **sync ข้าม peer + persist
  ลง `File.ydoc` อัตโนมัติ — ไม่ต้องแก้ backend เลย** (ตรงตาม constraint ก).
- `Y.Array` ให้ CRDT merge ระดับ stroke: peer สองคนวาดพร้อมกัน = สอง element ไม่ conflict.
- แยกจาก ProseMirror doc → การวาดไม่รบกวน text selection/undo ของ editor และไม่ทำ getHTML บวม.
- เก็บ `points[]` (ไม่ใช่ path string) เพื่อให้ยางลบ segment-level ทำงานบนพิกัดจริง (ดู D3).

**ทางเลือกที่ปฏิเสธ:** (a) ProseMirror custom node — วาดทั้งหน้าไม่เข้ากับ flow ของ node ที่อยู่ใน
text; undo ปนกับ text. (b) เก็บใน field ของ Postgres แยก REST — เสีย real-time, ต้อง merge เอง.

### D2 — Render เป็น SVG layer `position:absolute` ทับ `tb-page`

overlay `<svg>` เต็มพื้นที่ `tb-page` (viewBox = A4 ตาม orientation, เหมือน `DrawingCanvas` เดิม:
portrait 420×594 / landscape 594×420). `tb-page` ต้องเป็น `position:relative`; overlay
`inset-0`, `width/height:100%`, `pointer-events` เปิดเฉพาะตอนโหมดวาด active (ไม่งั้นคลิกทะลุไปหา
ProseMirror ได้ตามปกติ). `touch-action:none` เฉพาะตอนวาด active (constraint touch/stylus).

### D3 — ยางลบวงกลม segment-level

ใช้โมดูล **`drawingGeometry.ts` (ส่งแล้วใน commit นี้ + unit test 13 เคส)**:
`eraseStroke(points, cx, cy, r)` คืน "ชิ้น" ของเส้นที่รอด (แต่ละชิ้น ≥2 จุด) โดยตัดจุดที่อยู่ในวง
และตัด segment ที่ "ลากผ่าน" วงแม้ปลายทั้งสองอยู่นอกวง. การลบ 1 ครั้ง = ลบ Y.Map เดิมออกจาก
`Y.Array` แล้ว push ชิ้นใหม่ที่รอด (transaction เดียว → undo เป็นก้อนเดียว). cursor แสดงวงกลม
ขนาด = radius ที่เลือก (element ตาม pointer, ไม่เก็บใน CRDT).

### D4 — undo/redo ของการวาด = `Y.UndoManager` แยก scope ที่ `drawings` array

`new Y.UndoManager(ydoc.getArray('drawings'))` แยกจาก UndoManager ของ text (y-prosemirror).
ปุ่ม undo/redo หลักบน toolbar (SPEC A2) เรียก undo ของ **โหมดปัจจุบัน**: โหมดวาด → undo drawings;
โหมดเขียน/แทรก → undo text. เหตุผล: ผู้ใช้คาดหวังให้ Ctrl+Z ในโหมดวาดย้อน "เส้นล่าสุด" ไม่ใช่ text.
(ทางเลือกอื่น: รวมเป็น UndoManager เดียว track ทั้งสอง type — ปฏิเสธเพราะ y-prosemirror สร้าง
UndoManager ของมันเองภายใน ยากจะ track array เพิ่มโดยไม่ patch ลึก.)

### D5 — PDF export: serialize overlay เข้า print HTML

`exportPdf` (`WorkPage.tsx:335`) ปัจจุบันพ่น `content` (getHTML mirror) เป็นคอลัมน์เดียว.
ภาพวาดไม่อยู่ใน getHTML → **ต้องฉีดเพิ่มเอง**: ตอน export อ่าน `drawings` array → `buildSvg()`
(reuse logic เดิมของ `DrawingCanvas.buildSvg`, ย้ายเป็น util) → แทรก `<svg>` แบบ
`position:absolute;inset:0` ครอบ container ของหน้าใน print HTML.

> ⚠️ **ข้อจำกัดที่ต้องยอมรับ (ระบุใน Consequences):** print HTML ปัจจุบันเป็น flow คอลัมน์เดียว
> `max-width:720px` **ไม่ใช่หน้า A4 หลายหน้าจริง**. overlay จึงวาง "ทับทั้งเอกสาร" ตามสัดส่วน A4
> หน้าเดียว — ตรงกับ mental model "วาดทับหน้ากระดาษ" เพราะ editor ก็เป็นหน้าเดียวเลื่อนยาว
> (`tb-page` เดียว). ถ้าอนาคตทำ pagination จริงต้องรื้อ mapping นี้.

### D6 — Viewer read-only

overlay render ให้ทุก role (เห็นเส้น) แต่ `pointer-events:none` + ไม่ผูก pointer handler เมื่อ
`readOnly`. ตรงกับ constraint ง และ server ก็ยัง authoritative (`collab.service` onAuthenticate
ตั้ง Viewer=readOnly อยู่แล้ว → Viewer ส่ง update ไม่ได้ ต่อให้ client ถูก patch).

### D7 — ชะตากรรมของ modal เดิม + legacy

- **`DrawingCanvas` modal + ปุ่ม `editor.openDraw`:** ถอดออกจาก flow โหมดวาด (แทนด้วย inline).
  **คง component ไฟล์ไว้ชั่วคราว** จนกว่า inline overlay จะ verify ผ่าน (2-tab + PDF) แล้วจึงลบ —
  กัน regress ระหว่างทาง.
- **`migrateLegacyDrawings` (`drawing.ts`):** **ห้ามแตะ/ห้าม regress**. ภาพวาดเก่า (Phase 3 =
  inline `<svg class="tb-drawing">` → data-URL `<img>`) และภาพวาดยุค ADR 0004 (PNG upload =
  `<img src>`) เป็น **node ภาพใน ProseMirror doc** คนละเลเยอร์กับ overlay ใหม่ — render ต่อได้ปกติ
  ผ่าน path เดิม. overlay ใหม่เป็น greenfield ไม่ migrate ของเก่าเข้ามา (ของเก่าอยู่ใน doc flow ต่อไป).

---

## Consequences

**บวก:** วาด inline ได้จริงแบบ GoodNotes; real-time + persist ฟรีจาก Y.Doc เดิม (ไม่แตะ backend/
schema); ยางลบ segment-level มี logic บริสุทธิ์ + unit test แล้ว; ภาพวาดไม่ทำ getHTML/ydoc-text บวม.

**ลบ / ความเสี่ยงที่ QA ต้องตรวจ:**
1. **Version history / diff ไม่เห็นภาพวาด** — `RevisionDiffDrawer` diff จาก HTML; drawings อยู่นอก
   HTML → restore revision ไม่ย้อนภาพวาด. ต้องตัดสิน (แนะนำ: ยอมรับใน scope นี้ + ระบุใน SRS ว่า
   drawing ไม่อยู่ใน version diff; ถ้าต้องการต้อง mirror stroke เข้า HTML snapshot ตอน store).
2. **PDF pagination** — ดู D5 คำเตือน.
3. **Performance** — เอกสารมี stroke หลายพัน element ใน `Y.Array` → re-render SVG ทั้ง layer ทุก
   update. ต้อง memo ต่อ stroke + อาจ throttle. QA โหลดทดสอบ stroke จำนวนมาก.
4. **2-tab sync** — ต้อง verify peer คนที่สองเห็น stroke ทันที (DoD).

**ไม่แตะ:** backend/collab.service, Prisma schema, extension list ของ ProseMirror, `migrateLegacyDrawings`.

## สถานะการส่งมอบใน commit นี้

- ✅ `drawingGeometry.ts` — pure eraser/geometry core + `drawingGeometry.test.ts` (13 เคสผ่าน)
- ⏳ overlay component + Yjs `drawings` wiring + toolbar โหมดวาด inline + PDF serialize — **ยังไม่ทำ**
  (ต้อง 2-tab/browser verify ตาม DoD ซึ่ง session นี้ติด blocker การ login — ดู handoff)
