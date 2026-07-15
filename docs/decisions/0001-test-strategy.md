# ADR 0001 — Test Strategy & Toolchain for Task Board

- **Status:** Accepted
- **Date:** 2026-07-10
- **Deciders:** Tech Lead / Architect (Sprint 2)
- **Context tags:** monorepo, NestJS, React/Vite, testing, CI

---

## Context

Task Board เป็น monorepo (npm workspaces + Turborepo) ที่มี 3 workspace:
`apps/api` (NestJS + Prisma + PostgreSQL), `apps/web` (React 18 + Vite + TS +
Tailwind + TanStack Query), `packages/shared` (types ร่วม)

จนจบ Sprint 1 โปรเจกต์ **ยังไม่มีเทสต์เลย** — ไม่มี test runner, ไม่มี config,
ไม่มี spec ใด ๆ `npm run test` map ไปที่ `turbo test` แต่ไม่มี workspace ไหน
define `test` script จริง ทำให้ regression ทุกอย่างต้องจับด้วยตาเปล่า

Sprint 1 เพิ่ง harden ประเด็นความปลอดภัยหลายจุด (email HTML escape, JWT
boot-check, `/health/ready`, throttle) แต่ไม่มี safety net กันของพวกนี้ถอยหลัง
เป้าหมายของ ADR นี้คือ **วางฐานระบบเทสต์ที่รันเขียวได้จริง** แล้วค่อยไล่เพิ่ม
coverage ตามความเสี่ยงใน sprint ถัด ๆ ไป

### ข้อจำกัดที่ต้องออกแบบให้รอด

1. **NestJS ใช้ decorator + DI + `emitDecoratorMetadata` หนักมาก** — runner ที่
   เลือกต้องคง reflection metadata ไว้ ไม่งั้น DI container พังตอนรัน integration test
2. **Prisma Client ไม่ auto-generate** ตอน clean install — เทสต์ที่แตะ Prisma types
   ต้อง `prisma generate` ก่อน (CI ทำขั้นนี้อยู่แล้ว)
3. **web เป็น Vite/ESM** — runner ควรใช้ Vite transform pipeline เดียวกับแอปจริง
   เพื่อลด config drift (alias `@/`, JSX, TS)
4. **`npm run typecheck` (tsc --noEmit) ต้องไม่พัง** — spec/test ไฟล์อยู่ใต้ `src`
   จึงถูก tsc มองเห็น ต้องจัด type ของ test globals/matcher ให้เรียบร้อย

---

## Decision

### 1) API (NestJS) → **Jest + `@swc/jest` + Supertest**

| ประเด็น | ตัวเลือก | เหตุผลที่เลือก |
|---|---|---|
| Test runner | **Jest** | เป็น first-class ในโลก NestJS (nest CLI, `@nestjs/testing` ออกแบบมาคู่กับ Jest) ตัวอย่าง/ecosystem เยอะสุด ลดแรงเสียดทานของ dev |
| Transform | **`@swc/jest`** | เร็วกว่า `ts-jest` ~10–20x และ **คง `emitDecoratorMetadata`** ได้ผ่าน `legacyDecorator + decoratorMetadata` → DI/guard/pipe ที่พึ่ง reflection ทำงานถูกต้อง ต่างจาก esbuild-jest ที่ metadata ไม่ครบ |
| Integration | **Supertest** | ยิง HTTP เข้า Nest app instance ได้ตรง ๆ เหมาะกับ e2e-in-process ของ controller/guard |
| Type-check | แยกออกจาก runner | `@swc/jest` ไม่ type-check (โดยตั้งใจ) ให้ `tsc --noEmit` เป็นคนตรวจ type → เทสต์รันเร็ว, type safety ไม่หาย |

**ทำไมไม่ Vitest ฝั่ง API?** Vitest รันได้ก็จริง แต่การรองรับ decorator metadata
ของ NestJS ต้องต่อ `@swc/core` plugin เพิ่มและยัง sharp edge อยู่ (esp. DI +
`reflect-metadata` ordering) ส่วน `@nestjs/testing` utility ทั้งหมดถูกออกแบบและ
ทดสอบกับ Jest — เลือก Jest จึงเป็นเส้นทางความเสี่ยงต่ำสุดสำหรับทีมที่เพิ่งเริ่ม
มีเทสต์ เราได้ความเร็วกลับคืนผ่าน `@swc/jest` อยู่แล้ว

Config: `apps/api/jest.config.js` (`rootDir: src`, `testRegex: .*\.spec\.ts$`,
`testEnvironment: node`, moduleNameMapper สำหรับ `@task-board/shared`)

### 2) Web (React/Vite) → **Vitest + React Testing Library + jsdom**

| ประเด็น | ตัวเลือก | เหตุผล |
|---|---|---|
| Test runner | **Vitest** | ใช้ Vite transform/resolve เดียวกับแอป → alias `@/`, JSX, TS, ESM ทำงานเหมือน production ไม่มี config แยกสองชุด (ต่างจาก Jest ที่ต้อง babel/ts-jest + moduleNameMapper เยอะ) เร็ว, watch ดี |
| Component | **@testing-library/react** | ทดสอบจากมุมผู้ใช้ (role/label) ไม่ผูกกับ implementation detail — ทนต่อ refactor |
| DOM env | **jsdom** | ให้ `document`, `DOMParser` ฯลฯ — จำเป็นกับทั้ง component render และ util อย่าง `htmlDiff.ts` ที่เรียก `DOMParser` |
| Matchers | **@testing-library/jest-dom** | matcher อ่านง่าย (`toBeInTheDocument`, `toBeDisabled`) ลงทะเบียนผ่าน `vitest.setup.ts` |

