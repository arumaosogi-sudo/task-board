# Task Board — Design Spec (Sprint 3: Premium Polish + IA Consolidation)

**Author:** ux-ui-design-architect · **สถานะ:** เสนอเพื่อรีวิว (ยังไม่แตะโค้ด)
**อ่านคู่กับ:** `apps/web/src/index.css` (tokens), `apps/web/tailwind.config.js`, `apps/web/src/components/ui.tsx` (UI kit), `apps/web/src/lib/cn.ts` (THEMES), `apps/web/src/locales/th.json` / `en.json`

**ขอบเขต:** ออกแบบ/เสนอเท่านั้น ทุก snippet ในไฟล์นี้เป็น "โค้ดตัวอย่างเพื่อสื่อสารเจตนา" ให้ dev นำไป implement จริงในรอบถัดไป — ไม่ใช่การแก้ `apps/web/**`

---

## 0. สรุปผู้บริหาร (สำหรับ PM/Owner)

| หัวข้อ | สรุป |
|---|---|
| ปัญหาหลักที่พบ | (1) ไม่มี type-scale token → ใช้ arbitrary px กระจาย 99+ จุด (2) หน้า "สิ่งที่ฉันแก้" กับ "ความเปลี่ยนแปลง" ซ้ำกันเกือบ 100% ทั้ง layout/state/component (3) 4 ใน 10 หน้าหลุดออกจาก AppShell sidebar ทำให้ nav หาย |
| ข้อเสนอ IA หลัก | รวม **My Updates + Project Changes → หน้าเดียว "Activity" (กิจกรรม)** พร้อมตัวกรอง "ทั้งหมด / เฉพาะของฉัน" ในหน้าเดียว (nav item ลดจาก 6 → 5) |
| Quick win ที่ impact สูง effort ต่ำ | เพิ่ม type-scale tokens, ย้าย Settings/Trash เข้า AppShell, แก้ back-link ของ ProjectSettings ให้กลับไปที่ project ไม่ใช่ Home, เปลี่ยน icon "back" ที่ใช้ logo-หมุน-180° ให้เป็น arrowLeft ทุกที่ |
| ทำได้บน stack เดิมทั้งหมด | ใช้ Tailwind v3 + CSS var tokens เดิม 100% ไม่มีการเพิ่ม dependency/ระบบธีมใหม่ |

---

## 1. Audit สถานะปัจจุบัน

### 1.1 Typography — ไม่มี type scale, มีแต่ arbitrary values

`tailwind.config.js` (บรรทัด 32-37) กำหนด `fontFamily` ไว้ครบ (heading/body/mono/thai) แต่ **ไม่มี `fontSize` scale เลย**। ผลคือทุกหน้าต้อง hardcode arbitrary px เอง — grep ทั้ง `pages/` + `components/` เจอ:

```
34× text-[12px]   24× text-[13px]   15× text-[11px]   12× text-[15px]
 5× text-[22px]    4× text-[13.5px]  3× text-[10px]    1× text-[17px] 1× text-[12.5px]
```

รวม **9 ค่าที่ต่างกัน กระจายอยู่ 99+ จุด** — ไม่มีชื่อ token ต่อความหมาย (เช่น "label", "caption", "body-sm") ผลลัพธ์ที่เห็นจริง:
- `Home.tsx:96` ใช้ `text-[12px]` สำหรับ owner label, แต่ `MyUpdates.tsx:108` ใช้ `text-[12px]` สำหรับ timestamp, แต่ `ProjectChanges.tsx:106` ใช้ `text-[12px]` สำหรับ "BY:" — สามระดับความสำคัญต่างกัน ใช้ขนาดเดียวกันโดยบังเอิญ ไม่ใช่โดย system
- Heading ของหน้าเดียวกันก็ไม่นิ่ง: `Home.tsx:228` ใช้ `text-2xl` (24px, Tailwind scale) แต่ `Settings.tsx:117` / `ProjectSettings.tsx:95` ใช้ `text-[15px]` เป็น "page title" — page title เล็กกว่า H2 การ์ดปกติ (`text-base` = 16px ใน `Card` headers) ลำดับชั้นสายตากลับหัว

**ผลกระทบต่อ "พรีเมียม":** พรีเมียมต้องการ hierarchy ที่สม่ำเสมอและตั้งใจ การไม่มี scale ทำให้ทุกจุดที่ dev คนใหม่แตะ มีโอกาสเลือกขนาดใหม่อีกค่า → drift สะสมไปเรื่อยๆ

### 1.2 Information Architecture — ซ้ำซ้อนของฟีเจอร์ (ประเด็นหลักของ sprint นี้)

อ่านโค้ดจริงของทั้งคู่ (`apps/web/src/pages/MyUpdates.tsx` และ `ProjectChanges.tsx`) พบว่าเหมือนกัน **บรรทัดต่อบรรทัด**:

