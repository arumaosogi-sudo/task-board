# Editor Revamp — Design Spec (3 โหมด: เขียน / วาด / แทรก)

**Author:** ux-ui-design-architect · **Version:** 1.0 · **สถานะ:** พร้อมส่งต่อ Architecture + Dev
**อ่านคู่กับ:** `docs/SRS-editor-revamp.md` (ต้นทางสเปกนี้), `design/UI_GUIDELINES.md` (token/anti-slop — ยึดเป๊ะ)
**โค้ดอ้างอิงจริง:** `CollabEditor.tsx` (toolbar เดิม, บรรทัด 104-131 GROUPS, 362-495 render), `DrawingCanvas.tsx` (W=720,H=460 คงที่, modal portal), `editor/ResizableImageView.tsx` (resize handle มุมเดียว + drag-handle ของ ProseMirror)

---

## 0. หลักการออกแบบ (ทำไมเป็นแบบนี้)

Task Board เป็นเครื่องมือ **document-first** — ผู้ใช้ทำงาน 1 อย่างต่อครั้ง (พิมพ์ยาว ๆ / วาดยาว ๆ / จัดภาพ-กล่องยาว ๆ) ไม่ได้สลับทุกวินาที ดังนั้น segmented control ควร **นิ่ง ชัด ไม่ขยับตำแหน่งเวลาสลับ** (ปุ่มในแต่ละโหมดจำนวนไม่เท่ากัน → ต้องกัน layout shift ไม่งั้นจะดู "โหมดพัง") และ undo/redo/save ต้องคงที่ทุกโหมดเพราะเป็น mental model เดียวกับ Google Docs ที่ผู้ใช้กลุ่มนี้คุ้นอยู่แล้ว (อ้างอิงทิศทางที่ล็อกไว้ใน UI_GUIDELINES: calm editorial ไม่ใช่ SaaS landing)

---

## 1. Segmented Control — 3 โหมด

### ตำแหน่ง & โครงสร้าง
แทนที่แถว toolbar เดิม (`CollabEditor.tsx:364`) ด้วย **โครง 2 แถว** แถวเดียวกับ container เดิม (ไม่เพิ่ม sticky bar ใหม่ ไม่เปลืองพื้นที่จอ):

```
┌─────────────────────────────────────────────────────────────┐
│  [ เขียน ][ วาด ][ แทรก ]              ↶ ↷   ⋯ กำลังบันทึก  │ ← แถว 1: mode switch (คงที่)
├─────────────────────────────────────────────────────────────┤
│  B I U │ H1 H2 ¶ │ • 1. │ ⟵⟷⟶ │ [ฟอนต์▾][ขนาด▾] │ ▤ ☑        │ ← แถว 2: ปุ่มของโหมดปัจจุบัน (สลับตามโหมด)
└─────────────────────────────────────────────────────────────┘
```

- แถว 1 (mode row): สูง 40px, `border-b border-line`, พื้นหลัง `bg-card` เดียวกับแถว 2 (มองเป็น toolbar เดียว หนา 2 ชั้น ไม่ใช่ 2 กล่องแยก)
- แถว 2 (contextual row): สูง 44px คงที่เสมอ (Feature B1 AC: "สลับ UI ปุ่มทันทีโดยไม่ reset selection") — ปุ่มน้อยกว่าจำนวนสูงสุดก็ปล่อยพื้นที่ว่างด้านขวา ไม่ centered ไม่ re-flow เพื่อกัน layout jump ตอนสลับโหมด
- ทั้ง 2 แถวอยู่ใน container เดิม: `rounded-xl border border-line bg-card shadow-soft sticky top-0 z-10`

### สไตล์ segmented control (แถว 1 ฝั่งซ้าย)
```html
<div role="tablist" aria-label="โหมดแก้ไข" class="inline-flex items-center gap-0.5 rounded-lg bg-paper p-0.5">
  <button role="tab" aria-selected="true"
    class="h-8 rounded-md px-3 text-label font-medium transition-colors
           bg-card text-ink shadow-soft"> {/* active */}
    เขียน
  </button>
  <button role="tab" aria-selected="false" tabindex="-1"
    class="h-8 rounded-md px-3 text-label font-medium text-muted
           hover:text-ink hover:bg-ink/5 transition-colors">
    วาด
  </button>
  <button role="tab" aria-selected="false" tabindex="-1"
    class="h-8 rounded-md px-3 text-label font-medium text-muted
           hover:text-ink hover:bg-ink/5 transition-colors">
    แทรก
  </button>
</div>
```

