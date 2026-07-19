# วิธี Clone และรันโปรเจกต์ Task Board

## สิ่งที่ต้องมีก่อน (Prerequisites)
- **Node.js 20+** — ดาวน์โหลดที่ https://nodejs.org
- **Docker Desktop** (แนะนำ — สำหรับรัน PostgreSQL + Mailpit ในเครื่อง) — https://www.docker.com/products/docker-desktop
- **Git** — https://git-scm.com

ตรวจว่าติดตั้งแล้ว:
```bash
node -v      # ควรเห็น v20.x หรือสูงกว่า
docker -v
git --version
```

## ขั้นตอนที่ 1 — Clone โปรเจกต์
```bash
git clone https://github.com/arumaosogi-sudo/Project_task_borad_appvs01.git
cd Project_task_borad_appvs01
```

## ขั้นตอนที่ 2 — ติดตั้ง dependencies
```bash
npm install
```
(รอสักครู่ — ติดตั้งทั้ง 3 workspace พร้อมกัน)

## ขั้นตอนที่ 3 — ตั้งค่า environment variables
```bash
cp .env.example apps/api/.env
```
แล้วเปิดไฟล์ `apps/api/.env` แก้ค่าต่อไปนี้:

| ตัวแปร | ค่า (สำหรับรัน local ด้วย Docker) |
|---|---|
| `DATABASE_URL` | `postgresql://taskboard:taskboard@localhost:5432/taskboard` |
| `DIRECT_URL` | เหมือนกับ `DATABASE_URL` |
| `JWT_SECRET` | สุ่มเอง อย่างน้อย 32 ตัวอักษร (เช่นรันคำสั่ง `openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | สุ่มอีกค่าหนึ่ง (ห้ามซ้ำกับด้านบน) |

> ⚠️ **สำคัญ:** ห้ามใช้ค่าที่ขึ้นต้นด้วย `change-me` — ระบบจะปฏิเสธไม่ยอม boot (เป็นการป้องกันความปลอดภัยที่ตั้งใจไว้)

ส่วน `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — ถ้าไม่ต้องการทดสอบ Google Login ข้ามได้เลย (ปุ่มจะขึ้น error สุภาพแทนที่จะพัง)

## ขั้นตอนที่ 4 — สตาร์ท PostgreSQL + Mailpit (ผ่าน Docker)
```bash
docker compose up -d db mailpit
```

## ขั้นตอนที่ 5 — รัน database migrations
```bash
cd apps/api
npx prisma generate
npx prisma migrate deploy
cd ../..
```

## ขั้นตอนที่ 6 — รันโปรเจกต์
```bash
npm run dev
```

เปิดเบราว์เซอร์:
- **เว็บแอป:** http://localhost:5173
- **API:** http://localhost:3001
- **Mailpit (ดูอีเมลที่ระบบส่ง เช่น verify email):** http://localhost:8025

## วิธีตรวจสอบว่าทำงานถูกต้อง (เหมือนที่เจ้าของทำ)

```bash
npm run lint        # ตรวจโค้ด — ควรผ่านไม่มี error
npm run typecheck   # ตรวจ type — ควรผ่านทั้ง 3 workspace
npm run build       # build จริง — ควรผ่านทั้ง 3 workspace
npm test            # รันเทสต์ — ควรผ่าน ~356 เทสต์ (api + web)
```

ถ้าอยากรัน integration test ที่แตะฐานข้อมูลจริง (ต้องมี Docker):
```bash
npm run test:int:local
```

## ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
|---|---|
| `EADDRINUSE` (port ชนกัน) | มีโปรเซสเก่าค้างอยู่ — ปิด terminal เก่าที่รัน `npm run dev` ค้างไว้ หรือ restart เครื่อง |
| Prisma type error ("no exported member") | รัน `cd apps/api && npx prisma generate` ใหม่ (มักเกิดหลัง `npm ci`/clone ใหม่) |
| Login ด้วย Google ไม่ได้ | ปกติถ้าไม่ได้ตั้งค่า `GOOGLE_CLIENT_*` — ใช้สมัคร email/password แทนได้ |
| Migration ไม่ตรงกับ error "database schema is not in sync" | รัน `npx prisma migrate deploy` อีกครั้งใน `apps/api` |

## โครงสร้างโปรเจกต์ (คร่าวๆ)
```
apps/api/     NestJS backend (auth, projects, files, comments, real-time)
apps/web/     React frontend
packages/shared/   types ที่ frontend/backend ใช้ร่วมกัน
docs/         เอกสารทั้งหมด (SRS, ADR, security review, test plan)
design/       design spec + UI guidelines
```

เอกสารเพิ่มเติมที่น่าอ่าน: `README.md` (ภาพรวม), `CLAUDE.md` (สถาปัตยกรรม), `docs/decisions/` (การตัดสินใจสำคัญ)
