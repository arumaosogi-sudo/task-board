# ADR 0004 — Editor Revamp: Image Handling, Undo/Redo, และ Body Limit

- **สถานะ:** Proposed (รอ owner ratify ข้อ Storage — ดู §Ratify)
- **วันที่:** 2026-07-15
- **ผู้ตัดสิน:** fullstack-architect-mentor (Tech Lead)
- **บริบท input:** `docs/SRS-editor-revamp.md` §7 Open Decisions #1–#4
- **โค้ดที่ตรวจจริง (branch `chore/sprint4-prep`):** `apps/web/src/components/CollabEditor.tsx`, `apps/web/src/components/editor/ResizableImage.ts`, `apps/api/src/main.ts`, `apps/api/src/files/{files.controller.ts,dto/file.dto.ts}`, `apps/api/prisma/schema.prisma`, `apps/api/src/collab/collab.service.ts`

---

## Decision 1 — Image handling: **เลือก Option (a) Upload เป็นไฟล์/URL** ✅

### เหตุผลชี้ขาด (ไม่ใช่แค่แก้ 413)
ภาพ base64 ถูกฝังใน **`ydoc` (Postgres `Bytes`) ซึ่งเป็น source of truth ของ CRDT** ไม่ใช่แค่ `File.content` mirror. ผลคือ:
- ทุก client ที่เปิดเอกสารต้อง **download base64 เต็มก้อนผ่าน WebSocket** ทุกครั้งที่ connect/sync → ภาพ 3MB = base64 ~4MB ต่อภาพ ใน CRDT payload. หลายภาพ = หลายสิบ MB → ทำลาย core value ของ real-time editor โดยตรง
- `ydoc Bytes` โตไม่จำกัด → Postgres backup/query ช้าลงสะสม
- Option (b) แค่ขยาย body limit **ไม่แก้ปัญหานี้เลย** — มันแก้แค่ REST mirror path แต่ WS/CRDT path ยังบวมเท่าเดิม

การเก็บ URL สั้น ๆ ใน node แทน base64 คือสถาปัตยกรรมที่ถูกต้องสำหรับ collab editor ที่มีภาพ — จึงฟันธง (a) แม้ต้องลงแรงมากกว่า.

### Implementation sketch (dev ทำตามได้)

**Storage backend: Supabase Storage** (reuse Supabase project เดิมที่เป็น DB อยู่แล้ว — ไม่เพิ่ม vendor ใหม่). Bucket `file-assets` แบบ private, serve ผ่าน signed URL หรือ public bucket + path ที่เดายาก. ⚠️ ต้อง ratify (ดู §Ratify).

1. **Prisma — เพิ่ม model `FileAsset`** (`apps/api/prisma/schema.prisma`, migrate):
   ```prisma
   model FileAsset {
     id        String   @id @default(cuid())
     fileId    String
     projectId String   // denormalized เพื่อ authz query เร็ว
     path      String   // storage key ใน bucket
     url       String   // public/signed URL ที่ frontend ใช้
     mimeType  String
     sizeBytes Int
     createdBy String
     createdAt DateTime @default(now())
     file      File     @relation(fields: [fileId], references: [id], onDelete: Cascade)
     project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
     @@index([fileId])
   }
   ```
   เพิ่ม `assets FileAsset[]` ใน `File` และ `Project`.

2. **Dependency + endpoint** (`apps/api/src/files/`):
   - เพิ่ม `@supabase/supabase-js` (สร้าง client ด้วย `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` ใน env — server-side เท่านั้น ห้าม leak ไป frontend)
   - `POST /projects/:id/files/:fileId/assets` ใน `files.controller.ts`:
     - guard เดิม `@UseGuards(JwtGuard, ProjectRoleGuard)` + `@MinRole(Role.Editor)` (pattern เดียวกับ route อื่นในไฟล์)
     - รับ multipart ด้วย `@UseInterceptors(FileInterceptor('file'))` (ต้องเพิ่ม `@nestjs/platform-express` multer — ตั้ง `limits.fileSize` = MAX_IMAGE_BYTES)
     - validate mimeType whitelist `['image/png','image/jpeg','image/webp','image/svg+xml']` + size → reject 400/413 พร้อมข้อความ
     - upload ลง Supabase Storage → insert `FileAsset` row → คืน `{ url }`

