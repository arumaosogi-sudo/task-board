# 0003 — Tech Stack สำหรับ Sprint 4: อยู่กับ TypeScript/Node เดิม (มีข้อยกเว้นเดียว)

- **สถานะ:** Accepted
- **วันที่:** 2026-07-14
- **ผู้ตัดสิน:** fullstack-architect-mentor (Tech Lead)
- **บริบท sprint:** `chore/sprint4-prep` — 8 feature candidates (Comments, Mentions UI, Task/checklist blocks, Templates, AI ช่วยเขียน/แปล, Public share link, Export Word/MD, Tags/activity)
- **เกี่ยวข้อง:** `docs/sprint4-feature-candidates.md`, `docs/decisions/0002-activity-consolidation.md`, `apps/api/prisma/schema.prisma`

---

## Context

PM ถามตรง ๆ: **"ควรเพิ่มภาษา/เครื่องมือใหม่ (python/java/js/sql) เพื่อให้ระบบทำง่าย+สะดวกขึ้นไหม"** โดยเฉพาะสำหรับ Sprint 4

ตัดสินด้วยของจริงจากโค้ด (อ่าน `package.json` ทั้ง 3 workspace + `apps/api/src` + `apps/web/src` + `schema.prisma`):

**Stack ปัจจุบัน (ยืนยันแล้ว):**

| ชั้น | เทคโนโลยี |
|---|---|
| Monorepo | npm workspaces + **Turborepo** (`turbo.json`) — `apps/api`, `apps/web`, `packages/shared` |
| Backend | **NestJS 10** + **Prisma 5** + **PostgreSQL** (Supabase, pooled + RLS) |
| Realtime | **Yjs** + **Hocuspocus** (`@hocuspocus/server` ↔ `@hocuspocus/provider`) — CRDT เป็น source of truth ตอน collab |
| Editor | **TipTap 2.27** (ProseMirror) + custom node เยอะ (`Box.ts`, `ResizableImage.ts`, `drawing.ts`, `FontSize.ts`) |
| Frontend | **React 18** + **Vite 5** + **Tailwind 3** + **TanStack Query 5** + i18next (th/en) |
| Shared | `packages/shared` — TS types ใช้ร่วม api ↔ web แบบไม่ต้อง build |
| Auth | JWT + Passport (local + Google OAuth) + bcrypt |

**หัวใจของการตัดสินใจ:** Sprint 4 ทั้ง 8 ตัวเป็นงานที่ **ต่อยอดบน editor / collab / data model ที่มีอยู่** เกือบทั้งหมด ไม่มีงานที่ compute-heavy หรือต้องใช้ library เฉพาะทางที่มีเฉพาะใน ecosystem อื่น

---

## Decision

### 1) อยู่กับ TypeScript/Node เดิม — ไม่เพิ่มภาษาโปรแกรมมิ่งใหม่

**เหตุผลเชิงสถาปัตยกรรม (ไม่ใช่ความเห็นลอย ๆ):**

| ปัจจัย | ผลต่อการตัดสินใจ |
|---|---|
| **Shared types** | `packages/shared` ให้ type เดียวไหลจาก DB → API → UI. เพิ่มภาษาที่ 2 (Python/Java) = ตัด type-safety ข้ามขอบเขต ต้อง sync contract ด้วยมือ → คลาสของบั๊กที่ตอนนี้ไม่มีเลย |
| **CRDT lock-in ที่ดี** | Yjs/TipTap เป็น **JS-native** ทั้งคู่ ทุกฟีเจอร์ที่แตะเนื้อหาเอกสาร (Comments anchor, mentions, task blocks, export) ต้องรันในโลก JS อยู่แล้ว — ไม่มีทางย้ายไป Python/Java ได้โดยไม่ reimplement ProseMirror schema |
| **ทีมเดี่ยว / solo dev** | Runtime เดียว, toolchain เดียว, deploy target เดียว = maintenance cost ต่ำสุด การเพิ่ม runtime ที่ 2 หมายถึง Docker image, CI lane, dependency graph, และ on-call surface ที่เพิ่มเป็นเท่าตัว |
| **Deploy footprint** | ตอนนี้ deploy เป็น Node container เดียว (`docker-compose.prod.yml`) เพิ่ม Python/Java service = network hop + service discovery + failure mode ใหม่ ไม่คุ้มกับสิ่งที่ Sprint 4 ต้องการ |

- **Python** — ล่อใจแค่ตอนเห็นคำว่า "AI" แต่ฟีเจอร์ AI ที่นี่คือ **การเรียก hosted LLM API** (HTTP call) ไม่ใช่ train/run model เอง TS เรียก API ได้ดีเท่ากันและได้ shared types ฟรี → Python เป็น **net negative** สำหรับ solo dev
- **Java** — ไม่มีเหตุผลรองรับเลยในทุกฟีเจอร์
- **SQL** — ใช้อยู่แล้วผ่าน Prisma + Postgres การเขียน raw SQL เพิ่มจำเป็นเฉพาะ full-text search (ดูข้อ 2, feature Tags/activity) ผ่าน `$queryRaw` — ไม่ใช่ "ภาษาใหม่" แค่ escape hatch ที่ Prisma มีให้อยู่แล้ว