| ส่วนประกอบ | MyUpdates.tsx | ProjectChanges.tsx |
|---|---|---|
| Layout shell | `AppShell` + `max-w-4xl` | เหมือนกันทุกตัวอักษร |
| Range filter | `Segmented` 7d/30d/all | เหมือนกัน |
| Project filter | `Menu` + `MenuItem` list ของ projects | เหมือนกัน |
| Row component | `Card` คลิกได้ → `openDiff()` | เหมือนกัน |
| Diff drawer | `RevisionDiffDrawer` (ตัวเดียวกัน — comment บอกตรงๆ ว่า "Shared by the My Edits and Changes feeds") | เหมือนกัน |
| Loading/Error/Empty state | `Skeleton` × 3 / `Banner` / `EmptyState` | เหมือนกัน |
| **ต่างกันแค่** | ไม่มี Avatar, มี `Tag` (owner/member scope) | มี `Avatar` + บรรทัด "BY: ชื่อ" ไม่มี Tag |

สองหน้านี้คือ **"revision feed" ตัวเดียวกัน กรองคนละมุม** (ของฉัน vs ทุกคน) ที่ถูกแยกเป็นสอง route/สอง nav item/สอง component โดยไม่จำเป็น ชื่อเมนูภาษาไทยก็กำกวมสำหรับ user ใหม่: **"สิ่งที่ฉันแก้"** vs **"ความเปลี่ยนแปลง"** ฟังดูเหมือนสองระบบคนละเรื่อง ทั้งที่จริงคือ filter เดียวกัน — นี่คือเป้าหมายหลักของ IA consolidation รอบนี้ รายละเอียดข้อเสนอในหมวด 3

**ของที่ "ดูซ้ำ" แต่จริงๆ ไม่ควรรวม (ตรวจแล้ว ไม่ใช่ duplicate):**
- **NotificationBell** (`components/NotificationBell.tsx`) vs Activity feed — bell เป็น *inbox แบบ real-time/unread-driven* (ProjectInvite, Mention, Revision) ส่วน Activity เป็น *audit log แบบ browse ย้อนหลัง* คนละ mental model (Gmail inbox vs GitHub commit history) — **ไม่ควรรวมเป็นหน้าเดียว** แต่ควร cross-link กัน (ตอนนี้ bell dropdown ไม่มี footer link ไปดู full history เลย — เป็น gap เล็กๆ ที่ควรเติม)
- **HistoryModal** (ใน `WorkPage.tsx`, per-file version history + restore) vs Activity feed's `RevisionDiffDrawer` — ทั้งคู่ diff revision เหมือนกัน แต่ HistoryModal ต้องอยู่ "ในบริบทของ editor ที่เปิดอยู่" เพราะ restore ต้องเขียนกลับเข้า live editor ให้ sync ผ่าน CRDT (ตาม comment ใน `HistoryModal.tsx:1-5`) — **แยกไว้ถูกแล้ว** แต่ควรมี deep-link จาก Activity drawer กลับไปเปิด version history เต็มของไฟล์นั้น (ตอนนี้มีแค่ปุ่ม "เปิดไฟล์" ใน `RevisionDiffDrawer.tsx:79-83` ไม่มีปุ่ม "ดูประวัติทั้งหมด")
- **Settings** (บัญชีผู้ใช้) vs **ProjectSettings** (สมาชิก/role ของ project) — คนละ resource ที่จัดการ (user profile vs project membership) แยกถูกแล้ว ไม่ควรรวม

### 1.3 Navigation Shell ไม่สม่ำเสมอ — 6 ใน 10 หน้าหลุดจาก AppShell

| หน้า | ใช้ `AppShell` (sidebar+topbar)? | Layout จริง |
|---|---|---|
| Home | ✅ | `AppShell` |
| MyUpdates | ✅ | `AppShell` |
| ProjectChanges | ✅ | `AppShell` |
| **Settings** | ❌ | header เดี่ยว `h-16` + back-arrow เอง (`Settings.tsx:111-120`) |
| **Trash** | ❌ | header เดี่ยว `h-16` เอง (`Trash.tsx:24-33`) |
| **ProjectSettings** | ❌ | header เดี่ยว `h-16` เอง (`ProjectSettings.tsx:89-98`) |
| WorkPage | ❌ (ตั้งใจ — full-bleed editor) | header เดี่ยว `h-14` เอง |

พอผู้ใช้กด "ตั้งค่า" หรือ "ถังขยะ" — **sidebar, search (⌘K), notification bell, theme switcher หายไปทั้งหมด** ต้องกด back-arrow กลับ Home ก่อนถึงจะสลับไปหน้าอื่นได้ ทำลาย flow ที่ AppShell ตั้งใจสร้างไว้ (persistent nav) นี่คือจุดที่ "รู้สึกไม่พรีเมียม" ชัดที่สุดจุดหนึ่ง เพราะแอประดับพรีเมียม (Linear, Notion, Vercel) ไม่มีหน้าไหนที่ nav หายไปเฉยๆ

**Bug เชิง UX ที่เจอระหว่าง audit:** `ProjectSettings.tsx:91` ปุ่ม back ลิงก์ไปที่ `/home` เสมอ — ทั้งที่ user เข้ามาจาก project settings ของ project X ควรกลับไปที่ `/projects/X/work` ไม่ใช่หลุดไป Home ทั้งบริบท (เทียบกับ `WorkPage.tsx:310` ที่มีปุ่ม gear ไป ProjectSettings ถูกทาง แต่ทางกลับไม่ reciprocate)

