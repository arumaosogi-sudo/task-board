# Sprint 4 — Feature Candidate Evaluation

**Author:** ux-ui-design-architect · **สถานะ:** เสนอเพื่อรีวิว (วิเคราะห์เท่านั้น ไม่แตะโค้ด)
**อ่านคู่กับ:** `design/DESIGN_SPEC.md` (Sprint 3 — IA consolidation, ตอนนี้ implement ครบแล้วตามที่ตรวจโค้ดจริง: `Activity.tsx` รวม MyUpdates+ProjectChanges แล้ว, `Card` มี prop `interactive` แล้ว)

**หมายเหตุสำคัญก่อนอ่าน:** ผมตรวจโค้ดจริง (`apps/web/src`, `apps/api/src`, `apps/api/prisma/schema.prisma`) ก่อนประเมิน ไม่ได้ประเมินจากชื่อฟีเจอร์ลอยๆ — พบว่า **2 ใน 8 ตัวมีฐานอยู่แล้วบางส่วน** (mentions, favorites) ซึ่งเปลี่ยน effort/scope ที่ควรเสนอจริงไปมาก รายละเอียดในตารางข้อ 1

---

## 1. ประเมินทั้ง 8 ตัว

| # | ฟีเจอร์ | User value | UX fit กับ flow ปัจจุบัน | Effort | เข้ากับสถาปัตยกรรมที่มีอย่างไร | ความเสี่ยง |
|---|---|---|---|---|---|---|
| 1 | 💬 Comments & inline annotations | **สูงมาก** — ปิดช่องว่างสุดท้ายของ concept "GitHub diff + Google Docs": ตอนนี้มี diff/version history (GitHub) แต่ไม่มี review/discuss แบบ Google Docs comment | สูง — คนละ mode จาก editing แต่เสริมกันตรงจุด: reviewer เปิดไฟล์ ไฮไลต์ข้อความ คอมเมนต์ ไม่ต้องแก้เนื้อหาเอง (ต่างจาก mode แก้ตรงที่มีอยู่) | **L** | ต้องผูก comment เข้ากับตำแหน่งข้อความใน TipTap/Yjs doc — ใช้ **Yjs `RelativePosition`** (มีอยู่แล้วในระบบผ่าน `yjs` lib ที่ CollabEditor ใช้อยู่) แปลง absolute position → relative ที่ทนต่อการแก้ไขพร้อมกันได้ ต้องมี Prisma model ใหม่ (`Comment`: fileId, authorId, anchorFrom/anchorTo หรือ serialized relative pos, body, parentId สำหรับ reply, resolvedAt) + module ใหม่ฝั่ง API (ตามแพทเทิร์น `notifications`/`updates` ที่มีอยู่) ฝั่ง editor ต้องเพิ่ม TipTap **Mark** (ไม่ใช่ Node) สำหรับ highlight ช่วงที่ถูกคอมเมนต์ — มี precedent ตรงในโค้ดเบสแล้วคือ `apps/web/src/components/editor/Box.ts` (custom node ที่ round-trip ผ่าน Yjs/getHTML/PDF export ได้จริง) ใช้แพทเทิร์นเดียวกันได้เลย | **กลาง** — จุดเสี่ยงจริงคือ "anchor จะเป็นยังไงเมื่อ user restore revision เก่าผ่าน `HistoryModal`" (เนื้อหาเปลี่ยนกลับ ตำแหน่ง comment เดิมอาจไม่ตรงบริบทแล้ว) เป็นคำถามสถาปัตยกรรมที่ต้องตัดสินใจก่อนเขียน SRS ไม่ใช่ปล่อยให้ dev เจอเอง |
| 2 | @️ Mentions → notification | กลาง (ของเดิมมีอยู่แล้ว ที่ขาดคือ UX ตอนพิมพ์) | **ฐาน backend มีอยู่แล้วสมบูรณ์**: `NotificationType.Mention` ใน schema, `revisions.service.ts` regex-diff หา `@username` ใหม่เทียบ snapshot ก่อนหน้าแล้วยิง `Notification`, opt-in ผ่าน `notifyMention` ใน `UserSetting`, `NotificationBell.tsx` render ข้อความ "mentioned you in {file}" ครบแล้ว **ช่องว่างจริงมีจุดเดียว:** editor ไม่มี TipTap Mention extension/autocomplete — user ต้องพิมพ์ `@username` เองแบบเดา สะกดผิดหรือ user ที่ไม่ใช่ member ก็เงียบไม่มี feedback | **S** | เพิ่ม `@tiptap/suggestion` (official, family เดียวกับ extension ที่ติดตั้งอยู่แล้ว `@tiptap/*: ^2.27.2`) + popup แนะนำรายชื่อ member ของ project (มี endpoint สมาชิกอยู่แล้วจาก `Membership`) + render เป็น inline mention chip node (แพทเทิร์นเดียวกับ Box) **ไม่ต้องแตะ backend เลย** เพราะ mention detection/notification ทำงานอยู่แล้วจาก regex บน HTML — แค่ให้ editor render `<span data-mention="username">` ที่ regex เดิม match ได้ | ต่ำ |
| 3 | 🤖 AI ช่วยเขียน (สรุป/ปรับสำนวน/แปล th↔en) | สูง (ตรงกับ pain point ของแอปเขียนรายงานสองภาษาโดยตรง) | ต้องออกแบบให้เข้ากับ "diff-first" identity ของแอป — **ไม่ควรเขียนทับเนื้อหาเงียบๆ** ควรแสดงผล AI เป็น "ข้อเสนอ" ที่ diff ให้เห็นก่อน accept (ใช้ `DiffView` component ที่มีอยู่แล้วสำหรับ revision diff ได้เลย เป็นจุดที่เข้ากับ concept สุดๆ) | **L** | **ไม่มี AI SDK/vendor ใดๆ ในระบบเลย** (เช็ค `package.json` ทั้ง web/api แล้ว ไม่มี openai/anthropic/ai) ต้องเริ่มจากศูนย์: เลือก provider, จัดการ API key/secrets, endpoint ใหม่ฝั่ง api, rate-limit/cost control, ต้องมี fallback เมื่อ AI ล่ม/ช้า (เอกสารกำลังแก้ real-time อยู่ ห้าม block editor) | **สูง** — เอกสารอาจมีข้อมูลลับของ user ส่งออกไป third-party AI ต้องมี **security-engineer** ทำ threat model ก่อน (data residency, prompt injection ผ่านเนื้อหาเอกสาร, PII) เป็น cross-cutting decision ระดับ architecture ไม่ใช่แค่ design |
| 4 | 📄 Templates รายงาน | สูง — แก้ "blank page problem" ตรงกับ target user (คนเขียนรายงาน อาจไม่ถนัด format เอง) | fit ดีมาก เข้ากับ flow สร้าง project/ไฟล์ปัจจุบันโดยตรง (เพิ่ม step เดียวใน dialog "สร้างไฟล์ใหม่") | **M** | ไม่มี Template model แต่ **ไม่ต้องมี** ก็ได้ในเวอร์ชันแรก — ใช้ไฟล์ seed แบบ static (HTML content ชุดคงที่ต่อ template ผูก th/en) แล้ว duplicate เข้า `File.content` ตอนสร้าง คล้าย logic "สร้างไฟล์เปล่า" ที่มีอยู่แล้ว ไม่ต้องแตะ Yjs/collab เพราะเป็นแค่ initial content ก่อนเปิด editor ครั้งแรก | ต่ำ — ไม่แตะ real-time/security path เลย |
| 5 | 🔗 Public share link (view-only, token) | สูงสำหรับ external stakeholder (ส่งรายงานให้คนนอกทีมดูโดยไม่ต้องมี account) | ต้องออกแบบ **หน้าใหม่ทั้งหน้า** (read-only viewer นอก `AppShell`, ไม่มี sidebar/⌘K/bell เพราะ anon ไม่มีสิทธิ์เห็นสิ่งเหล่านั้น) — เป็น surface ใหม่ ไม่ต่อยอด flow เดิมโดยตรง | **M–L** | ทั้งระบบตอนนี้ auth-gated 100% (`ProtectedRoute` ที่ web, JWT+`ProjectRoleGuard` ที่ api, และมี **Supabase RLS** ผูกกับ authenticated user — เห็นจาก `apps/api/src/prisma/rls.int-spec.ts` และ `supabase-rls-fix.sql` ที่ root) การเปิดเส้นทาง unauthenticated ต้องมี guard ใหม่ที่ validate opaque token แทน JWT และต้องตัดสินใจว่า bypass RLS ผ่าน service-role connection อย่างไรให้ปลอดภัย เป็น **การเปลี่ยนโมเดล security ของทั้งระบบ ไม่ใช่แค่ endpoint ใหม่** ควรง่ายกว่านี้ถ้าจำกัดขอบเขต: เสิร์ฟ **snapshot ล่าสุด (readonly, ไม่ real-time)** ไม่เปิด Yjs WS ให้ anon เลย (ตัดความเสี่ยงเรื่อง collab session ของคนแปลกหน้าไปโดยสิ้นเชิง) | **สูง** — ต้องมี security-engineer ทำ threat model ก่อนเขียน SRS (token brute-force, revocation, expiry, การป้องกัน RLS bypass รั่วไปยัง endpoint อื่น) |
| 6 | 📤 Export เพิ่ม: Word / Markdown / ทั้งโปรเจกต์ | กลาง-สูง (practical, non-technical stakeholder มักขอไฟล์ Word) | เป็น action เสริมจากปุ่ม export PDF ที่มีอยู่แล้ว (`WorkPage.tsx` มีปุ่ม `exportPdf` ใน header) — fit ดี แค่เพิ่มตัวเลือกในปุ่มเดิม | **M** ต่อ format | PDF export ปัจจุบันเป็นแบบ "dependency-free": เปิด print window แล้วให้ browser \"Save as PDF\" เอง (`WorkPage.tsx:281-282`) — **เทคนิคนี้ใช้กับ Word/Markdown ไม่ได้** ต้อง convert จริงจาก HTML/TipTap JSON (เพิ่ม lib เช่น html-to-docx / turndown) ความเสี่ยง fidelity อยู่ที่ custom node ที่มีอยู่แล้ว: `Box` callout, `DrawingCanvas` (SVG freehand), `ResizableImage` — ต้อง map แต่ละตัวไป Word/Markdown ให้ไม่พัง (drawing SVG → Word ทำยากกว่า PDF มาก) Export "ทั้งโปรเจกต์" ต้อง zip หลายไฟล์ (เพิ่ม lib jszip) | กลาง — ความเสี่ยงเชิง fidelity ไม่ใช่เชิง security |
| 7 | ✅ Task/checklist blocks ใน editor | กลาง (รายงานที่มี action items ใช้บ่อย) | fit ธรรมชาติ ไม่ชนอะไร เป็น block type เพิ่มเติมในโครงสร้าง node ที่มีอยู่แล้ว | **S** | **มี precedent ตรงในโค้ดเบสแล้ว** — `Box.ts` พิสูจน์แล้วว่า custom TipTap node round-trip ผ่าน Yjs collab, `getHTML()`, และ PDF export ได้จริงโดยไม่ต้องแก้อะไรเพิ่ม แค่เพิ่ม official `@tiptap/extension-task-list` + `@tiptap/extension-task-item` (ตระกูลเวอร์ชันเดียวกับที่ติดตั้งอยู่แล้วทั้งหมด `^2.27.2`) แล้ว style checkbox ด้วย token ที่มีอยู่ ทำงานผ่าน Yjs อัตโนมัติเพราะเป็นแค่ ProseMirror node ภายใต้ `Collaboration` extension เดิม | **ต่ำสุดในทั้ง 8 ตัว** — ไม่แตะ schema, ไม่แตะ security, ไม่แตะ backend เลย |
| 8 | 🏷️ Tags/favorites + per-project activity timeline | ผสม — ส่วน favorites ผู้ใช้มีอยู่แล้ว, ส่วน tags ยังไม่ชัดว่า demand จริงแค่ไหน | ต้องแยกประเมิน 3 ส่วนย่อย (ดูรายละเอียดด้านล่างตาราง) | **ผสม** (ดูด้านล่าง) | ผสม | ต่ำ (เป็นฟีเจอร์ organizational ไม่แตะ security) |