**ทำไมเป็น pill-inset แบบนี้ (ไม่ใช่ underline tab):** underline tab เป็น pattern ของ nav/page — ที่นี่คือ mode switch ของเครื่องมือเดียว ปุ่ม active ต้อง "ดูเหมือนกดลงไปอยู่" (`bg-card` ยกตัวเหนือ `bg-paper` ด้วย `shadow-soft`) ไม่ใช่แค่ขีดเส้นใต้ — สื่อ affordance "โหมดนี้กำลังทำงานอยู่" ชัดกว่า และเข้ากับ token ที่มี (ไม่ต้องเพิ่มสีใหม่)

### States
| State | สไตล์ |
|---|---|
| Active | `bg-card text-ink shadow-soft` |
| Inactive default | `text-muted` |
| Inactive hover | `hover:bg-ink/5 hover:text-ink` |
| Focus-visible (keyboard) | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-paper` |
| Disabled (ไม่มีในสเปกนี้ — ทุกโหมดใช้ได้เสมอเมื่อมีสิทธิ์แก้) | — |

### Keyboard / a11y (Feature B1 AC)
- `role="tablist"` ครอบ 3 ปุ่ม, แต่ละปุ่ม `role="tab"` + `aria-selected` + `aria-controls="toolbar-row-{mode}"`
- Roving tabindex: มีแค่ tab ที่ active `tabindex="0"`, ที่เหลือ `tabindex="-1"`
- `ArrowLeft`/`ArrowRight` เปลี่ยน focus + สลับโหมดทันที (ตาม ARIA APG tab pattern, ไม่ต้องกด Enter ซ้ำ — มาตรฐาน tab widget)
- `Home`/`End` ไปโหมดแรก/สุดท้าย
- แถว 2 ปุ่มผูก `aria-controls` กลับมาที่ tab ปัจจุบันด้วย `id="toolbar-row-write"` เป็นต้น เพื่อให้ screen reader ประกาศว่าเนื้อหาเปลี่ยน

### Responsive
| Breakpoint | พฤติกรรม |
|---|---|
| Desktop (≥1024px) | ตามผังด้านบนเต็ม 2 แถว |
| Tablet (768–1023px) | เหมือนเดิม แต่แถว 2 ปุ่มไอคอนไม่มี label ข้อความ (ใช้ icon+title อย่างเดียว, ปุ่ม H1/H2/¶/1./• คง text เพราะสั้นอยู่แล้ว), font/size select ย่อเหลือ icon `Aa ▾` เปิด popover แทน select ยาว 2 อัน |
| Mobile (<768px) | แถว 1 คงเดิม (segmented control กดง่ายด้วยนิ้ว, สูง 40px ผ่าน touch target 44px ด้วย padding); แถว 2 กลายเป็น **horizontal scroll แถวเดียว** (`overflow-x-auto`, ปุ่ม `flex-shrink-0`, ไม่ wrap เพราะ wrap แล้ว container โตข้ามการ์ดเอกสาร) พร้อม fade mask ขอบขวาบอกว่า scroll ได้ต่อ |

**เหตุผลเลือก horizontal-scroll แทน "..." overflow menu บนมือถือ:** ปุ่มถูก re-group ตามโหมดจนเหลือ 6-8 ปุ่มต่อโหมดอยู่แล้ว (เทียบกับ 15+ ปุ่มเดิมทั้งแถว) — scroll แนวนอนสั้น ๆ เร็วกว่าเปิดเมนูซ้อนสำหรับงานที่ใช้บ่อย (bold/H1/list) และไม่ต้องเพิ่ม state ใหม่

---

## 2. Mapping ปุ่ม → โหมด (สรุปจาก SRS §3 Module B)

| โหมด | ปุ่ม/กลุ่ม | Source เดิม |
|---|---|---|
| **เขียน** | Font family▾, ขนาด▾ · B/I/U · H1/H2/¶ · •/1. · ⟵⟷⟶ align · ▤ แทรกตาราง · ☑ checklist | `GROUPS[0-3]` + font selects + `insertTable`/`toggleChecklist` (บรรทัด 367-396, 476-493) |
| **วาด** | ✏️ เปิดโหมดวาด (ปุ่มเดียว เต็มความสูงแถว 2, ดู §3) | ปุ่ม pencil เดิม (บรรทัด 439-445) |
| **แทรก** | 🖼 แทรกรูปภาพ · ⬚ แทรกกล่อง · 🗑 ลบกล่อง (enable เฉพาะ caret ในกล่อง) | ปุ่ม image/box/delete-box เดิม (บรรทัด 432-475) |
| **ร่วมทุกโหมด (แถว 1)** | ↶ Undo · ↷ Redo · สถานะบันทึก | `GROUPS[4]` ย้ายขึ้นแถว 1 |

**Table BubbleMenu** (บรรทัด 501-529) ไม่ย้าย — ยังคง trigger ด้วย caret-in-table เหมือนเดิม ทำงานได้ในทุกโหมดตามที่ SRS ระบุ (ผูกกับ selection ไม่ใช่โหมด) — ไม่ต้องซ่อนตอนอยู่โหมดวาด/แทรก เพราะ selection ในตารางแปลว่าผู้ใช้เพิ่งอยู่โหมดเขียนมา

### Default mode
เริ่มที่ **"เขียน"** เสมอเมื่อเปิดไฟล์ (Feature B1 AC ข้อแรก) — เก็บ mode เป็น local React state `useState<'write'|'draw'|'insert'>('write')`, **ไม่** persist ต่อ session/localStorage (สเปกไม่ได้ขอ และผู้ใช้คนละคนเปิดคนละโหมดได้อยู่แล้วเพราะเป็น local UI state)

---

## 3. โหมดวาด (Draw)

### ปุ่มเดียวในแถว 2 ไม่ใช่เรื่องแปลก
โหมดวาดใน SRS ยังเป็น **modal-based** (Assumption #3) ไม่ inline — ดังนั้นแถว 2 ของโหมดนี้มีปุ่มเดียว: **"เปิดพื้นที่วาด"** ขนาดใหญ่กว่าปุ่มไอคอนปกติเล็กน้อยเพื่อไม่ให้แถวดูโหวง:

```html
<div id="toolbar-row-draw" role="tabpanel" aria-labelledby="tab-draw"
     class="flex h-11 items-center px-1.5">
  <button class="flex h-8 items-center gap-2 rounded-lg px-3 text-label font-medium
                 text-ink bg-ink/5 hover:bg-ink/10">
    <svg><!-- pencil icon --></svg>
    เปิดพื้นที่วาด
    <span class="text-caption text-muted">(รองรับ stylus)</span>
  </button>
