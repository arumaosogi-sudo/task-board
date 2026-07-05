# UX Handoff — Task Board v2
**วันที่:** 2026-06-29 | **สำหรับ:** Senior Dev Agent | **สถานะ:** อนุมัติแล้ว พร้อม implement

---

## 0. Context โปรเจกต์

**Task Board** — เว็บแอปสร้างรายงาน + ทำงานร่วมกันแบบ real-time (GitHub diff + GoodNotes + Google Docs)
รองรับ 2 ภาษา **ไทย/อังกฤษ** | Roles: **Owner / Editor / Viewer**

**Phase 1 (เสร็จแล้ว ห้ามแตะ):**
- `apps/api` NestJS + Prisma/Postgres: auth ครบ + Project/Member CRUD + role guard
- `apps/web` React + TS + Tailwind + React Query: Login/Signup/Home/MyProjects ต่อ API จริง
- `packages/shared` zod + types

---

## 1. Design System v2 — Token Reference

### Themes
- `data-theme` = 6 สี: `violet | ocean | forest | sunset | rose | amber`
- `data-mode` = `light | dark` → 12 ธีมรวม

### CSS Custom Property → Tailwind Class Mapping

| CSS Variable | Tailwind Class | ใช้กับ |
|---|---|---|
| `--c-primary` | `bg-primary` / `text-primary` / `border-primary` | Accent color, active states, links |
| `--c-primary-fg` | `text-primary-fg` | Text บน primary background |
| `--c-primary-soft` | `bg-primary-soft` | Soft backgrounds, active section nav |
| `--c-primary-hover` | `hover:bg-primary-hover` | Button hover |
| `--c-ink` | `text-ink` / `bg-ink/5` / `bg-ink/40` | Body text / hover overlay / modal backdrop |
| `--c-nav` | `bg-nav` | Sidebar background |
| `--c-nav-fg` | `text-nav-fg` / `text-nav-fg/90` | Sidebar text (active / inactive) |
| `--c-paper` | `bg-paper` | Page background |
| `--c-card` | `bg-card` | Card / top bar / modal background |
| `--c-line` | `border-line` / `bg-line` | All borders / skeleton |
| `--c-muted` | `text-muted` | Secondary text, descriptions |
| `--c-subtle` | `text-subtle` | Placeholder / tertiary (ห้ามใช้กับ meaningful text) |
| `--c-danger` | `text-danger` / `bg-danger` / `border-danger` | Errors, danger actions |
| `--c-success` | `text-success` | Success states |
| `--c-add-fg` / `--c-add-bg` | `text-add-fg` / `bg-add-bg` | Diff + lines |
| `--c-del-fg` / `--c-del-bg` | `text-del-fg` / `bg-del-bg` | Diff − lines |

### Accent Colors (หลัง audit — ค่าที่แก้แล้ว)

| ธีม | Light Primary | Light Hover | Dark Primary | Dark Hover |
|---|---|---|---|---|
| violet | `#6d5bd0` | `#5d4cc0` | `#9684f5` | `#aa9afa` |
| ocean | `#2f7df0` | `#2569d4` | `#60a5fa` | `#82b9ff` |
| forest | `#1f9d57` | `#188048` | `#4ac88c` | `#68d7a2` |
| **sunset** | **`#c45120`** ✓ | **`#a8421c`** ✓ | `#f59266` | `#faa882` |
| rose | `#e0457b` | `#c8396b` | `#f07aa5` | `#f592b8` |
| **amber** | **`#a56e12`** ✓ | **`#8a5c0e`** ✓ | `#e0a93a` | `#ebba5c` |

> Sunset/Amber light ถูกแก้ให้เข้มขึ้นเพื่อผ่าน WCAG AA (≥4.5:1 บน white)

### Typography
```
font-heading: Sora (headings, logo)
font-body:    Inter (body text)
font-thai:    Noto Sans Thai (Thai language)
font-mono:    JetBrains Mono (code, diff, monospace)
```

### Spacing / Radius / Shadow
```
spacing: 4/8/12/16/20/24/32/40/48/64px
radius: sm=8px, default=14px, xl=18px, pill=999px
shadow: soft / card / pop
```