**รายละเอียดข้อ 8 (ต้องแยกเพราะสถานะไม่เท่ากัน 3 ส่วน):**
- **Favorites ระดับ project — มีอยู่แล้วสมบูรณ์:** `ProjectPin` model, `pin()`/`unpin()` ใน `projects.service.ts`, ปุ่ม pin/unpin + ดาวใน `Home.tsx:46,66-67` ใช้งานได้จริงวันนี้ — **ไม่ใช่ candidate ที่ต้องทำใหม่**
- **Per-project activity timeline — effort ต่ำมากถ้าทำ:** หน้า `Activity.tsx` (Sprint 3) มี hook `useProjectChanges(range, projectId, ...)` ที่รับ `projectId` param อยู่แล้ว และมี `Menu` filter เลือก project ได้แล้วในหน้า Activity กลาง สิ่งที่ยังไม่มีคือ "แท็บกิจกรรม" ฝังอยู่ใน `WorkPage`/`ProjectSettings` โดยตรง (ตอนนี้ต้องออกจาก editor ไป sidebar → Activity → เลือก filter project) ถ้าจะทำ ทำได้โดย reuse hook เดิมเกือบ 100% แค่เพิ่ม panel/tab ใหม่ในบริบท project — effort **S**
- **Tags (label ใหม่, ไม่ใช่ favorite):** ไม่มี Tag model เลย ต้องสร้างใหม่ทั้ง data model (many-to-many กับ Project หรือ File), UI สำหรับสร้าง/ลบ/กรองด้วย tag — effort **M** แต่ **ยังไม่มีหลักฐาน demand ชัดเจน** จาก candidate list เดิม (PM รวม tags กับ favorites มาเป็นข้อเดียว ทั้งที่ favorites ทำเสร็จแล้ว บ่งชี้ว่าอาจเป็นการเข้าใจผิดว่ายังไม่มี ไม่ใช่ requirement ที่ validate มาแล้ว)

