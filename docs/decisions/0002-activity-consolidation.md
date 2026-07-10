# 0002 — Activity Consolidation: รวมแค่ UI ไม่รวม backend endpoint

- **สถานะ:** Accepted
- **วันที่:** 2026-07-10
- **ผู้ตัดสิน:** fullstack-architect-mentor (Tech Lead)
- **บริบท sprint:** `chore/sprint-3-premium-ui` — IA Consolidation ข้อ 6 ใน `design/DESIGN_SPEC.md`
- **เกี่ยวข้อง:** `design/DESIGN_SPEC.md` (หมวด 3.2), `docs/decisions/0001-test-strategy.md`

---

## Context

Design Spec เสนอรวมสองหน้า **"สิ่งที่ฉันแก้" (`/my-updates`)** และ **"ความเปลี่ยนแปลง" (`/project-changes`)** เป็นหน้าเดียว **"กิจกรรม" (Activity, `/activity`)** พร้อม in-page toggle **"ทั้งหมด / เฉพาะของฉัน"**

Open question ที่ต้องตัดสินก่อน dev เริ่ม: **รวมที่ระดับ backend endpoint ด้วย (endpoint `Activity` เดียวรับ `scope` param) หรือรวมแค่ UI (frontend เรียก 2 endpoint เดิมตามโหมด)?**

### ข้อมูลจริงจากโค้ด (ตัดสินด้วยของจริง ไม่เดา)

อ่าน `apps/api/src/updates/updates.service.ts` + `updates.controller.ts` + `dto/updates-query.dto.ts` แล้ว สอง endpoint นี้ query จาก **ตาราง `Revision` เดียวกัน, membership auth เดียวกัน, filter `range`/`projectId` เหมือนกัน** ต่างกันแค่:

| | `GET /me/updates` (`myUpdates`) | `GET /me/project-changes` (`projectChanges`) |
|---|---|---|
| Author filter | hardcode `authorId = userId` (คือ "ของฉัน") | optional `authorId` param (ไม่ส่ง = ทุกคน) |
| Field พิเศษใน response | `scope: 'owner' \| 'member'` (คำนวณจาก `project.ownerId === userId`) | `authorId`, `authorName` |
| Shape ที่เหลือ | `id, projectId, projectName, fileId, fileName, label, createdAt` | เหมือนกันทุก field |

**ข้อสรุปเชิงข้อมูล:** shape ต่างกัน**เพียงเล็กน้อย** และความต่างนั้น **map 1:1 กับสิ่งที่ Design ต้องการ render ต่างโหมด** พอดี:
- โหมด "เฉพาะของฉัน" → Design ให้แสดง **`Tag` scope (owner/member)** = field ที่ `myUpdates` มีอยู่แล้ว
- โหมด "ทั้งหมด" → Design ให้แสดง **`Avatar` + บรรทัด "BY: ชื่อ"** = field ที่ `projectChanges` มีอยู่แล้ว

สำคัญที่สุด: Activity toggle เป็น **either/or** (ดู "ของฉัน" *หรือ* "ทั้งหมด") **ไม่ใช่การ concatenate สอง source เป็น list เดียว** → เหตุผลคลาสสิกที่มักบังคับให้ต้อง merge ที่ backend (ต้อง sort/paginate ข้าม source ให้ถูกต้อง) **ไม่มีในเคสนี้** แต่ละโหมด = 1 query อิสระ

---

## Decision

**เลือก (ก) รวมแค่ UI — คงสอง backend endpoint เดิมไว้ ไม่สร้าง endpoint `Activity` ใหม่**

Frontend หน้า `/activity` สลับ hook ตามโหมด: `scope='mine'` → `useMyUpdates` (`/me/updates`), `scope='all'` → `useProjectChanges` (`/me/project-changes`)

### เหตุผล