### Motion
```
fast: 120ms | base: 200ms | slow: 320ms
ease: cubic-bezier(0.2, 0, 0, 1)
prefers-reduced-motion: collapse all to 0ms
```

### ThemeSwitcher Implementation
```typescript
// localStorage keys
const THEME_KEY = 'tb-theme'
const MODE_KEY  = 'tb-mode'

// init ก่อน React mount (ป้องกัน FOUC)
initTheme() // อ่าน localStorage → set data-theme + data-mode บน <html>

// เปลี่ยนธีม
applyTheme('violet') // set data-theme + save
applyMode('dark')    // set data-mode + save

// tailwind config
darkMode: ['selector', '[data-mode="dark"]']
```

---

## 2. Shell / Sidebar Spec

### Desktop (lg+ ≥1024px)
- `sticky top-16 h-[calc(100vh-4rem)] w-[228px] bg-nav`
- Nav items: `rounded-xl px-3 py-2.5 text-[14px]`
  - Active: `bg-primary text-primary-fg font-semibold shadow-soft`
  - Inactive: `text-nav-fg/90 hover:bg-white/15 hover:text-nav-fg`
- Settings item active: `bg-primary/25 text-nav-fg font-semibold ring-1 ring-nav-fg/20` ← แตกต่างจาก hover

### Mobile (< lg)
- Hamburger `size-11` → slide-in overlay drawer `w-[260px] bg-nav animate-pop`
- Close: backdrop click หรือ navigate
- Slide-out animation ควรเพิ่ม: `translateX(0) → translateX(-100%) 160ms ease-in`

### Touch Targets (ทั้งหมด ≥44px)
- Hamburger: `size-11` (44px) ✓ แก้แล้ว
- Notification bell: `size-11` (44px) ✓ แก้แล้ว
- Profile avatar wrapper: `size-11` (44px) ✓ แก้แล้ว
- Button `sm` (h-9=36px): บน mobile เพิ่ม padding / tap area
- Toggle: ห่อด้วย `<label>` min-height 44px
- File tree rows: เพิ่ม `py-2.5` บน mobile

---

## 3. Page Specifications

### Page 1 — Login (`/`)
**Layout:** `AuthLayout` centered card max-w-[420px]

| State | สิ่งที่เห็น |
|---|---|
| Default | Form ว่าง, submit button พร้อม |
| Loading | Button spinner disabled, form locked |
| Error | Banner แดง + input error border + focus password |
| Success | redirect `/home` |

**Fields:** email/username input, password (toggle show/hide), Remember me (30-day), Google OAuth button
**Missing flow:** ต้องเพิ่ม `/forgot-password` link → ดูหน้า ForgotPassword ใหม่

---

### Page 2 — Sign Up (`/signup`)
**Layout:** `AuthLayout` centered card max-w-[420px]

| State | Element | Trigger |
|---|---|---|
| Username checking | spinner inline | พิมพ์ ≥1 char, debounce 700ms |
| Username taken | x icon แดง, error border | API 409 |
| Username ok | check icon เขียว | API 200 |
| Submit disabled | opacity-50 | ไม่ agree terms หรือ username taken |

**Missing:** Password strength indicator (bar: weak/ok/strong) + Email Verification screen หลัง submit

---

### Page 3 — Home (`/home`) / Page 4 — My Projects (`/my-projects`)
**Layout:** `Shell` + max-w-6xl content

| State | สิ่งที่เห็น |
|---|---|
| Default | ProjectCard grid (pinned ก่อน) |
| Loading | 6× ProjectCardSkeleton (same grid) |
| Empty | EmptyState + CTA → Create Modal |
| Error | Banner แดง + retry |

**Grid:** 1col (mobile) → 2col (sm) → 3col (xl)

**ProjectCard anatomy:**
```
header (h-12): bg-primary, ชื่อ project, 3-dot menu
body (p-4):   description 3 lines
footer:       Owner name | avatars overlap | meta (last edit · members)
```