</div>
```
ทำไมไม่ปล่อยว่างที่เหลือของแถว: ใส่ helper text (caption) บอกว่ารองรับ stylus แทนพื้นที่ว่าง — ให้ข้อมูลจริงแทนของตกแต่ง (กฎ anti-slop ข้อ 1)

### A4 canvas — สัดส่วนตาม orientation (Feature A3)
เปลี่ยนจาก `W=720, H=460` คงที่ (`DrawingCanvas.tsx:14-15`) เป็น 2 ค่าคงที่ตาม orientation ของไฟล์ที่เปิดอยู่ (prop `orientation` มีอยู่แล้วใน `CollabEditorProps`, ต้องส่งต่อเข้า `DrawingCanvas`):

```
portrait  → viewBox 0 0 420 594   (210:297)
landscape → viewBox 0 0 594 420   (297:210)
```

Modal width ต้องปรับตาม: ปัจจุบัน `width="max-w-[780px]"` คงที่ — เปลี่ยนเป็น `max-w-[560px]` สำหรับ portrait (คอลัมน์แคบสูง) และคง `max-w-[780px]` สำหรับ landscape เพื่อให้ canvas ไม่ scale เล็กเกินไปในแนวตั้ง

```
Portrait modal (420:594)              Landscape modal (594:420)
┌─────────────────────┐               ┌───────────────────────────────┐
│ ✏️ 🖌 🧹 │●●●●●● │ ●●● │ ↶↷🗑 │      │ ✏️ 🖌 🧹 │●●●●●● │ ●●● │ ↶↷🗑    │
│ ┌─────────────┐     │               │ ┌─────────────────────────┐   │
│ │             │     │               │ │                         │   │
│ │   420×594   │     │               │ │        594×420          │   │
│ │  (A4 ตั้ง)   │     │               │ │       (A4 นอน)          │   │
│ │             │     │               │ │                         │   │
│ └─────────────┘     │               │ └─────────────────────────┘   │
│    [ยกเลิก] [แทรกลงเอกสาร]         │      [ยกเลิก] [แทรกลงเอกสาร]   │
└─────────────────────┘               └───────────────────────────────┘
```

Toolbar เครื่องมือภายใน modal (ปากกา/highlighter/ยางลบ, สี, ขนาด, undo/redo/clear ภายใน) **คงเดิมทุกอย่าง** (`DrawingCanvas.tsx:180-233`) — ไม่แก้ตามสเปก (Feature B3: undo/redo ในโหมดวาดเป็นคนละ stack กับเอกสาร ต้องแยกภาพชัด — ปัจจุบันอยู่คนละ modal อยู่แล้วจึงชัดเจนโดยธรรมชาติ ไม่ต้องเพิ่ม label เตือน)

### Empty / loading / error states ของโหมดวาด
| State | UX |
|---|---|
| Empty (ยังไม่วาดอะไร) | ปุ่ม "แทรกลงเอกสาร" `disabled` (มีอยู่แล้ว, บรรทัด 175) — เพิ่ม caption ใต้ canvas: "ลากเมาส์/ปากกาเพื่อเริ่มวาด" เมื่อ `strokes.length === 0` |
| Loading | ไม่มี async ระหว่างวาด (ทุกอย่าง local จนกด "แทรกลงเอกสาร") — ไม่ต้องมี skeleton ในโหมดนี้ |
| Error | ไม่มี network call ในโหมดวาดเอง (SVG→dataURL เป็น sync operation) — error เดียวที่เป็นไปได้คือ autosave หลังแทรกเข้าเอกสารแล้ว ซึ่งเป็น error ของ toolbar หลัก ไม่ใช่ของ modal |

---

## 4. โหมดแทรก (Insert) — รูปภาพ + Box ที่ขยับได้

### 4.1 โครงสร้างแถว 2
```html
<div id="toolbar-row-insert" role="tabpanel" aria-labelledby="tab-insert"
     class="flex h-11 items-center gap-0.5 px-1.5">
  <button title="แทรกรูปภาพ" class="...">🖼</button>
  <span class="h-5 w-px bg-line" />
  <button title="แทรกกล่องข้อความ" class="...">⬚</button>
  <button title="ลบกล่องข้อความ" disabled="{caret ไม่อยู่ใน box}" class="...">🗑</button>