Config: `apps/web/vitest.config.ts` (แยกจาก `vite.config.ts` เพื่อไม่แตะ build
config), `apps/web/vitest.setup.ts` (jest-dom + auto cleanup)

> **หมายเหตุ type:** spec ฝั่ง web `import { describe, it, expect } from 'vitest'`
> อย่างชัดเจน (ไม่พึ่ง global) และไฟล์ที่ใช้ DOM matcher `import
> '@testing-library/jest-dom/vitest'` เพื่อดึง type augmentation เข้ามา ทำให้
> `tsc --noEmit` ผ่านโดย **ไม่ต้องแก้ `tsconfig.json`** ของแอป

### 3) E2E → **Playwright (scaffold เท่านั้นในรอบนี้)**

Playwright เป็นตัวเลือกมาตรฐานปัจจุบัน (auto-wait, trace viewer, multi-browser)
รอบนี้วางแค่ `playwright.config.ts` + `e2e/example.spec.ts` (ตั้ง `.skip`) เพราะ
E2E ต้องมี stack จริง (Postgres + api + web) และ browser binary ที่ยังไม่ติดตั้ง
สคริปต์รัน: `npm run test:e2e -w @task-board/web` (ต้อง `npx playwright install` ก่อน)

---

## Test Pyramid (เป้าหมายรูปทรง)

```
        /\        E2E (Playwright)         — น้อย: happy-path วิกฤต (auth flow, สร้าง+แก้ไข doc)
       /  \
      /----\      Integration (Jest+Supertest / RTL) — ปานกลาง: controller+guard+service ต่อ DB จริง,
     /      \                                            component + hook + query
    /--------\    Unit (Jest / Vitest)     — มาก: pure logic (guard rank, token hash, escapeHtml, diff)
   /__________\
```

- **ฐานกว้าง = unit** ราคาถูก รันเป็นวินาที ไม่แตะ I/O
- **กลาง = integration** จับ contract จริงระหว่าง layer (จุดที่ bug ชอบซ่อน)
- **ยอด = E2E** แพง/ช้า เก็บไว้เฉพาะ flow ที่ถ้าพังแล้วธุรกิจเจ็บ

## โครงโฟลเดอร์ & Naming

| ชนิด | ที่อยู่ | นามสกุล |
|---|---|---|
| API unit/integration | co-located ข้างไฟล์จริงใน `apps/api/src/**` | `*.spec.ts` |
| Web unit/component | co-located ใน `apps/web/src/**` | `*.test.ts(x)` |
| E2E | `e2e/**` (root) | `*.spec.ts` |

- **Co-location** (ไฟล์เทสต์อยู่ข้างโค้ด) — หา/แก้พร้อมกันง่าย, เห็น coverage รายไฟล์ชัด
- แยกคนละนามสกุล (`.spec` = api/Jest, `.test` = web/Vitest) กัน runner หยิบผิดฝั่ง
- ตั้งชื่อ `describe` ตาม unit-under-test, `it('should … when …')` อธิบายพฤติกรรม

## Coverage Target (ไต่ระดับ ไม่บังคับ 100%)

| Workspace | Sprint 2 (ฐาน) | เป้าถัดไป | โซนบังคับสูง |
|---|---|---|---|
| `apps/api` | smoke ผ่าน | line ≥ 60% | auth, guards, files (IDOR), search scoping ≥ 85% |
| `apps/web` | smoke ผ่าน | line ≥ 50% | lib/* utilities ≥ 80% |

ยังไม่ตั้ง `--coverage` เป็น gate ใน CI รอบนี้ (กัน false-fail ระหว่างฐานยังบาง)
เปิด threshold เมื่อ coverage ไต่ถึงเป้าข้างต้นแล้ว

---

## Consequences

**บวก**
- มี safety net รันได้จริง (`npm test` เขียว) + hook เข้า CI แล้ว
- runner แต่ละฝั่งแมตช์ runtime ของตัวเอง (Nest↔Jest/swc, Vite↔Vitest) → config drift ต่ำ
- เทสต์ co-located ลดแรงเสียดทานในการเขียนเทสต์เพิ่ม

**ลบ / ต้องระวัง**
- **สอง runner** (Jest + Vitest) = สอง mental model ยอมรับได้เพราะแมตช์ runtime คนละแบบ
- Jest+SWC **ไม่ type-check** — ต้องพึ่ง `tsc` เป็นด่านแยก (มีใน CI แล้ว)
- Integration/E2E จริงต้องมี **PostgreSQL** ใน CI (Sprint ถัดไป: service container + test DB + migrate)
- spec ฝั่ง api ถูก `tsc build` รวมเข้า `dist` ด้วย (ไม่กระทบ runtime; ถ้าต้องการสะอาดค่อย `exclude` ภายหลัง)

## Follow-ups (ส่งต่อ)

1. เพิ่ม PostgreSQL service container + test DB + `prisma migrate deploy` ใน CI เพื่อปลดล็อก integration test
2. ไล่เขียนเทสต์ตาม **[docs/test-plan.md](../test-plan.md)** (จัดลำดับตามความเสี่ยงแล้ว)
3. เปิด coverage threshold เมื่อถึงเป้า แล้วต่อ `--coverage` เข้า CI
4. เขียน E2E happy-path แรก (register → verify → login) แล้วเปิด `webServer` ใน `playwright.config.ts`