> **สรุปข้อ 1:** default = **TypeScript/Node ทั้งหมด**. สิ่งที่ "เพิ่ม" คือ **npm library ภายใน ecosystem เดิม** + **บริการภายนอก 1 ตัว (LLM API)** ซึ่งเป็น SaaS ไม่ใช่ภาษา

### 2) ไล่ทีละฟีเจอร์ Sprint 4 → tool/library ที่แนะนำ

| # | ฟีเจอร์ | ต้องใช้ของใหม่? | Library / Service แนะนำ | เก็บที่ไหน / หมายเหตุสถาปัตยกรรม |
|---|---|---|---|---|
| 1 | 💬 **Comments** | ไม่ (ในระบบมีครบ) | **Yjs `RelativePosition`** (มากับ `yjs` แล้ว) + TipTap **Mark** ใหม่ + Prisma model `Comment` | Anchor เก็บเป็น serialized relative position ทน concurrent edit. Metadata (body, author, resolvedAt, parentId) → **Postgres** ไม่ใช่ Yjs (query/notification ได้ ต่างจาก ephemeral doc state) |
| 2 | @️ **Mentions UI** | +1 lib official | **`@tiptap/extension-mention`** + **`@tiptap/suggestion`** (`^2.x` family เดียวกับที่ติดตั้งแล้ว) | **ไม่แตะ backend** — regex mention-detection + notification ทำงานอยู่แล้วใน `revisions.service.ts` แค่ให้ editor render `<span data-mention>` ที่ regex เดิม match |
| 3 | ✅ **Task/checklist blocks** | +2 lib official | **`@tiptap/extension-task-list`** + **`@tiptap/extension-task-item`** | Effort ต่ำสุด. เป็น ProseMirror node ใต้ `Collaboration` extension เดิม → round-trip ผ่าน Yjs/getHTML/PDF อัตโนมัติ (precedent: `Box.ts`) ไม่แตะ schema/security |
| 4 | 📄 **Templates** | **ไม่ต้องเพิ่มอะไร** | Static seed (HTML const ต่อ template, ผูก th/en) | Duplicate เข้า `File.content` ตอนสร้างไฟล์ (reuse logic "สร้างไฟล์เปล่า") ไม่แตะ Yjs/collab |
| 5 | 🤖 **AI เขียน/แปล** | **ใช่ — บริการภายนอก** | **`ai` (Vercel AI SDK, TS)** เป็น provider-abstraction + **1 LLM provider** ที่ Thai↔EN แข็ง (Claude / GPT-4-class) ผ่าน `@anthropic-ai/sdk` หรือ `openai` | **⚠️ ข้อยกเว้นเดียวของ ADR นี้.** endpoint ใหม่ฝั่ง api (**key ห้ามหลุดไป client**), stream ผลผ่าน AI SDK, แสดงเป็น **diff proposal** (reuse `DiffView`) ห้ามเขียนทับเงียบ. **ต้องมี `security-engineer` ทำ threat model ก่อน** (เอกสาร user อาจมี PII/ข้อมูลลับส่งออก third-party, prompt injection ผ่านเนื้อหา). **แนะนำแยกเป็น sprint ของตัวเอง** ตาม candidate doc |
| 6 | 📤 **Export Word/MD** | +3 lib (Node) | **`html-to-docx`** (HTML→.docx) · **`turndown`** (HTML→Markdown) · **`jszip`** (export ทั้งโปรเจกต์เป็น zip) | รันฝั่ง **api** (Node). ⚠️ Fidelity risk ที่ custom node: `Box` callout / `drawing.ts` SVG / `ResizableImage` — ต้อง map แต่ละตัวไป docx/md ให้ไม่พัง (SVG freehand → Word ยากสุด). PDF เดิมใช้ browser print (dependency-free) — วิธีนั้นใช้กับ Word/MD **ไม่ได้** |
| 7 | 🔗 **Public share link** | ไม่ (แต่แตะ security model) | Guard ใหม่ validate opaque token แทน JWT | ⚠️ เปลี่ยน security model ของทั้งระบบ (ตอนนี้ auth-gated 100% + Supabase RLS). แนะนำ scope แคบ: เสิร์ฟ **snapshot readonly ไม่เปิด Yjs WS ให้ anon**. ต้องมี `security-engineer` ก่อน SRS |
| 8 | 🏷️ **Tags / per-project activity** | Tags: +Prisma model · Activity: ไม่ต้อง | Tags → Prisma many-to-many. Search/filter หนัก ๆ → `$queryRaw` + Postgres index (GIN ถ้าใช้ full-text) | Activity timeline reuse hook `useProjectChanges(projectId)` ที่มีอยู่แล้ว ~100%. Favorites เสร็จแล้ว (`ProjectPin`) ไม่ต้องทำ |