</div>
```
เหมือนกลุ่ม insert เดิม (บรรทัด 430-475) เพียงย้ายมาอยู่โหมดนี้ ตัดปุ่มวาด/ตาราง/checklist ออกไปโหมดอื่น

### 4.2 UX แทรกรูปภาพ — คุมทั้ง 2 ทางเลือกจาก Open Decision #1

เนื่องจาก Architect ยังไม่ปิด decision (upload endpoint vs base64 ขยาย limit) ออกแบบ flow ให้ **UI เหมือนกันทั้ง 2 ทาง** ต่างกันแค่ว่ามี network request คั่นหรือไม่ — ดังนั้น component ฝั่ง client ควรมี "upload state machine" เดียวที่ใช้ได้กับทั้งคู่ (ถ้าเลือก base64/option b ก็ถือว่า "upload" เสร็จทันทีแบบ synchronous, ข้าม step 2-3 แต่ UI เหมือนเดิม):

```
1. คลิก 🖼 → file picker (accept="image/*")
2. Client validate ทันที (ชนิด/ขนาด) ก่อนแตะ network
   ├─ ไม่ผ่าน → inline toast แดง ใต้ปุ่มแทรกรูปภาพ ("รูปภาพต้องไม่เกิน 3MB")
   │            ไม่ insert อะไร ไม่เปิด upload state
   └─ ผ่าน → insert placeholder node ทันที (optimistic) ที่ตำแหน่ง caret
3. [เฉพาะ Option a — upload จริง] placeholder แสดง progress
4. เสร็จ → placeholder ถูกแทนที่ด้วยภาพจริง (เนียน ไม่กระพริบ)
   ล้มเหลว → placeholder เปลี่ยนเป็น error card พร้อมปุ่ม "ลองใหม่"/"ลบ"