**ปัญหาเล็กแต่ non-trivial:** ปุ่ม "back" ใน `WorkPage.tsx:305`, `ProjectSettings.tsx:92`, `Trash.tsx:27` ใช้ `<Icon.logout width={18} height={18} className="rotate-180" />` (เอา icon logout มาหมุน 180° แทน arrow) — ในขณะที่ `Settings.tsx:114` และ `RevisionDiffDrawer.tsx:73` ใช้ `Icon.arrowLeft` ถูกความหมายจริงๆ อยู่แล้ว สองแบบปนกันในโค้ดเบสเดียว เป็นรายละเอียดที่ทรยศความรู้สึก "craft" ของแอป

### 1.4 Elevation & Card hierarchy — แบนราบเกินไป

`Card` component (`ui.tsx:121-127`) ใส่ `shadow-card` ให้ทุกจุดที่เรียกใช้เท่ากันหมด ไม่แยก "การ์ดคงที่ที่ไว้จัดกลุ่มเนื้อหา" (เช่น settings section) กับ "การ์ดที่คลิก/hover ได้" (เช่น project card, activity row) — ผลคือ:
- `Home.tsx` ProjectCard (บรรทัด 32) ทำ hover ได้ดีอยู่แล้ว: `hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop` — เป็นตัวอย่างที่ดีที่สุดในโค้ดเบส
- `MyUpdates.tsx:95` / `ProjectChanges.tsx:97` การ์ดคลิกได้เหมือนกันแต่ได้แค่ `hover:shadow-pop` ไม่มี lift/border change — ความรู้สึก interactive อ่อนกว่า
- `Settings.tsx` / `ProjectSettings.tsx` section cards เป็นแค่ container (ไม่คลิก) แต่ได้ shadow เท่า card ที่คลิกได้ — ไม่มีการแยกระดับ elevation ตาม intent

### 1.5 Loading state ไม่สม่ำเสมอ

Home/MyUpdates/ProjectChanges ใช้ `Skeleton` (สวย, มี shimmer) — แต่ `ProjectSettings.tsx:52` ใช้ full-page spinner เดี่ยวๆ, `Trash.tsx:39` ใช้ข้อความ "กำลังโหลด..." เฉยๆ ไม่มี skeleton เลย มาตรฐานไม่นิ่งระหว่างหน้า

### 1.6 จุดที่ทำดีอยู่แล้ว (เก็บไว้ อย่าไปแตะ)

- **Token system** (`index.css`, `cn.ts`): 12 ธีมสมบูรณ์ RGB-channel vars รองรับ opacity modifier — โครงสร้างดีมาก ใช้ต่อได้เลย ไม่ต้องแก้
- **Radius scale**: `rounded-lg=14px / xl=18px / 2xl=22px` — soft-premium อยู่แล้ว เป็นจุดแข็ง ให้คงไว้
- **EmptyState component**: icon ใน badge สี primary-soft + title + body + action — pattern ดีอยู่แล้ว ใช้ต่อ ไม่ต้องออกแบบใหม่
- **Shadow scale** (`soft/pop/card/fab`): มีครบ แค่ต้อง "ใช้อย่างมีเจตนา" ตาม hierarchy (ดูข้อ 1.4) ไม่ต้องเพิ่ม token ใหม่
- **A4 page + diff view** (`tb-page`, `DiffView`): ให้ความรู้สึก "GitHub diff + Google Docs" ตรงตาม concept ของโปรดักต์อยู่แล้ว เป็นจุดขายเชิง visual ที่ชัดเจนที่สุดของแอป

---

## 2. ทิศทางพรีเมียม (บนโทเคนเดิม — ไม่สร้างระบบใหม่)

### 2.1 Type scale — เพิ่มใน `tailwind.config.js` → `theme.extend.fontSize`

เสนอ scale ที่ map ไปยัง arbitrary values ที่มีอยู่แล้ว (เพื่อ migrate ได้แบบ find-replace ไม่ shock layout):

```js
fontSize: {
  display: ['28px', { lineHeight: '1.2', fontWeight: '700' }],  // แทน text-2xl ใน page title สำคัญ
  h2:      ['20px', { lineHeight: '1.3', fontWeight: '600' }],  // แทน text-base ของ Card section header
  h3:      ['17px', { lineHeight: '1.4', fontWeight: '600' }],  // แทน text-[17px]/text-[15px] ที่ใช้เป็น sub-heading
  body:    ['14px', { lineHeight: '1.6' }],                     // ค่า default ของ body อยู่แล้ว (index.css:82) — ตั้งชื่อให้ explicit
  'body-sm': ['13px', { lineHeight: '1.55' }],                  // แทน text-[13px]/text-[13.5px]
  caption: ['12px', { lineHeight: '1.4' }],                     // แทน text-[12px]/text-[12.5px]
  label:   ['11px', { lineHeight: '1.3', letterSpacing: '0.02em', fontWeight: '600' }], // แทน text-[11px] uppercase labels
}
```