3. **Frontend** (`CollabEditor.tsx`):
   - แก้ `onImagePick` (บรรทัด 327): แทน `FileReader.readAsDataURL` ด้วย `fetch(POST .../assets, FormData)` → รับ `{ url }` → `editor.chain().focus().setImage({ src: url }).run()`
   - จัดการ edge case ตาม SRS §6: upload fail → ไม่ insert node + แจ้ง error + retry ได้; ปิดแท็บระหว่าง upload → ไม่มี node ค้าง
   - `insertDrawing` (บรรทัด 355): SVG จาก DrawingCanvas ก็ upload เป็น `image/svg+xml` ผ่าน endpoint เดียวกัน (แทน data URL) เพื่อไม่ให้ SVG ใหญ่ ๆ กลับไปบวมใน ydoc

4. **Legacy base64 migration:** เอกสารเก่ามี base64 อยู่ใน ydoc/`File.content` แล้ว
   - **แนวทางเลือก (แนะนำสำหรับ solo project):** ไม่ต้องเขียน migration script — ปล่อย legacy render ต่อได้ (คง `allowBase64: true` ตาม Decision 3) + ตั้ง body limit เผื่อ legacy save ตาม Decision 4. ภาพเก่ายังทำงาน, ภาพใหม่เป็น URL. ลด scope/risk
   - ถ้า owner ต้องการล้าง debt เต็ม: one-time script อ่าน `File.content`/ydoc → หา `data:image/*` → upload → เขียน URL กลับ (แยกเป็นงานหลัง ไม่บล็อก A1)

---

## Decision 2 — Undo/Redo: อ่าน state จาก Y.UndoManager โดยตรง + drive redo ผ่าน y-prosemirror

### ปัญหาที่แท้จริง
โค้ดปัจจุบัน (บรรทัด 126–129) ยิง `editor.chain().focus().redo().run()` แล้วเชื่อ boolean return ของ TipTap chain ซึ่งไม่ reliable (comment ในโค้ดยืนยัน "redo returns false spuriously"). สาเหตุคือ `can().undo()/redo()` ของ TipTap Collaboration ประเมินผ่าน plugin state ที่ถูกรบกวนด้วย transaction จาก CollaborationCursor/awareness.

### แนวแก้ (dev ทำตามได้)
**อย่า** เปิด StarterKit `history` กลับมา (จะชนกับ Yjs ตาม comment บรรทัด 8–9). ให้เข้าถึง `Y.UndoManager` ตัวจริงที่ y-prosemirror สร้างไว้:

1. `import { yUndoPluginKey, undo as yUndo, redo as yRedo } from 'y-prosemirror'`
2. อ่าน UndoManager ตัวจริง:
   ```ts
   const um = yUndoPluginKey.getState(editor.state)?.undoManager // Y.UndoManager
   const canUndo = (um?.undoStack.length ?? 0) > 0
   const canRedo = (um?.redoStack.length ?? 0) > 0
   ```
   `undoStack`/`redoStack` เป็น array จริง → **reliable กว่า `can().undo()/redo()`** ใช้ enable/disable ปุ่มได้ตาม SRS A2 (ปุ่ม disabled เมื่อ stack ว่าง แทน no-op เงียบ)
3. Drive การกระทำด้วย prosemirror command ตรง ๆ: `yUndo(editor.state)` / `yRedo(editor.state)` (หรือ `um.undo()/um.redo()`) แทน chain boolean → ตัดปัญหา spurious false
4. Re-render ปุ่มด้วยการ subscribe event: `um.on('stack-item-added', tick); um.on('stack-item-popped', tick)` (มี `forceTick` อยู่แล้ว) — ไม่ต้องพึ่ง `onTransaction` อย่างเดียว
5. **ตรวจ `trackedOrigins`:** ยืนยันว่า UndoManager track เฉพาะ origin ของ local edit (ySyncPlugin) และ **ไม่** track awareness/remote origin (default ของ y-prosemirror ถูกอยู่แล้ว — แต่ต้องมี test ยืนยันตาม SRS A2/§6: multi-client undo กระทบเฉพาะ edit ของตัวเอง)
6. ตรวจ version `y-prosemirror` ให้ export `yUndoPluginKey` (ถ้าเวอร์ชันเก่าไม่มี ให้ bump — บันทึกเป็น follow-up)