```

**Placeholder / progress card** (ใช้เฉพาะกรณี option a ที่มี network round-trip; option b ข้าม state นี้ไปเพราะ dataURL พร้อมทันที):
```html
<div class="tb-img-placeholder flex items-center gap-2 rounded-lg border border-line
            bg-paper p-3 text-body-sm text-muted" style="max-width:280px">
  <svg class="animate-spin" width="16" height="16"><!-- spinner --></svg>
  <span>กำลังอัปโหลดรูปภาพ… 42%</span>
</div>
```
- ใช้ progress bar บาง (`h-1 rounded-full bg-line` มี `bg-primary` fill) แทนตัวเลข % ล้วน ถ้า API ส่ง progress event ได้; ถ้าไม่มี progress event ใช้ spinner + ข้อความ "กำลังอัปโหลดรูปภาพ…" เฉย ๆ (ไม่ประดิษฐ์ตัวเลขปลอม)
- **สำคัญ (ตาม SRS edge case):** placeholder ต้องเป็น ProseMirror node จริงที่ลบตัวเองได้ (ไม่ใช่ DOM overlay ลอย) เพื่อให้ undo ลบมันออกได้ถ้าผู้ใช้ undo ระหว่างอัปโหลด — ถ้า tab ปิดกลางทาง placeholder หายไปพร้อม unmount (ไม่ sync เข้า Yjs จนกว่าจะสำเร็จ ตามที่ SRS ระบุว่า "ไม่มี partial node ค้าง")

**Error card:**
```html
<div class="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-body-sm text-danger">
  <svg width="16" height="16"><!-- warning icon --></svg>
  <span>อัปโหลดไม่สำเร็จ</span>
  <button class="ml-auto text-label font-medium underline">ลองใหม่</button>
  <button class="text-label text-muted hover:text-ink">ลบ</button>