**Pattern rule:** เนื้อหา doc (anchor, node) → **Yjs/TipTap** · metadata ที่ต้อง query/notify → **Postgres** · อย่าเก็บ comment/tag ใน Yjs (จะ query/แจ้งเตือนไม่ได้)

### 3) DX / เครื่องมือที่ทำให้ dev สะดวกขึ้น "จริง"

| ปัญหาที่พบในโค้ดจริง | คำแนะนำ | ทำไม (priority) |
|---|---|---|
| **`lint` เป็น no-op** — ทั้ง api/web/shared มี `"lint": "echo \"lint ok\""` | เพิ่ม **ESLint (flat config) + typescript-eslint + Prettier** จริง วางเป็น shared config ใน `packages/` แล้วให้ `turbo lint` เรียกของจริง | 🔴 **สูงสุด.** ตอนนี้ CI ผ่าน lint เสมอโดยไม่ตรวจอะไรเลย = false sense of safety. Sprint 4 เพิ่ม code เยอะ (comments, AI, export) ยิ่งต้องมี lint จริงก่อนลงมือ |
| ยังไม่มี pre-commit gate | **husky + lint-staged** รัน `typecheck` + `lint` เฉพาะไฟล์ที่แก้ | 🟡 กัน regression เข้าตั้งแต่ก่อน push |
| Turbo มีแล้วแต่ไม่มี lint task จริงใน pipeline | ผูก `lint` + `typecheck` เข้า `turbo.json` ให้ cache ได้ | 🟡 เร็วขึ้น + บังคับใช้จริง |
| AI/Export จะเพิ่ม input validation surface | ใช้ **class-validator เดิม** (มีอยู่แล้ว) อย่าเพิ่ม zod ซ้ำซ้อน | 🟢 คงความสม่ำเสมอ ไม่เพิ่ม dependency ที่ทับหน้าที่กัน |

> **ของที่ *ไม่* ต้องเพิ่ม:** ไม่ต้องเปลี่ยน bundler, ไม่ต้องเพิ่ม state manager (TanStack Query พอ), ไม่ต้อง monorepo tool ใหม่ (Turbo ดีอยู่แล้ว), ไม่ต้อง ORM ใหม่

### 4) คำแนะนำสุดท้าย

- **Default stack = TypeScript/Node ทั้งหมด** (NestJS + Prisma + Postgres + React + Yjs/TipTap) — ไม่มีเหตุผลรองรับ Python/Java ในทุกฟีเจอร์ Sprint 4
- **สิ่งที่ "เพิ่ม" ล้วนเป็น npm library ใน ecosystem เดิม** (`@tiptap/*`, `html-to-docx`, `turndown`, `jszip`)
- **ข้อยกเว้นเดียว = LLM API (feature #5)** — external SaaS ไม่ใช่ภาษาใหม่ เรียกผ่าน TS ได้ ต้อง gate ด้วย security threat model และ**แยก sprint**
- **DX ที่ต้องทำก่อนเริ่ม Sprint 4:** เปลี่ยน `lint` no-op → **ESLint จริง** (priority สูงสุด, low effort, high leverage)
- **ลำดับทำ (ตาม candidate shortlist):** Task blocks + Mentions UI (quick win, +tiptap lib) → Templates (ไม่เพิ่ม lib) → Comments (big bet) · ส่วน AI / Public share / Export → defer + ADR/threat model แยก

---

## Consequences

**บวก:** ไม่มี runtime ที่ 2, shared types คงอยู่, deploy footprint เท่าเดิม, maintenance คงที่สำหรับ solo dev. Lint จริงจับบั๊กได้ตั้งแต่ก่อน merge

**ลบ / ต้องระวัง:**
- Feature AI ผูกกับ vendor ภายนอก → ต้องจัดการ secret, cost, rate-limit, fallback (เอกสารแก้ real-time อยู่ ห้าม block editor)
- Export fidelity ของ custom node (SVG drawing → Word) เป็นความเสี่ยงที่ต้อง prototype ก่อนสัญญา scope
- การเพิ่ม ESLint จริงครั้งแรกจะเจอ warning ค้างเยอะ — วางแผน fix เป็น batch อย่าบล็อก Sprint 4 ทั้งก้อน

**ต้องตัดสินใจต่อ (ก่อน dev):** (1) Comment anchor จะทำอย่างไรเมื่อ user restore revision เก่า (2) LLM provider ตัวไหน + data-residency (3) Public share bypass RLS อย่างไรให้ปลอดภัย — ทั้ง 3 ควรมี ADR/threat model แยกก่อนเขียน SRS