**เหตุผลเชิง usability:** ให้ dev เลือกจาก "ชื่อที่มีความหมาย" (`text-h2`, `text-caption`) แทนเลข px ลอยๆ — ลด drift ในอนาคต และทำให้ audit ครั้งถัดไปเร็วขึ้นมาก (grep ชื่อ token แทนเลข)

### 2.2 Elevation intent — แยก `Card` เป็น 2 โหมดผ่าน prop เดียว

```tsx
// ui.tsx — เพิ่ม prop `interactive` ให้ Card เดิม (ไม่ breaking, default = false)
export function Card({ interactive, className, children, ...rest }: {
  interactive?: boolean; className?: string; children: ReactNode
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(
      'bg-card rounded-xl border border-line',
      interactive
        ? 'shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop cursor-pointer'
        : 'shadow-soft', // static content container — เบากว่า shadow-card เดิม
      className,
    )} {...rest}>
      {children}
    </div>
  )
}
```
นำไปใช้: Home ProjectCard / Activity rows / Trash rows → `interactive` ; Settings/ProjectSettings section cards → ไม่ใส่ (ใช้ `shadow-soft` แทน `shadow-card` ปัจจุบัน — เบาลง สื่อว่า "ไม่คลิกได้" ทันทีที่มองเห็น)

### 2.3 Micro-interaction ให้สม่ำเสมอ

ทุก element ที่คลิกได้และนำไปสู่การกระทำสำคัญ (การ์ดคลิกได้, ปุ่ม primary, แถว list ที่ navigate) ควรมี transition เดียวกัน: `transition-all duration-200` + เลือกจากชุด `hover:-translate-y-0.5` (การ์ด) หรือ `active:scale-[0.99]` (ปุ่ม — มีอยู่แล้วใน `Button`) — ประกาศเป็นแนวทาง ไม่ต้องสร้าง utility class ใหม่ เพียงพอที่จะ apply pattern เดิมที่ Home ProjectCard ทำไว้แล้วให้ทั่วถึง

### 2.4 Loading state — บังคับใช้ `Skeleton` ทุกหน้า

`ProjectSettings` และ `Trash` เปลี่ยนจาก spinner/ข้อความ เป็น `Skeleton` ที่ mimic โครงจริงของเนื้อหา (เหมือนที่ `Home.tsx:239-250` ทำกับ card skeleton) — รายละเอียดใน component spec หมวด 4

### 2.5 Motion สำหรับ state change (Activity filter toggle ใหม่)

ตอนสลับ "ทั้งหมด / เฉพาะของฉัน" ในหน้า Activity ที่รวมใหม่ ให้ list re-render ด้วย `animate-fade` (มี token อยู่แล้ว `fade 0.2s ease-out both`) กัน layout jump รู้สึกกระชาก — ไม่ต้องเพิ่ม library animation

---

## 3. IA Consolidation — ข้อเสนอหลักของ Sprint นี้

### 3.1 ตาราง Before → After

| # | ปัจจุบัน (sidebar item) | เสนอ | เหตุผล UX |
|---|---|---|---|
| 1 | Project ทั้งหมด (`/home`) | **คงเดิม** | ทำงานถูกแล้ว |
| 2 | Project ของฉัน (`/home?filter=mine`) | **คงเดิม** | Pattern "หน้าเดียว + query filter" นี้ดีอยู่แล้ว — ใช้เป็นต้นแบบให้ข้อ 3 ด้านล่าง |
| 3 | สิ่งที่ฉันแก้ (`/my-updates`) + ความเปลี่ยนแปลง (`/project-changes`) — **2 nav items, 2 routes, 2 components เกือบซ้ำ 100%** | **รวมเป็น 1 nav item "กิจกรรม" (Activity) → `/activity`** พร้อม in-page toggle **"ทั้งหมด" / "เฉพาะของฉัน"** (Segmented ตัวที่ 2 ต่อจาก range filter เดิม) | ทั้งสองหน้าคือ revision feed ตัวเดียวกันกรองคนละมุม (ดูหมวด 1.2) รวมแล้ว user ไม่ต้องเดาความต่างระหว่างชื่อเมนูที่กำกวม, ลด nav item, ลด maintenance surface (1 component แทน 2) |
| 4 | ถังขยะ (`/trash`) — หลุดจาก AppShell | **คงตำแหน่งใน nav เดิม แต่ห่อด้วย `AppShell`** | เป็นหน้า workspace-level (ไม่ผูก project เดียว) ควรมี sidebar/search ตลอดเวลาเหมือน Home |
| 5 | ตั้งค่า (`/settings`) — หลุดจาก AppShell | **คงตำแหน่งใน nav เดิม แต่ห่อด้วย `AppShell`** | เหตุผลเดียวกับ Trash — เป็นหน้า account-level ไม่ใช่ focused flow ที่ต้องเต็มจอ |
| — | NotificationBell (topbar, ไม่ใช่ nav item) | **คงเป็น topbar component** + เพิ่มปุ่ม footer "ดูกิจกรรมทั้งหมด" ลิงก์ไป `/activity` | เชื่อม inbox (real-time) เข้ากับ history browser (persistent) โดยไม่รวมเป็นหน้าเดียว — คนละ mental model ตามหมวด 1.2 |
| — | ProjectSettings (`/projects/:id/settings`, ไม่ใช่ sidebar item — เข้าถึงผ่าน project card menu / gear icon ใน WorkPage) | **คงเป็น project-scoped page นอก sidebar** แต่ **แก้ back-link ให้กลับไป `/projects/:id/work` แทน `/home`** | เป็น settings ของ "โปรเจกต์ที่กำลังเปิดอยู่" ไม่ใช่ workspace-level — ไม่ควรอยู่ใน sidebar หลัก (จะสับสนกับ "ตั้งค่า" บัญชี) แต่ back ต้องกลับไปบริบทเดิม ไม่ใช่หลุดไป Home |