</div>
```

### 4.3 UX ลาก/ปรับขนาด Box

**ข้อจำกัดสำคัญที่ต้องออกแบบภายใต้:** SRS Scope OUT ระบุชัดว่า "ไม่รื้อ Box/Table/Checklist extension ภายใน (map เข้าโหมดใหม่เท่านั้น ไม่แก้ logic)" — `Box` ปัจจุบันเป็น ProseMirror block node ใน document flow (ไม่ใช่ absolute-positioned element ที่ลากไปวางตำแหน่ง x/y อิสระแบบ Figma) และ `ResizableImageView` (บรรทัด 16-31 ของ `ResizableImageView.tsx`) รองรับ resize **แนวกว้างอย่างเดียว** ผ่าน handle มุมเดียว + native `data-drag-handle` ของ ProseMirror (ลากเพื่อย้ายตำแหน่ง**ในลำดับเอกสาร** ไม่ใช่ลอยอิสระ)

ดังนั้นออกแบบ UX ให้ตรงกับ capability จริงนี้ — "ขยับได้" ในสเปกนี้ = **ลากจัดลำดับ/ตำแหน่งใน flow ของหน้าเอกสาร** ไม่ใช่ free-canvas positioning:

```
Box ปกติ (ไม่ได้ select)              Box ที่ select แล้ว (editable)
┌──────────────────────┐              ┌──────────────────────┐ ← ring-2 ring-primary
│ พิมพ์ข้อความในกล่อง…  │      →       │ ⠿ พิมพ์ข้อความ...   ⤡│ ← ⠿ drag handle (บนซ้าย)
└──────────────────────┘              └──────────────────────┘   ⤡ resize handle (ล่างขวา)
```

- **Drag (ย้ายตำแหน่ง):** โฮเวอร์ที่ขอบบนของ box (editable + selected) โชว์ handle `⠿` มุมบนซ้าย, `cursor: grab` → `grabbing` ตอนลาก — ใช้ `data-drag-handle` เดิมของ ProseMirror เพื่อย้าย node ไปตำแหน่งอื่นใน flow (ก่อน/หลัง paragraph อื่น) พร้อม drop-indicator เส้นบาง `bg-primary h-0.5` โชว์จุดที่จะวาง (มาตรฐาน ProseMirror drag เดิมของ browser render เอง ไม่ต้อง custom）
- **Resize:** handle `⤡` มุมล่างขวาเท่านั้น (สอดคล้องกับรูปภาพที่ resize กว้างอย่างเดียวอยู่แล้ว — Box ควร apply pattern เดียวกันเพื่อความสม่ำเสมอ ไม่ใช่เพิ่ม 8-handle แบบ Figma ซึ่งเกินขอบเขต "ไม่แก้ logic" เดิม) ปรับ `width` ของ box, ความสูงตามเนื้อหาข้างในอัตโนมัติ (auto height ตาม text flow เดิม)
- **Touch:** handle ขนาดจริง 24×24px (มากกว่าเส้นที่มองเห็น 8px) เพื่อ touch target ตามมาตรฐาน — ใช้ pattern เดียวกับ `.tb-img-handle` ที่มีอยู่แล้ว

**หมายเหตุถึง Architect/PM:** ถ้าเจ้าของต้องการ box ที่ "ลอยอิสระทับข้อความ" แบบ absolute positioning จริง (overlay เหนือหน้า A4 คล้าย PowerPoint) นั่นคือการเปลี่ยน data model ของ `Box` node (เพิ่ม `x`/`y`/`z-index` attrs + เปลี่ยนจาก flow เป็น absolute) ซึ่ง**เกินขอบเขต SRS ปัจจุบัน** (Scope OUT ระบุไว้) — ต้องเปิด Open Decision ใหม่ก่อน ไม่ใช่ตัดสินใจในชั้น design นี้ ดีไซน์นี้จึงยึดพฤติกรรม "ลากจัดตำแหน่งใน flow" เป็น v1

### Empty / loading / error — โหมดแทรก
| State | UX |
|---|---|
| Empty (ยังไม่มีภาพ/box ในเอกสาร) | ไม่มี empty state พิเศษ — ปุ่มพร้อมใช้เสมอ, เอกสารว่างก็เป็นปกติของ editor |
| Loading (กำลังอัปโหลดภาพ) | ดู §4.2 placeholder card |
| Error (อัปโหลดล้มเหลว/ประเภทไฟล์ผิด) | ดู §4.2 error card + inline toast validate |
| ปุ่มลบ Box เมื่อ caret ไม่อยู่ใน box | `disabled` + `opacity-40` (พฤติกรรมเดิม คงไว้ บรรทัด 456, 469-472) |

---

## 5. Undo/Redo — ตำแหน่งใหม่ (แถว 1, ร่วมทุกโหมด)

```html
<div class="ml-auto flex items-center gap-2">
  <div class="flex items-center gap-0.5">
    <button title="ย้อนกลับ (Ctrl+Z)" aria-label="ย้อนกลับ" disabled="{!canUndo}"
      class="grid h-8 w-8 place-items-center rounded-lg text-muted
             hover:bg-ink/5 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent">↶</button>
    <button title="ทำซ้ำ (Ctrl+Y)" aria-label="ทำซ้ำ" disabled="{!canRedo}"
      class="grid h-8 w-8 place-items-center rounded-lg text-muted
             hover:bg-ink/5 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent">↷</button>
  </div>
  <span class="text-caption text-muted">{savingLabel}</span>
</div>
```
- ย้ายจาก `GROUPS[4]` มาอยู่ **ขวาสุดของแถว 1** (คนละฝั่งกับ segmented control ซ้าย) — เหตุผล: อยู่นอกโหมด ต้องแยกจาก tab visual ชัดเจน ไม่ปนเป็นปุ่มที่ 4 ของ tablist (ผิด ARIA role ถ้าอยู่ใน `role="tablist"`)
- `disabled` ใช้ได้จริงตอนนี้เพราะ Feature A2 ของ SRS แก้ root-cause ให้ `can().undo()/redo()` reliable แล้ว (ไม่ใช่ always-clickable แบบคอมเมนต์เดิมในโค้ดบอกไว้ว่า "unreliable") — ดีไซน์นี้ **สมมติว่า A2 fix เสร็จก่อน B1-B4** ตามลำดับ implement ที่ SRS §8 กำหนดไว้แล้ว
- `savingLabel`: "กำลังบันทึก…" ระหว่าง debounce 1s, "บันทึกแล้ว" หลังสำเร็จ (fade out หลัง 2s), "บันทึกไม่สำเร็จ" สีแดงถ้า `PUT :fileId/content` error — **ปัจจุบันไม่มี UI นี้เลยในโค้ด** (เสนอเพิ่มเป็น west practice เดียวกับ Google Docs, ไม่บังคับตาม SRS แต่แก้ gap ที่ Feature A1 เกี่ยวกับ error handling ต้องการ "แจ้ง error ชัดเจน")

---

## 6. Flow รวม (state diagram ระดับ UI)

```
                    ┌─────────────┐
        เปิดไฟล์ →   │  โหมดเขียน   │ (default)
                    └──────┬──────┘
                click tab  │  ArrowRight/Left
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ โหมดเขียน │ │ โหมดวาด   │ │ โหมดแทรก  │
        └──────────┘ └────┬─────┘ └────┬─────┘
                           │ click            │ click 🖼/⬚
                           ▼                  ▼
                    ┌─────────────┐   ┌──────────────┐
                    │ Modal วาด    │   │ file picker /│
                    │ (A4 canvas) │   │ insertBox()  │
                    └──────┬──────┘   └──────┬───────┘
                    แทรกลงเอกสาร            upload/insert
                           └──────────┬───────┘
                                      ▼
                          setImage()/insertBox() → Yjs sync
                          → autosave debounce 1s → PUT content