**Role-based menu:**
| Action | Owner | Editor | Viewer |
|---|---|---|---|
| เชิญสมาชิก | ✓ | - | - |
| ปักหมุด | ✓ | ✓ | ✓ |
| ออกจาก project | ✓ | ✓ | ✓ |
| ลบ project | ✓ (confirm) | - | - |

**FAB:** `fixed bottom-6 right-6 size-14 rounded-full shadow-fab` → Create Project Modal

---

### Page 5 — My Updates (`/my-updates`) / Page 6 — Project Changes (`/project-changes`)
**Layout:** `Shell` + max-w-4xl | ใช้ `UpdatesView` component ร่วมกัน (Page 6 ส่ง `withBy` prop)

| State | สิ่งที่เห็น |
|---|---|
| Default | UpdateRow list |
| Loading | 3× skeleton cards |
| Empty | EmptyState (ต่างตาม page) |
| Error | ✓ แก้แล้ว — warning icon + retry button |

**Diff Drawer animation:**
```
Open:  translateX(100%→0%)  200ms ease-out
Close: translateX(0→100%)   160ms ease-in
Backdrop: opacity 0→0.4     200ms
Mobile: drawer width = 100%
```

---

### Page 7 — Settings (`/settings`)
**Layout:** `Shell` + max-w-5xl + grid `[220px nav] | [content]` บน lg+

**Section nav:**
- Active (non-danger): `bg-primary-soft text-primary` ✓
- Active (danger): `bg-danger/10 text-danger` ← แก้แล้ว
- Inactive: `text-muted hover:bg-ink/5 hover:text-ink`

**Missing states ที่ต้องเพิ่ม:**
- Account: success banner หลังบันทึก username
- Account: Password Change Modal (เมื่อกด "ตั้งรหัสผ่านใหม่")
- Danger Zone: Confirmation Modal + countdown 30 วัน

**Responsive:** Mobile = horizontal scroll section nav บนสุด, content ล่าง

---

### Page 8 — Work Page (`/work`)
**Layout:** Full-screen standalone (ไม่มี Shell)

```
Header (h-16): ← | Project Name | [folder btn mobile] | avatars | + ใหม่
─────────────────────────────────────────────────────
File Tree (w-64, md+) | Thumbnail Grid (flex-1)
```

| State | สิ่งที่เห็น |
|---|---|
| Default | grid thumbnails + file tree |
| Loading | ✓ แก้แล้ว — 6× skeleton |
| Empty | ✓ EmptyState + สร้างไฟล์ |
| Error | ✓ แก้แล้ว — warning + retry |

**Mobile file tree:** ✓ แก้แล้ว — ปุ่ม folder icon ใน header → bottom sheet 70vh

**A4Thumbnail grid:** 2col → 3col (sm) → 4col (lg) → 5col (xl)

**File Context Menu (3-dot hover):** เปลี่ยนชื่อ / ทำซ้ำ / ย้ายไป… / ลบ

**Create File Dialog:**
- ชื่อไฟล์ (required, autofocus)
- ขนาดกระดาษ: A4 / A5 / Letter (Segmented)
- แนววาง: แนวตั้ง / แนวนอน (Segmented)
- Import zone: PDF/.docx ≤ 25MB drag-drop

---

### Page 9 — Editor (`/editor`)
**Layout:** Full-screen standalone

```
Top bar (h-14): ← | filename | autosave | avatars | undo redo history Export
Format bar (h-12): heading | B I U | list table | zoom  [overflow-x-auto ✓]
─────────────────────────────────────────────────────────────────────────
Tool rail (w-16, sm+) | Canvas (scroll, bg-paper, p-6/10)
                       | A4 page (max-w-760px, aspect-[1/1.414])
                       | Live cursors (position: absolute, pointer-events-none)
Mobile bottom toolbar (h-14, sm:hidden)
```

**Autosave states:**
- saved: `[✓ text-success] "บันทึกแล้ว"` — text-muted
- saving: `[spinner] "กำลังบันทึก…"` — text-muted

**Tool Rail active:** `bg-primary text-primary-fg shadow-soft size-11`