**ผลลัพธ์:** Sidebar จาก 6 รายการ → **5 รายการ** (Project ทั้งหมด / Project ของฉัน / กิจกรรม / ถังขยะ / ตั้งค่า) และทุกหน้าใน sidebar อยู่ใน AppShell ครบ 100% (จากเดิม 3/6)

### 3.2 หน้า "กิจกรรม" (Activity) ที่รวมแล้ว — สเปกโดยละเอียด

**Route:** `/activity` (แนะนำเก็บ `/my-updates` และ `/project-changes` เป็น redirect ไป `/activity` เพื่อไม่ให้ deep-link เก่า/bookmark พัง — รายละเอียด technical ให้ dev ตัดสินใจ)

**Filter bar (บนสุด, แทนที่ range+project filter เดิมที่ยังคงอยู่):**
```
[ กิจกรรม ]  ← heading, ไม่เปลี่ยนตามตัวกรอง (ต่างจากเดิมที่ MyUpdates/ProjectChanges มี heading คนละคำ)
[ ทั้งหมด | เฉพาะของฉัน ]  ← Segmented ใหม่ (เทียบเท่า pattern query-param ?scope=mine เหมือน Home)
[ 7 วัน | 30 วัน | ทั้งหมด ]  ← Segmented เดิม (range) คงไว้
[ 📁 ทุก project ▾ ]  ← Menu filter เดิม คงไว้
```

**Row rendering — รวมความสามารถของทั้งสองหน้าเดิมเข้าด้วยกัน (ไม่ใช่เลือกอย่างใดอย่างหนึ่ง):**
- แสดง **Avatar ผู้แก้ไข** เสมอ (จาก ProjectChanges) — สำคัญเมื่อโหมด "ทั้งหมด" เพราะเห็นว่าใครทำ
- เมื่อโหมด "เฉพาะของฉัน" — Avatar ของตัวเองซ้ำทุกแถวไม่มีประโยชน์ → **สลับเป็น `Tag` scope (owner/member)** แทน (จาก MyUpdates เดิม) โดยอัตโนมัติตามโหมดที่เลือก
- บรรทัด "BY: ชื่อ" (จาก ProjectChanges) แสดงเฉพาะโหมด "ทั้งหมด" เท่านั้น (ในโหมด "เฉพาะของฉัน" มันคือตัวเองเสมอ ซ้ำซ้อน)
- คลิกแถว → เปิด `RevisionDiffDrawer` เดิม (ไม่เปลี่ยน) — **เพิ่มปุ่ม "ดูประวัติทั้งหมดของไฟล์นี้"** ข้าง "เปิดไฟล์" ที่มีอยู่แล้ว ลิงก์ไป `/projects/:id/work?file=:fileId&history=1` (เปิด HistoryModal อัตโนมัติ — ปิดช่องว่างที่ระบุในหมวด 1.2)

**States:**
- Empty (โหมดทั้งหมด, ไม่มี revision เลย): ใช้ `EmptyState` icon `Icon.edit`, title "ยังไม่มีความเคลื่อนไหว", body แนะนำให้เริ่มแก้ไขเอกสาร
- Empty (โหมดเฉพาะของฉัน): title "คุณยังไม่มีการแก้ไข", body ชี้ไปที่ "ลองสลับไปดู 'ทั้งหมด' เพื่อดูความเคลื่อนไหวของทีม" — เชื่อมโยงกลับไปโหมดอื่นแทนที่จะจบตัน
- Loading: `Skeleton` 3 แถว (เหมือนเดิม)
- Error: `Banner tone="error"` (เหมือนเดิม)

**Responsive:**
- Desktop/Tablet (≥768px): filter bar เรียงแนวนอนแถวเดียว (เหมือนปัจจุบัน)
- Mobile (<640px): filter bar wrap เป็น 2 บรรทัด — แถวบน `ทั้งหมด/เฉพาะของฉัน` เต็มความกว้าง, แถวล่าง range + project filter เรียงติดกัน (ใช้ `flex-wrap` ที่มีอยู่แล้วใน container เดิม `mb-4 flex flex-wrap items-center gap-2`)

---

## 4. Component/Screen Spec

### 4.1 Home (`/home`)

**สถานะปัจจุบันดีอยู่แล้วในระดับ layout** — ข้อเสนอเป็นการ "เก็บราย ละเอียด" เท่านั้น:

| ส่วน | Layout | State ที่ต้องมี |
|---|---|---|
| Header | `flex items-center justify-between`: heading (`text-display` ใหม่ แทน `text-2xl`) + subtitle (`text-body-sm text-muted`) ทางซ้าย, ปุ่ม "Project ใหม่" ทางขวา | — |
| Grid การ์ด | `grid gap-4 sm:grid-cols-2 xl:grid-cols-3` (คงเดิม) | Loading = 3× skeleton card; Error = Banner; Empty = EmptyState; Success = card grid |
| ProjectCard | คงโครงเดิม (หัวสี primary + เนื้อหา) — เปลี่ยนแค่ font token ภายใน (title `text-h3`, description `text-body-sm`, meta `text-caption`) | Hover = lift+shadow-pop (มีอยู่แล้ว, เก็บไว้) |
| FAB | คงเดิม (`fixed bottom-6 right-6`, `shadow-pop`, hover scale) — ดีอยู่แล้ว | — |

**Responsive:** Desktop ≥1280px = 3 คอลัมน์ (`xl:grid-cols-3`), Tablet 768–1279px = 2 คอลัมน์ (`sm:grid-cols-2` — ครอบคลุมตั้งแต่ 640px จริงๆ ควรพิจารณาขยับเป็น `md:grid-cols-2` เพื่อไม่ให้ 2 คอลัมน์บีบตัวที่ tablet แนวตั้งแคบ), Mobile <640px = 1 คอลัมน์

### 4.2 WorkPage (`/projects/:id/work`)

**คงเป็น full-bleed นอก AppShell โดยเจตนา** (ต้องการพื้นที่เต็มจอสำหรับ editor) — ข้อเสนอ 3 อย่าง:

1. **แก้ icon back** จาก `Icon.logout` หมุน 180° → `Icon.arrowLeft` (ความหมายถูกต้อง, สอดคล้องกับ Settings.tsx)
2. **Mobile breakpoint ที่ขาดหายไป:** ปัจจุบัน file-tree `aside` เป็น `w-64 shrink-0` ตายตัวไม่มี responsive fallback — บนจอ <768px สาม-พาเนล (tree + editor) จะบีบจนใช้งานไม่ได้จริง เสนอ: ที่ <768px ให้ file tree ยุบเป็น **bottom-sheet/overlay drawer** ที่เปิดผ่านปุ่ม hamburger ในหัว (`h-14` header เพิ่มปุ่ม `Icon.menu` ทางซ้ายของชื่อไฟล์ คล้าย pattern ที่ AppShell mobile drawer ใช้อยู่แล้วกับ sidebar) — เมื่อเลือกไฟล์แล้ว sheet ปิดอัตโนมัติ editor เต็มจอ
3. **Header height consistency:** `h-14` ของ WorkPage vs `h-16` ของหน้าอื่น — เพราะ WorkPage ต้องประหยัดพื้นที่แนวตั้งให้ editor เจตนานี้สมเหตุสมผล **ให้คง h-14 ไว้** (ไม่ต้อง force เท่ากับหน้าอื่น) — บันทึกไว้ในนี้เพื่อไม่ให้ dev รอบหน้าเข้าใจผิดว่าเป็นบั๊กแล้วไป "แก้" จนพัง

**States (มีครบอยู่แล้วในโค้ด เป็นจุดแข็ง — ระบุไว้เพื่อ dev คนถัดไปไม่ลบทิ้งระหว่าง refactor):** empty (ยังไม่เลือกไฟล์), loading (tree skeleton text), saving/saved/error (status text ข้าง filename), connecting/offline (presence indicator), editor crash (`EditorErrorBoundary` — ห้ามเอาออก เป็น safety net สำคัญ)

### 4.3 Settings (`/settings`) — ย้ายเข้า AppShell

**Layout ใหม่:**
```tsx
<AppShell>
  <div className="mx-auto max-w-3xl">
    <h1 className="text-display">{t('settings.title')}</h1>
    <p className="text-body-sm text-muted">{t('settings.subtitle')}</p>
    {/* Card sections เดิมทั้งหมดคงไว้ 100% — Account / Appearance / Language / Notifications / Danger */}
  </div>
</AppShell>
```
- **ลบ** header เดี่ยว + back-arrow เดิม (ไม่จำเป็นแล้ว เพราะ AppShell sidebar มีทางกลับ Home อยู่แล้วผ่าน nav "Project ทั้งหมด" + breadcrumb ไม่ต้องมี — ถ้าต้องการ "back" ให้ใช้ browser back หรือ sidebar)
- Section cards ทั้งหมดเปลี่ยนจาก `shadow-card` (default ปัจจุบัน) → static intent ตามหมวด 2.2 (`shadow-soft`, ไม่ใช่ `interactive`)
- Danger zone card **คงต้องเด่น** — border-danger/30 (มีอยู่แล้ว) เพียงพอ ไม่ต้องเพิ่มอะไร

**States:** ไม่มี loading state จริงจัง (ฟอร์ม seed จาก `user` ที่ AppShell โหลดมาก่อนแล้ว) — banner success/error 3.5s (คงเดิม, ทำงานดีอยู่แล้ว)