```

---

## 7. จุดกระทบ Frontend (สรุปให้ Architect/Dev)

| ไฟล์ | เปลี่ยนอะไร |
|---|---|
| `CollabEditor.tsx` | เพิ่ม state `mode: 'write'|'draw'|'insert'`; แยก `GROUPS` เดิมเป็น `WRITE_GROUP`/ตัด undo-redo ออกไปแถวแยก; render 2 แถว (tablist + tabpanel ตาม mode); ส่ง `orientation` เข้า `DrawingCanvas` |
| `DrawingCanvas.tsx` | รับ prop `orientation?: 'portrait'|'landscape'`; เปลี่ยน `W`/`H` เป็น `useMemo` ตาม orientation แทนค่าคงที่บรรทัด 14-15; ปรับ `Modal width` ตาม orientation |
| `editor/ResizableImageView.tsx` | ถ้าเพิ่ม upload-progress placeholder ต้องมี node type ใหม่หรือ attrs `status: 'uploading'|'error'|'ready'` บน `ResizableImage` — **ต้องยืนยันกับ Architect** ว่าจะทำเป็น node แยก (`ImagePlaceholder`) หรือ attrs เสริมบน node เดิม |
| `editor/Box.ts` (ถ้าต้องการ drag/resize handle ใหม่) | เพิ่ม `⠿`/`⤡` handle ใน node view คล้าย `ResizableImageView` — ปัจจุบัน `Box.ts` ยังไม่มี custom NodeView ต้องตรวจว่ามีอยู่แล้วหรือไม่ก่อน implement |
| i18n | label โหมด 3 คำ ("เขียน"/"Write", "วาด"/"Draw", "แทรก"/"Insert") + `savingLabel` 3 สถานะ ต้องอยู่ใน translation keys ใหม่ (ตาม NFR i18n ของ SRS ไม่ hardcode ซ้ำ debt เดิม) |

---

## 8. Self-critique (anti-slop check ก่อนส่ง)

1. **จุดที่อาจดู "AI ทำ":** ตอนแรกเขียน progress placeholder เป็น % ตัวเลขลอย ๆ — แก้แล้วโดยระบุชัดว่าใช้เฉพาะเมื่อมี progress event จริงจาก API ไม่งั้นใช้ spinner เฉย ๆ (ไม่ประดิษฐ์ตัวเลขปลอม)
2. **จุดที่อาจดู "AI ทำ":** เกือบออกแบบ Box ให้ลากอิสระแบบ Figma (ฟีเจอร์ที่ "ดูล้ำ") — ตัดออกเพราะเกินขอบเขต SRS จริง (data model ไม่รองรับ) และเขียนหมายเหตุเปิด decision แทนที่จะเนียนออกแบบเกินสเปก
3. **จุดที่อาจดู "AI ทำ":** เกือบใส่ "..." overflow menu บนมือถือ (pattern ที่เจอบ่อยจน auto-pilot) — เปลี่ยนเป็น horizontal scroll เพราะจำนวนปุ่มต่อโหมดหลังแบ่งแล้วเหลือน้อยพอ (6-8 ปุ่ม) ไม่ต้องซ่อนเมนูซ้อน