---

## 2. Shortlist ที่แนะนำให้ทำ Sprint 4 (4 ตัว)

| ลำดับ | ฟีเจอร์ | ประเภท | Effort | เหตุผลที่เหมาะกับโปรเจกต์นี้โดยเฉพาะ |
|---|---|---|---|---|
| 1 | **Comments & inline annotations** | 🎯 Big bet | L | นี่คือชิ้นส่วนสุดท้ายที่ทำให้ concept "GitHub diff + GoodNotes + Google Docs" สมบูรณ์ — ตอนนี้มี diff (GitHub) + freehand annotation บน canvas (GoodNotes) แล้ว แต่ไม่มี "คุยกันเรื่องข้อความ" แบบ Google Docs comment เลย เป็น gap เชิง positioning ของโปรดักต์ ไม่ใช่แค่ feature request |
| 2 | **Task/checklist blocks** | ✅ Quick win | S | Effort ต่ำสุดในทั้ง 8 ตัว มี precedent ตรงในโค้ด (`Box.ts`) ให้ทำตามแพทเทิร์นได้เลย ความเสี่ยง = 0 (ไม่แตะ backend/security) เหมาะเป็น "ของแถม" ที่ทำคู่ขนานกับ item ใหญ่โดยไม่แย่งทรัพยากร |
| 3 | **Mention autocomplete UI** (ไม่ใช่ "สร้างระบบ mention" เพราะมีแล้ว) | ✅ Quick win | S | ระบบหลังบ้านทำงานอยู่แล้ว 100% (regex diff + notification + opt-in) แค่เติม UX ฝั่งพิมพ์ให้ discoverable — ได้ "ฟีเจอร์ที่รู้สึกใหม่" โดยแทบไม่มี backend risk เป็น ROI สูงสุดของ sprint นี้ |
| 4 | **Templates รายงาน** | ✅ Quick win (เฉียง M) | M | ตรงกับตัวตนสินค้าที่สุด (แอป "เขียนรายงาน") ไม่แตะ real-time/security path ลด blank-page friction ให้ user ใหม่ตั้งแต่วันแรก และเป็นฐานให้ export (candidate #6, deferred) มีเนื้อหาที่ "น่า export" มากขึ้นในอนาคต |

**เกณฑ์การเลือก:** จับคู่ big bet เดียว (Comments) กับ quick win หลายตัวที่ effort รวมกันยังต่ำกว่า Comments ตัวเดียว เพื่อให้ sprint มี output ที่จับต้องได้เร็วระหว่างที่ Comments (งานยาก/เสี่ยง) กำลังพัฒนา — ไม่ทุ่มทั้ง sprint ไปกับของเสี่ยงตัวเดียว

---

## 3. ตัวที่แนะนำ Defer/ตัด

| ฟีเจอร์ | เหตุผล |
|---|---|
| **🤖 AI ช่วยเขียน** | ไม่มี AI vendor/infra ใดๆ ในระบบเลยวันนี้ — การเลือก provider + จัดการ secrets + security threat model (เอกสาร user อาจมีข้อมูลลับ ส่งออกไป third-party) เป็น **การตัดสินใจสถาปัตยกรรมระดับบริษัท** ไม่ควรทำแบบ "แถมใน sprint เดียวกับ comments" เพราะทั้งสองแตะ editor UI พร้อมกัน เสี่ยง scope ชนกัน แนะนำแยกเป็น sprint ของตัวเอง เริ่มด้วย ADR (`fullstack-architect-mentor` + `security-engineer`) ก่อนมี SRS |
| **🔗 Public share link** | ความเสี่ยง security สูงสุดในทั้ง 8 ตัว (เปิดช่องทาง unauthenticated เข้าถึงข้อมูลที่ทั้งระบบออกแบบให้ auth-gated 100% มาตั้งแต่ต้น รวม Supabase RLS) ควรมี **threat model จาก security-engineer ก่อน** ไม่ใช่หลัง ถ้าเร่งทำพร้อม comments ในผู้พัฒนา/เวลาเดียวกัน ความเสี่ยงจะกระจายเกินจัดการ แนะนำ defer ไป sprint ที่มี security-engineer ตรวจตั้งแต่ SRS |
| **📤 Export Word/Markdown/ทั้งโปรเจกต์** | ไม่มี urgency ที่ระบุ (ไม่มี user complaint ที่อ้างถึง) และมีความเสี่ยง fidelity ที่ต้องสืบเพิ่ม (Box callout / DrawingCanvas SVG / ResizableImage → Word) แนะนำทำหลัง Templates เสร็จ (sprint ถัดไป) เพราะจะมีเนื้อหาจริงที่หลากหลายให้ทดสอบ conversion ได้ครบกว่า |
| **🏷️ Tags** | Favorites (ที่ PM อาจตั้งใจสื่อถึง) มีอยู่แล้วเสร็จสมบูรณ์ในระบบวันนี้ ส่วน tags ใหม่จริงๆ ยังไม่มีหลักฐาน demand ที่ validate มา แนะนำให้ `market-research-growth-hacker` หรือเก็บ feedback จาก user จริงก่อนลงทุนสร้าง data model ใหม่ ส่วน **per-project activity timeline** (effort ต่ำ, reuse hook เดิม) ถ้า capacity เหลือใน sprint สามารถแถมเข้าไปพร้อม Comments ได้เลยเพราะแตะไฟล์ WorkPage เดียวกันอยู่แล้ว — ไม่จำเป็นต้องเป็น sprint แยก |

---

## 4. Sketch flow/หน้าจอสำหรับ Shortlist (ส่งต่อ `srs-architect`)

### 4.1 Comments & inline annotations

**Entry point:** ใน `CollabEditor` (`apps/web/src/components/CollabEditor.tsx`) — เลือกข้อความ → BubbleMenu ที่มีอยู่แล้ว (ใช้ทำ bold/italic ปัจจุบัน) เพิ่มปุ่มไอคอนคอมเมนต์ใหม่

```
[เลือกข้อความ] → BubbleMenu โผล่ (มีอยู่แล้ว) → ปุ่ม "💬 คอมเมนต์" ใหม่
  → เปิด popover เล็กพิมพ์ข้อความแรก → Enter/ส่ง
  → ข้อความที่เลือกไฮไลต์เป็น mark สีเหลืองอ่อน (โทน warning/accent ที่มีอยู่ใน token)
  → ไอคอน comment-count เล็กๆ โผล่ที่ margin ขวาของ editor (คล้าย Google Docs)
```

**Panel รายการคอมเมนต์:** เพิ่มแท็บ/toggle ในปุ่มที่มีอยู่แล้วข้าง header ของ WorkPage (ข้างปุ่ม history/gear ที่บรรทัด ~305 ของ `WorkPage.tsx`) เปิดเป็น side panel (แพทเทิร์นเดียวกับ `RevisionDiffDrawer` — slide-in จากขวา):

```
┌─ Comments (12) ──────────────┐
│ [ทั้งหมด | ยังไม่ปิด | ปิดแล้ว] ← Segmented (มี component แล้ว)
│ ┌───────────────────────────┐│
│ │ Avatar  ชื่อผู้คอมเมนต์  · 3 นาทีที่แล้ว
│ │ "ควรระบุตัวเลขให้ชัดกว่านี้"  │
│ │ [ตอบกลับ]  [✓ Resolve]      │
│ │  └─ reply thread (indent)   │
│ └───────────────────────────┘│
└───────────────────────────────┘
```
คลิกคอมเมนต์ในลิสต์ → editor scroll ไปตำแหน่ง anchor + flash highlight (ใช้ Yjs RelativePosition resolve กลับเป็น absolute ตอนคลิก)

**States:** Empty ("ยังไม่มีคอมเมนต์ในไฟล์นี้ เลือกข้อความแล้วกดไอคอนคอมเมนต์เพื่อเริ่ม"), Loading = Skeleton 3 แถว (แพทเทิร์นเดิมทั้งระบบ), Resolved comment = mark สีจางลง + ไอคอน checkmark, anchor ที่หาตำแหน่งไม่เจอ (กรณี restore revision เก่าทับ) = แสดง comment ใน list แต่ไม่มีปุ่ม "ไปที่ตำแหน่ง" พร้อม label "ตำแหน่งเดิมถูกแก้ไขแล้ว"

**จุดกระทบ:**
- Frontend: `CollabEditor.tsx` (mark node ใหม่ + BubbleMenu action), ไฟล์ใหม่ `CommentsPanel.tsx` (แพทเทิร์นจาก `RevisionDiffDrawer.tsx`), เพิ่ม i18n keys `comments.*`
- Backend: module ใหม่ `apps/api/src/comments/` (controller/service/dto ตามแพทเทิร์น `notifications`), Notification type ใหม่ `NotificationType.Comment`/`CommentReply` (ต่อยอด enum เดิม, opt-in field ใหม่ใน `UserSetting`)
- Schema: model `Comment` ใหม่ (fileId, authorId, anchor JSON, body, parentId?, resolvedAt?, resolvedById?) — migration ใหม่
- **ต้องตัดสินใจร่วมกับ architect ก่อน SRS:** กลยุทธ์ anchor เมื่อ restore revision เก่า (ข้อ 1 ของตาราง)

### 4.2 Task/checklist blocks

**Entry point:** BubbleMenu หรือ slash-command ที่มีอยู่แล้วในทูลบาร์ของ editor (ต้องดูโค้ด toolbar จริงตอนทำ SRS ว่าปัจจุบันมี "/" command menu หรือใช้ปุ่ม toolbar ธรรมดา — ถ้ายังไม่มีให้เพิ่มปุ่ม toolbar ธรรมดาไปก่อน ไม่ต้องสร้าง slash-menu ใหม่)

```
คลิกปุ่ม "☑ Checklist" ใน toolbar → แทรก task-item แรกว่างเปล่า พร้อม checkbox
Enter → task-item ใหม่ต่อท้าย (ค่า default ของ extension)
คลิก checkbox → toggle checked state → sync ผ่าน Yjs ทันที (เหมือนพิมพ์ข้อความ)
```

**จุดกระทบ:** Frontend เท่านั้น — `CollabEditor.tsx` เพิ่ม `@tiptap/extension-task-list` + `@tiptap/extension-task-item` ในรายการ extension, เพิ่ม CSS สำหรับ checkbox ให้ตรง token ระบบ ไม่ต้องแตะ backend/schema เลย (content เก็บใน `File.content`/`ydoc` เหมือน node อื่นทุกประการ)

### 4.3 Mention autocomplete

```
พิมพ์ "@" ในเอกสาร → popup dropdown แสดงรายชื่อ member ของ project (กรองจากที่พิมพ์ต่อ)
  → Avatar + username + role tag
เลือกจาก list (คลิก/ลูกศร+Enter) → แทรกเป็น mention chip (พื้นหลัง primary-soft, ไม่ใช่ plain text)
```

**จุดกระทบ:** Frontend เท่านั้น — `CollabEditor.tsx` เพิ่ม suggestion extension + mention node ใหม่ (เรียก endpoint `Membership` ที่มีอยู่แล้วเพื่อดึงรายชื่อ) **Backend ไม่ต้องแก้เลย** เพราะ regex mention-detection ใน `revisions.service.ts:169-170` ทำงานกับ `@username` string อยู่แล้ว ต้องแค่ตรวจว่า `renderHTML` ของ mention node ยังคง render เป็น `@username` เป็น text ที่ regex จับได้ (ไม่ใช่แค่ data attribute ที่ไม่มี `@` ปรากฏจริงใน HTML)

### 4.4 Templates รายงาน

**Entry point:** dialog "สร้างไฟล์ใหม่" ที่มีอยู่แล้วในบริบท project (เพิ่ม step เลือก template)

```
[+ ไฟล์ใหม่] → Modal (component มีอยู่แล้ว)
  ┌─────────────────────────────┐
  │ เริ่มจาก:                     │
  │ ○ เอกสารเปล่า (ค่าเดิม)         │
  │ ○ รายงานความคืบหน้า (Progress) │
  │ ○ สรุปการประชุม (Meeting Notes)│
  │ ○ ข้อเสนอโครงการ (Proposal)     │
  └─────────────────────────────┘
  → เลือกแล้ว "สร้าง" → File.content seed จาก template string (th/en ตาม locale ปัจจุบันของ user)
```

**จุดกระทบ:** Frontend: modal เดิมเพิ่ม radio/card selector, เพิ่มไฟล์ static content templates (th/en) 3-4 ชุด, ไม่ต้องมี template management UI ใน v1 (hardcode ในโค้ด ไม่ใช่ user-created templates) Backend: อาจไม่ต้องแก้เลยถ้า frontend ส่ง `content` เริ่มต้นผ่าน endpoint สร้างไฟล์ที่มีอยู่แล้ว (ต้องตรวจ `files.controller.ts` ว่ารับ initial content ได้หรือไม่ระหว่างทำ SRS) Schema: ไม่ต้องมี model ใหม่ในเวอร์ชันแรก

---

## 5. ตัวที่ควรเริ่มก่อน (ลำดับแรกของ Sprint 4)

## **เริ่มด้วย Comments & inline annotations**

**เหตุผล:** เป็นตัวเดียวในชอร์ตลิสต์ที่มี **การตัดสินใจสถาปัตยกรรมค้างอยู่ก่อนเขียน SRS ได้** (กลยุทธ์ anchor ตอน restore revision เก่า — ข้อ 4.1) ถ้าปล่อยไว้ท้าย sprint จะกลายเป็นคอขวดที่ทำให้ทั้ง sprint เสร็จช้า เพราะ `srs-architect` และ `fullstack-architect-mentor` ต้องคุยกันก่อนเขียนสเปกละเอียดได้ ควรส่งต่อ SRS ของตัวนี้เข้าคิวก่อนสุด — ส่วน Task/checklist, Mention autocomplete, และ Templates **ไม่มี dependency ต่อกันเลยและไม่มีคำถามสถาปัตยกรรมค้าง** จึงมอบให้ `senior-fullstack-dev` เริ่มลงมือคู่ขนานได้ทันทีโดยไม่ต้องรอผลจาก Comments — ใช้ประโยชน์จาก "ทำงานขนาน" ตาม `docs/TEAM_PROTOCOL.md` ได้เต็มที่

---

### 🤝 HANDOFF

**จาก:** ux-ui-design-architect (Sprint 4 — Feature evaluation only, ยังไม่มี SRS/architecture/code)
**ถึง:** PM/Owner รีวิว shortlist ก่อน → เมื่อ confirm แล้วส่งต่อ `srs-architect` เขียน SRS ของ 4 ฟีเจอร์ในชอร์ตลิสต์ (เริ่มจาก Comments ตามข้อ 5)

**ไฟล์ผลงาน:** `docs/sprint4-feature-candidates.md` (ไฟล์นี้)

**Open question ที่ owner/architect ควรตัดสินใจก่อน SRS ของ Comments:**
- Anchor ของ comment จะทำอย่างไรเมื่อ user restore revision เก่าผ่าน `HistoryModal` — ตัวเลือก: (a) comment ผูกกับ revision ที่สร้างขึ้น ถ้า restore ทับ ให้ mark เป็น "orphaned" แต่ยังอ่านได้ (แนะนำ ปลอดภัยสุด) หรือ (b) พยายาม re-anchor อัตโนมัติด้วย fuzzy text match (ซับซ้อนกว่ามาก ความเสี่ยง bug สูง)
- ระดับสิทธิ์ resolve comment — Owner/Editor เท่านั้น หรือทุกคนที่เห็นไฟล์ (รวม Viewer) ได้ด้วย