**Responsive:** `max-w-3xl` เหมือนเดิม, บน mobile ฟอร์ม 2-คอลัมน์ (password fields) ยุบเป็น 1 คอลัมน์ (`sm:grid-cols-2` มีอยู่แล้ว ใช้ต่อได้)

### 4.4 Trash และ ProjectSettings — สรุปสั้น (pattern เดียวกับ Settings)

- **Trash:** ย้ายเข้า `AppShell`, เปลี่ยน loading text → `Skeleton` row (mimic โครง `Card` ที่มี icon+text+ปุ่ม 2 ปุ่ม), เปลี่ยน icon back-arrow (ไม่มีปัญหานี้อยู่แล้วเพราะเป็น `Icon.logout` หมุนก็ต้องแก้เหมือนกัน — ดูหมวด 1.3), **แต่ไม่ต้องมี back-arrow อีกต่อไป** เพราะ AppShell sidebar ทำหน้าที่แทน
- **ProjectSettings:** **คงนอก AppShell** (เป็น project-scoped, ไม่ใช่ workspace-level — ใส่เข้า AppShell จะทำให้ user สับสนว่ากำลังดู "Project settings ของใคร" เมื่อ sidebar โชว์ nav workspace-level ปนกัน) แต่ **ต้องแก้ back-link จาก `/home` → `/projects/:id/work`** (บั๊กที่พบในหมวด 1.3) และแก้ icon back → `Icon.arrowLeft`

---

## 5. แผน Implement (จัดลำดับ Impact / Effort)

| ลำดับ | งาน | Impact | Effort | เหตุผลจัดลำดับ |
|---|---|---|---|---|
| 1 | เพิ่ม `fontSize` scale ใน `tailwind.config.js` (หมวด 2.1) | สูง (ผลต่อทุกหน้าทันที) | ต่ำ (แก้ config 1 ไฟล์ + migrate ทีละหน้า) | รากฐานที่ทุกงานถัดไปควรอิงจาก token ใหม่ ทำก่อนสุดคุ้มสุด |
| 2 | แก้ icon back (`Icon.logout` หมุน → `Icon.arrowLeft`) 3 จุด | ต่ำ-กลาง (craft detail) | ต่ำมาก (3 บรรทัด) | Quick win ไม่มีความเสี่ยง ทำพร้อมข้อ 1 ได้เลย |
| 3 | แก้ `ProjectSettings` back-link `/home` → `/projects/:id/work` | กลาง (แก้บั๊ก UX จริง) | ต่ำมาก (1 บรรทัด) | บั๊กที่ทำให้ user หลุดบริบท ควรแก้เร็ว |
| 4 | ย้าย `Settings` + `Trash` เข้า `AppShell` | สูง (คืน nav ให้ 2 หน้าสำคัญ) | กลาง (ปรับ layout wrapper, ทดสอบ responsive) | impact สูงต่อความรู้สึก "พรีเมียม/สม่ำเสมอ" โดยรวม |
| 5 | เพิ่ม `interactive` prop ให้ `Card` + ทยอย apply ตามหมวด 2.2 | กลาง (elevation hierarchy ชัดขึ้น) | กลาง (ต้องไล่ทุกจุดที่เรียก `Card`) | ทำหลังข้อ 4 เพราะ Settings/Trash เพิ่งย้ายจะได้กำหนด intent ให้ถูกตั้งแต่แรก |
| 6 | **รวม MyUpdates + ProjectChanges → Activity page เดียว** (หมวด 3) | **สูงสุด** (เป้าหมายหลักของ sprint, ลด nav 6→5, ลบโค้ดซ้ำ) | สูง (route ใหม่, merge component, i18n keys ใหม่, redirect เก่า, ต้องคุยกับ backend ว่า endpoint รองรับ query แบบ scope=mine/all อยู่แล้วหรือไม่ — `useMyUpdates` / `useProjectChanges` ปัจจุบันเป็นคนละ hook คนละ endpoint) | ทำหลังสุดเพราะ effort สูงสุดและมีความเสี่ยง (route เปลี่ยน, ต้อง redirect, ต้องประสาน backend) — แต่คือเป้าหมายหลักที่ owner ขอ ต้องทำใน sprint นี้แน่นอน ไม่ใช่เลื่อน |
| 7 | Skeleton แทน spinner/ข้อความ ใน `ProjectSettings`/`Trash` | ต่ำ-กลาง | ต่ำ | polish สุดท้าย ทำพร้อม/หลังข้อ 4 ก็ได้ |
| 8 (nice-to-have, ไม่บังคับ sprint นี้) | Mobile responsive สำหรับ WorkPage file-tree (หมวด 4.2 ข้อ 2) | กลาง (มือถือใช้งานไม่ได้จริงตอนนี้) | สูง (ต้อง design overlay pattern + build) | แยก sprint ถ้า mobile ไม่ใช่ priority ตอนนี้ — flag ไว้ไม่ให้หลงลืม |
| 9 (nice-to-have) | เพิ่มปุ่ม "ดูกิจกรรมทั้งหมด" ใน NotificationBell footer + ปุ่ม "ดูประวัติทั้งหมด" ใน RevisionDiffDrawer | ต่ำ | ต่ำ | ทำพร้อมข้อ 6 ได้เลยเพราะแตะไฟล์เดียวกัน |