---

## Decision 3 — `allowBase64`: **คง `true` ชั่วคราว** + ปิดช่องโหว่ด้วย handlePaste/handleDrop (ไม่พึ่ง flag)

- **คง `allowBase64: true`** (`ResizableImage.configure`, บรรทัด 207) ต่อไป **เพราะ legacy seed path** (`editor.commands.setContent(migrateLegacyDrawings(initialContent))`, บรรทัด 290) parse HTML เก่าที่มี `<img src="data:...">` — ถ้าปิด flag ตอนนี้ ProseMirror จะ **drop ภาพ base64 เก่าทิ้งตอน parse** = legacy docs พัง
- **ปิดช่องโหว่ paste/drag (SRS #4, §9)** ไม่ใช่ด้วย flag แต่ด้วย `editorProps.handlePaste` + `handleDrop` ใน `useEditor`: ดักไฟล์ภาพ/data-URI ที่ถูก paste/drop → validate size+type (ใช้ logic เดียวกับ `onImagePick`) → upload → insert URL. `allowBase64` gate ไม่ครอบ path นี้อยู่แล้ว จึงต้องดักที่ handler เอง
- **หลัง** ทำ base64→URL migration เต็ม (ถ้า owner เลือกทำ) จึงค่อยพลิก `allowBase64: false` เพื่อ hard-block regression ถาวร — บันทึกเป็น follow-up

---

## Decision 4 — Body-parser limit ใน `main.ts` (ตั้งไม่ว่าเลือก a หรือ b)

**ปัจจุบัน `main.ts` ไม่ตั้ง limit เลย** → Express default 100KB เตะก่อนถึง `SaveContentDto` (`@MaxLength(5MB)` ที่ตั้งไว้แต่ไม่เคยถูกใช้) = root cause 413.

เพิ่มก่อน `app.useGlobalPipes(...)` (บรรทัด 46):
```ts
import { json, urlencoded } from 'express'
// ...
app.use(json({ limit: '10mb' }))
app.use(urlencoded({ extended: true, limit: '10mb' }))
```
- **`10mb`**: เผื่อ legacy base64 docs (ยัง save ผ่าน content mirror ได้ระหว่าง transition) + gate จริงย้ายไปที่ DTO layer (`@MaxLength`) ที่คืน 400 พร้อมข้อความชัดแทน 413 ดิบ ๆ
- **Trade-off:** body 10MB เป็น DoS surface เล็กน้อย แต่ route ทั้งหมด auth + `@MinRole(Editor)` (authenticated-only) → รับได้
- **หลัง** migrate เป็น URL หมดแล้ว: ลด limit เหลือ ~`1mb` + ลด `SaveContentDto @MaxLength` ตาม (doc ที่เป็น URL ล้วนเล็กมาก) — บันทึกเป็น follow-up เพื่อกระชับ attack surface

---

## Consequences

- **บวก:** แก้ root cause จริงทั้ง 3 บั๊ก; ydoc/WS payload เล็กลงมหาศาล → real-time ลื่นขึ้น; undo/redo state reliable; ช่องโหว่ paste ปิด
- **ลบ / ต้นทุน:** เพิ่ม dependency (`@supabase/supabase-js`, multer), migration DB (`FileAsset`), env secret ใหม่ (service-role key — ต้องจัดการ rotation/secret hygiene), งาน A1 ใหญ่ขึ้นกว่า Option (b)
- **ไม่แตะ:** CRDT schema, Hocuspocus persistence, extension list ที่กระทบ Yjs (ตาม SRS §4)

## Ratify (owner ต้องยืนยันก่อน implement A1)
1. **อนุมัติ Supabase Storage** (private bucket `file-assets` + `SUPABASE_SERVICE_ROLE_KEY` ใน API env) — หรือเลือก local disk + serve ผ่าน API แทน
2. ขนาดสูงสุด/ภาพ: คง 3MB (`MAX_IMAGE_BYTES` เดิม) หรือปรับ
3. Whitelist ชนิดไฟล์: `png/jpeg/webp/svg+xml` (แนะนำ) หรือคง `image/*`
4. Legacy base64: ปล่อย legacy render (แนะนำ, scope เล็ก) หรือทำ migration script เต็ม