1. **Endpoint ต่างกันแค่ scope ไม่ใช่ shape ที่แท้จริง** — และความต่างเล็กน้อยนั้น map ตรงกับ requirement การ render ต่างโหมดของ Design พอดี (mine→Tag, all→Avatar+BY) endpoint เดิมจึง "พอดีตัว" อยู่แล้ว ไม่ต้องแต่ง
2. **ไม่มี merge จริง** — toggle เป็น either/or ไม่ใช่รวม list ไม่มีปัญหา sort/paginate/dedupe ข้าม source ที่จะเป็นเหตุผลให้ย้ายไป backend
3. **Regression risk ต่ำสุด, ทำจบใน sprint เดียว** — ไม่แตะ controller/service/DTO/notifications เลย งานทั้งหมดอยู่ฝั่ง web (route + component + nav + i18n) endpoint เดิมยังถูก contract test/type ครอบเหมือนเดิม

---

## Consequences

### บวก
- ไม่มีการเปลี่ยนแปลง backend → API contract, Prisma query, `MAX_FEED=200` cap เดิมยังใช้ได้, ไม่ต้อง migration/redeploy api
- ลบโค้ดซ้ำที่ระดับหน้าจอได้ (2 page component → 1) ตามเป้า sprint โดยไม่เพิ่ม surface ฝั่ง server
- Type `MyUpdateItem` / `ProjectChangeItem` และ hook `useMyUpdates` / `useProjectChanges` ใน `lib/updates.ts` **ยังใช้ต่อ** ไม่ต้องลบ

### ลบ / ข้อควรระวัง
- Component เดียวต้องจัดการ **สอง response shape** (discriminated union) — แก้ด้วยการ normalize เป็น view type เดียวในหน้า (ดู guidance)
- ต้องระวัง **ยิงซ้ำสอง endpoint** ถ้าเรียกทั้งสอง hook พร้อมกัน (rules of hooks บังคับให้ประกาศทั้งคู่) → ต้อง gate ด้วย `enabled`
- ถ้าอนาคตต้องการ "รวม feed ของฉัน + ของทีมเป็น timeline เดียว sort ปนกัน" ค่อย revisit ไปเป็น endpoint เดียว — ตอนนี้ยังไม่ใช่ requirement

### เมื่อไรควรกลับมาทบทวน (revisit triggers)
- Requirement เปลี่ยนเป็น feed รวม (ของฉัน + ทุกคน) ใน list เดียวที่ sort ปนเวลากัน
- ต้องทำ cursor pagination ข้ามทั้งสองมุมมองพร้อมกัน
- มี consumer อื่นนอกจากหน้า Activity (เช่น mobile app) ที่อยากได้ shape รวม

---

## Guidance สำหรับ senior-fullstack-dev (Implementation)

**ขอบเขต: แก้เฉพาะ `apps/web/**` — ไม่แตะ `apps/api/**`**

### 1. Route + Nav
- เพิ่ม route `/activity` → component ใหม่ `apps/web/src/pages/Activity.tsx` (รวมจาก `MyUpdates.tsx` + `ProjectChanges.tsx`)
- `apps/web/src/App.tsx:34-35` — เปลี่ยน `/my-updates` และ `/project-changes` เป็น **redirect** ไป `/activity` ด้วย `<Navigate to="/activity" replace />` (กัน bookmark/deep-link เก่าพัง — ตาม Open question ใน Design ให้ทำ redirect ไม่ปล่อย 404)
- `apps/web/src/components/AppShell.tsx:97-98` — ยุบ nav item `myUpdates` + `projectChanges` เหลือ **item เดียว** `{ key: 'activity', to: '/activity', icon: Icon.clock, active: startsWith('/activity') }`

### 2. หน้า Activity — state + data fetching (จุดสำคัญสุด)
- เพิ่ม state `scope: 'all' | 'mine'` (default ตาม Design — แนะนำ `'all'`) เป็น `Segmented` ตัวที่สองต่อจาก range filter เดิม
- เรียกทั้งสอง hook แต่ **gate ด้วย `enabled` เพื่อไม่ยิงซ้ำ:**
  ```ts
  const mine = useMyUpdates(range, projectId)          // เพิ่ม enabled: scope==='mine' ใน hook หรือ options
  const all  = useProjectChanges(range, projectId, null) // enabled: scope==='all'
  const active = scope === 'mine' ? mine : all
  ```
  > `useMyUpdates`/`useProjectChanges` ปัจจุบันยังไม่รับ `enabled` — เพิ่ม param `enabled = true` ส่งต่อเข้า `useQuery` (แก้ที่ `lib/updates.ts`, ไม่ใช่ backend) เพื่อไม่ให้โหมดที่ไม่ได้เลือกยิง request ทิ้ง