**ข้อควรรู้ก่อนส่งต่อ dev:** ข้อ 6 (Activity consolidation) น่าจะต้องให้ `fullstack-architect-mentor` ตัดสินใจร่วมว่าจะ merge ที่ระดับ backend endpoint ด้วยหรือไม่ (รวม `useMyUpdates`/`useProjectChanges` เป็น hook เดียวที่รับ `scope` param) หรือ frontend เรียกสอง hook เดิมแล้ว merge ผลที่ UI — เป็นการตัดสินใจสถาปัตยกรรม ไม่ใช่ design decision จึงไม่ฟันธงในสเปกนี้

---

## 6. Accessibility notes (สั้น — ไม่ใช่ full audit)

- Segmented ใหม่ ("ทั้งหมด/เฉพาะของฉัน") ต้องใช้ `role="tablist"`/`aria-selected` หรืออย่างน้อย `aria-pressed` แบบเดียวกับที่ `ColorSwatches` ทำไว้ใน `ThemeSwitcher.tsx:34` — มี pattern ต้นแบบในโค้ดเบสอยู่แล้ว
- Card ที่เปลี่ยนเป็น `interactive` (คลิกได้) ต้องยังคง keyboard-focusable — ปัจจุบัน `ProjectCard` ใช้ stretched-link (`after:absolute after:inset-0`) ผ่าน `Link` จริง ซึ่ง accessible อยู่แล้ว (`Home.tsx:38`) — Activity row ใหม่ที่รวมแล้วควรใช้ pattern เดียวกัน ไม่ใช่ `onClick` บน `<div>` เฉยๆ (ของเดิม MyUpdates/ProjectChanges ใช้ `Card onClick` บน div — **ควรแก้เป็น real interactive element** เช่น `<button className="text-left w-full">` ครอบ ระหว่างการ refactor ข้อ 6)
- Contrast: token ปัจจุบันผ่าน AA อยู่แล้วจากการตรวจ CSS var (ink บน paper, primary-fg บน primary ทุกธีม) — ไม่พบปัญหาใหม่จากการเปลี่ยนแปลงที่เสนอในสเปกนี้ (ไม่ได้เปลี่ยนสี เปลี่ยนแค่ typography/layout/elevation)

---

## 7. สิ่งที่ไม่แตะ (ยืนยันจากข้อจำกัด CLAUDE.md)

- ไม่แตะระบบธีม 12 ธีมใน `index.css`/`cn.ts` — ใช้ token เดิม 100%
- Domain terms (`Project`, `Owner`, `Editor`, `Viewer`, `Box`) คงเป็นอังกฤษทุกที่ตามเดิม
- ไม่อ้างอิงหรือดึงอะไรจาก 4 โฟลเดอร์ `-ไม่ได้เกี่ยวข้องกับตัวจริง` เป็นสเปก (ไม่ได้เปิดดูเลยในรอบนี้ตามคำสั่ง)
- ไม่มีการแก้ `apps/web/**` ในรอบนี้ — ไฟล์นี้คือข้อเสนอเพื่อรีวิวเท่านั้น

---

### 🤝 HANDOFF

**จาก:** ux-ui-design-architect (Sprint 3 — Design only, ยังไม่ implement)
**ถึง:** `fullstack-architect-mentor` (ตัดสินใจสถาปัตยกรรมของ Activity consolidation — โดยเฉพาะข้อ 6 ว่า merge backend endpoint ด้วยหรือไม่) → ต่อด้วย `senior-fullstack-dev`

**ไฟล์ผลงาน:** `design/DESIGN_SPEC.md` (ไฟล์นี้)

**สถานะ:** พร้อมให้ PM/Owner รีวิวก่อนส่งต่อ — ยังไม่มีการแก้โค้ดใดๆ ใน `apps/web/**`

**สิ่งที่ผู้รับงานต่อควรอ่านก่อนเริ่ม:**
1. หมวด 3 (IA Consolidation) — เป้าหมายหลักของ sprint
2. หมวด 5 (ลำดับ implement) — โดยเฉพาะข้อ 6 ที่ต้องตัดสินใจร่วมกับ architect ก่อนเริ่มเขียนโค้ด
3. หมวด 1.3 (บั๊ก ProjectSettings back-link) — ควรแก้พร้อมกันแม้เป็นงานเล็ก เพราะอยู่ไฟล์เดียวกับงานที่ต้องแตะอยู่แล้ว

**Open question ที่ owner ควรตัดสินใจก่อน implement:**
- ชื่อ route ใหม่ `/activity` และชื่อเมนู "กิจกรรม" — ยืนยันหรือมีชื่ออื่นที่ต้องการ (ทางเลือก: "ประวัติ" / "ความเคลื่อนไหว")
- จะเก็บ `/my-updates`, `/project-changes` เป็น redirect ตลอดไปหรือปล่อยให้ 404 (ผลต่อ bookmark/deep-link เดิมของ user จริงถ้ามีคนใช้งานแล้ว)