**Live Cursor:**
```css
.live-cursor {
  position: absolute; pointer-events: none; z-index: 10;
  transition: top 60ms linear, left 60ms linear;
}
@media (prefers-reduced-motion: reduce) { .live-cursor { transition: none; } }
```

**Version History Modal:** max-w-3xl, sidebar list [200px] | DiffView

**Format bar:** ✓ แก้แล้ว — `overflow-x-auto` + `FmtBtn shrink-0`

**Viewer mode (ต้องเพิ่ม):** prop `readOnly` → ซ่อน format bar, tool rail, undo/redo, เหลือแค่ export

---

## 4. Component Interaction Specs

### Modal / Dialog
```
Overlay: animate-fade 0.2s ease-out (opacity 0→1)
Card:    animate-pop 0.16s ease-out (translateY 6px→0, scale 0.98→1)
Close:   Escape / backdrop / X button / ยกเลิก
A11y:    role="dialog" aria-modal="true" aria-labelledby
         Focus trap เมื่อเปิด
```

### Create Project Modal (max-w-md)
- ชื่อ (required, autofocus), description (optional)
- Invite Gmail + Editor/Viewer segmented
- Submit → card animate into grid (pop)

### SearchOverlay (Cmd+K)
- `fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm`
- Input h-14 text-lg autofocus
- Results grouped: Projects | Files | เนื้อหา
- Keyboard: ↑↓ navigate, Enter select, Esc close

---

## 5. Responsive Breakpoint Table

| Component | Mobile 390px | iPad 820px | Desktop 1024px+ |
|---|---|---|---|
| Sidebar | ซ่อน → Hamburger → Drawer | ซ่อน → Drawer | Fixed 228px |
| Project Grid | 1col | 2col | 3col |
| Settings nav | Horizontal scroll | Horizontal scroll | Left sidebar 220px |
| Work Page tree | ซ่อน → Bottom sheet ✓ | w-64 แสดง | w-64 แสดง |
| Editor tool rail | ซ่อน → Bottom toolbar | sm:flex w-16 | w-16 |
| Editor format bar | overflow-x-auto scroll ✓ | แสดง | แสดง |
| A4 Canvas | full w, p-4 | max-w-760px | max-w-760px |
| A4 Thumb grid | 2col | 3col | 4-5col |
| FAB | bottom-6 right-6 | bottom-6 right-6 | bottom-6 right-6 |
| Diff Drawer | full width | max-w-2xl | max-w-2xl |
| Modal | full - 16px margin | max-w-md/3xl | max-w-md/3xl |

**Breakpoints:**
```
sm: 640px   md: 768px   lg: 1024px   xl: 1280px
```

---

## 6. API Integration Points

| หน้า | Method + Endpoint | React Query Key |
|---|---|---|
| Login | POST /auth/login | — |
| SignUp | POST /auth/signup | — |
| Check username | GET /auth/check-username?u=:u | `['username', value]` |
| Home | GET /projects | `['projects']` |
| My Projects | GET /projects?mine=true | `['projects', 'mine']` |
| My Updates | GET /revisions?author=me | `['revisions', 'me', range]` |
| Project Changes | GET /revisions?project=:id | `['revisions', 'project', id]` |
| Work Page | GET /projects/:id/files | `['files', projectId]` |
| Editor | GET /files/:id + WS Yjs | `['file', fileId]` |
| Settings | GET/PUT /users/me | `['user', 'me']` |
| Trash | GET /trash | `['trash']` |
| Notifications | GET /notifications | `['notifications']` |
| Search | GET /search?q=:q | `['search', query]` |

**Optimistic Updates:** Create project, Pin/Unpin, Delete (undo toast 5s)

---

## 7. i18n Key Structure