- **Normalize เป็น view type เดียว** ในหน้า เพื่อไม่ต้องเขียน JSX สองชุด เช่น
  ```ts
  type ActivityRow = { id; projectId; projectName; fileId; fileName; label; createdAt;
    author?: string;                 // มาจากโหมด all (ProjectChangeItem.authorName)
    scope?: 'owner' | 'member' }     // มาจากโหมด mine (MyUpdateItem.scope)
  ```
  render: ถ้ามี `author` → Avatar + "BY: ..." (โหมด all); ถ้ามี `scope` → `Tag` (โหมด mine) — ตรงตาม Design 3.2

### 3. i18n (`apps/web/src/locales/th.json` / `en.json`)
- เพิ่ม key ใหม่: `updates.activityTitle` ("กิจกรรม"), scope toggle (`updates.scopeAll`="ทั้งหมด", `updates.scopeMine`="เฉพาะของฉัน")
- Empty state สองแบบตาม Design 3.2 (all vs mine) — เพิ่ม `updates.activityEmptyAllTitle/Body`, `updates.activityEmptyMineTitle/Body`
- Key เดิม (`updates.range*`, `updates.by`, `updates.scopeOwner/Member`, `updates.loadError`, `updates.allProjects`) ใช้ต่อได้

### 4. สิ่งที่ห้ามแตะ / ระวัง regression
- **`RevisionDiffDrawer` + `DiffTarget`** — ไม่ต้องแก้ ทั้งสองหน้าเดิมสร้าง `DiffTarget` shape เดียวกันอยู่แล้ว (ต่างแค่ `subtitle` string) ยกมาใช้ได้ตรง ๆ
- **`lib/updates.ts` types + hooks** — คงไว้ (แค่เพิ่ม `enabled` param) **อย่าลบ** `useMyUpdates`/`useProjectChanges` เพราะยังใช้ทั้งคู่
- **Backend `/me/updates`, `/me/project-changes`** — ไม่แตะ; ไม่มี consumer อื่นตาม grep (มีแค่ 2 หน้านี้) แต่คงไว้เพื่อ redirect-safety และลด blast radius
- **NotificationBell / notifications service** — ไม่เกี่ยวกับ endpoint นี้ (grep แล้ว notifications ใช้ `notifyRevision` opt-in flag คนละเรื่อง) การรวมนี้ไม่กระทบ; ส่วนปุ่ม footer "ดูกิจกรรมทั้งหมด" → `/activity` เป็นงาน nice-to-have แยก (Design ข้อ 9)
- **Accessibility:** Design หมวด 6 ขอให้ row ที่คลิกได้เป็น real interactive element (`<button>` / stretched `<Link>`) ไม่ใช่ `Card onClick` บน `<div>` แบบเดิม — แก้ตอน refactor นี้เลย

---

### 🤝 HANDOFF

**จาก:** fullstack-architect-mentor (Tech Lead) — ตัดสิน Open question ข้อ 6 ของ Design Spec
**ถึง:** `senior-fullstack-dev` (implement หน้า Activity ตาม guidance ด้านบน)

**คำตัดสิน:** (ก) รวมแค่ UI — ไม่รวม backend endpoint

**ไฟล์ผลงาน:** `docs/decisions/0002-activity-consolidation.md` (ไฟล์นี้)

**สิ่งที่ dev ต้องอ่านก่อนเริ่ม:**
1. ADR นี้ ส่วน Guidance (route/nav, data fetching + `enabled` gating, normalize view type, i18n)
2. `design/DESIGN_SPEC.md` หมวด 3.2 (สเปกหน้า Activity ละเอียด: filter bar, row rendering ต่อโหมด, states, responsive)

**สถานะ:** พร้อม implement — ขอบเขตแก้เฉพาะ `apps/web/**`, ไม่แตะ `apps/api/**`