```
// คำที่คง English ทั้งสองภาษา: Project, Owner, Editor, Viewer, Box, Task Board

auth.login.title         = "Sign in to Task Board"
auth.login.subtitle      = "ยินดีต้อนรับกลับมา"
auth.login.label_id      = "Username หรือ Email"
auth.login.label_password= "Password"
auth.login.remember      = "จดจำฉันไว้ (30 วัน)"
auth.login.forgot        = "ลืมรหัสผ่าน?"
auth.login.submit        = "Sign in"
auth.login.google        = "Continue with Google"
auth.error.invalid_creds = "อีเมลหรือรหัสผ่านไม่ถูกต้อง"

project.all.title        = "Project ทั้งหมด"
project.mine.title       = "Project ของฉัน"
project.empty.all        = "สร้าง project แรกเพื่อเริ่มเขียนรายงานร่วมกับทีม"
project.empty.mine       = "project ที่สร้างเองจะมาอยู่ที่นี่"
project.error.load       = "โหลด project ไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่"
project.invite.hint      = "ถ้ายังไม่มีบัญชี ระบบจะส่งคำเชิญให้สมัครแล้วเข้า project อัตโนมัติ"

updates.my.empty         = "เริ่มแก้ไขเอกสารแล้วประวัติจะมาแสดงที่นี่"
updates.project.empty    = "เมื่อมีคนแก้ไขงานใน project การเปลี่ยนแปลงจะปรากฏที่นี่"
updates.error            = "โหลดข้อมูลไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่"

work.file.empty          = "ยังไม่มีไฟล์ใน project นี้"
work.file.error          = "โหลดไฟล์ไม่สำเร็จ"
work.create.hint         = "PDF, Word (.docx) สูงสุด 25 MB"

editor.saved             = "บันทึกแล้ว"
editor.saving            = "กำลังบันทึก…"
```

---

## 8. Security Rules (ทุก mutation ต้องผ่าน server)

1. **Viewer** — บล็อก write ทุก endpoint ฝั่ง server (ไม่พึ่ง UI ซ่อนปุ่ม)
2. ทุกการแก้เอกสารต้องสร้าง `Revision` (Version History)
3. Password hash bcrypt ≥12 rounds
4. JWT/refresh token จัดการปลอดภัย (httpOnly cookie หรือ secure storage)
5. Rate-limit auth endpoints
6. Input validation ทุก endpoint (zod schema)
7. ห้ามเก็บ secret ใน repo — ใช้ `.env.example` เท่านั้น

---

## 9. จอใหม่ที่ออกแบบแล้ว (design/src/pages/)

| ไฟล์ | Route | หมายเหตุ |
|---|---|---|
| `ForgotPassword.tsx` | `/forgot-password` | AuthLayout, email input, success state + resend |
| `ResetPassword.tsx` | `/reset-password` | AuthLayout, password strength bar |
| `EmailVerify.tsx` | `/verify-email` | AuthLayout, resend countdown 60s |
| `ProjectSettings.tsx` | `/project/:id/settings` | Shell, members table, transfer/leave/delete |
| `SearchOverlay.tsx` | (component) | Cmd+K overlay, grouped results |
| `Trash.tsx` | `/trash` | Shell, 2 tabs, restore/delete permanently |
| `NotificationCenter.tsx` | `/notifications` | Shell, filter tabs, group by date |
| `NewScreensGallery.tsx` | `/new-screens` | Gallery สำหรับ review จอใหม่ |

ดูตัวอย่าง UI ได้ที่ `/#/new-screens` ใน design preview

---

## 10. Implementation Priority (Dev Sprint Plan)

| Sprint | งาน |
|---|---|
| 1 | Shell (sidebar + top bar) + ThemeSwitcher + Login + SignUp |
| 2 | ProjectCard + Grid + Home + My Projects + Create Modal |
| 3 | UpdateRow + My Updates + Project Changes + Diff Drawer |
| 4 | File Tree + A4Thumb + Work Page + Create File Dialog |
| 5 | Editor (top bar + format + tools + canvas + version history) |
| 6 | Settings (ทุก sections) + fix mobile touch targets |
| 7 | Real-time Yjs + presence + live cursors |
| 8 | Version History + Diff pages 5/6 |
| 9 | Auth missing flows (forgot/reset/verify) + Project Settings |
| 10 | Search + Trash + Notification Center + i18n + a11y pass |
| 11 | Security hardening + CI/CD + deploy |
