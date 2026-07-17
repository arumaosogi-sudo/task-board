# 0007 — AI ช่วยเขียน/แปล th↔en: Provider, สถาปัตยกรรม integration, และขอบเขต v1

- **สถานะ:** Proposed — รอ owner ratify (เลือก provider เชิงพาณิชย์ + งบ + ยอมรับความเสี่ยง data-egress) และรอ `security-engineer` ทำ threat model ก่อนเขียน SRS
- **วันที่:** 2026-07-17
- **ผู้ตัดสิน:** fullstack-architect-mentor (Tech Lead)
- **บริบท sprint:** `chore/sprint4-prep` — feature candidate #3 "AI ช่วยเขียน (สรุป/ปรับสำนวน/แปล th↔en)"
- **ต่อยอดจาก:** `docs/decisions/0003-tech-stack-sprint4.md` ข้อ 2 แถว #5 (ข้อยกเว้นเดียวที่อนุญาตให้เพิ่ม external SaaS = LLM API) และข้อ 4 ("แยกเป็น sprint ของตัวเอง เริ่มด้วย ADR")
- **เกี่ยวข้อง:** `docs/sprint4-feature-candidates.md` §1 แถว 3 + §3, `apps/api/.env.example`, `apps/web/src/components/RevisionDiffDrawer.tsx`, `apps/web/src/components/DiffView.tsx`

---

## Context

เจ้าของต้องการฟีเจอร์ AI ช่วยเขียน/ปรับสำนวน/สรุป และแปลไทย↔อังกฤษในเอกสาร ตรงกับ pain point ของแอปเขียนรายงานสองภาษาโดยตรง (candidate doc ให้ user value "สูง")

**ยืนยันสถานะจริงจากโค้ด (2026-07-17):**

- `grep -iE '(ai|openai|@anthropic-ai/sdk|@ai-sdk)' apps/{api,web}/package.json` → **ไม่พบ** ไม่มี AI SDK/vendor ใดในระบบเลย ต้องเริ่มจากศูนย์
- มี pattern พร้อม reuse ครบ: `ConfigService` (`mail.service.ts:27`), `ServiceUnavailableException` 503 เมื่อ config ไม่ครบ (`app.controller.ts`, precedent เดียวกับ Google OAuth ว่าง → 503 และ Supabase key ว่าง → 503 ใน `.env.example`), `@nestjs/throttler` (`app.module.ts`, `auth.controller.ts`), module pattern `controller/service/module/dto` (`apps/api/src/notifications/`), authz `ProjectRoleGuard` + `@MinRole()`, และ diff UI (`RevisionDiffDrawer.tsx` + `DiffView.tsx`)

ADR 0003 ฟันไว้แล้วว่า: default stack = TypeScript/Node, LLM = **external SaaS ตัวเดียว** (ไม่ใช่ภาษาใหม่), key อยู่ฝั่ง server เท่านั้น, แสดงผลเป็น diff proposal ห้ามเขียนทับเงียบ ADR ฉบับนี้ทำให้การตัดสินใจนั้น **ละเอียดพอจะเขียน SRS ได้** — ฟันธง provider, endpoint pattern, cost control, fallback, secrets ownership, ขอบเขต v1 และส่งประเด็น security ให้ทีมถัดไป

**หลักการตัดสินใจ:** แอปนี้ diff-first + real-time collab + solo dev เพราะฉะนั้นเกณฑ์เรียงตาม (1) **data-egress/security ของเอกสารลับ** (2) ไม่ block editor (3) คุณภาพภาษาไทย (4) cost/ops ที่ solo dev ดูแลไหว

---

## Decision

### 1) Provider: **Anthropic Claude เป็น primary** ผ่าน Vercel AI SDK (`ai` + `@ai-sdk/anthropic`)

**ฟันธง:** ใช้ **`ai` SDK (Vercel) เป็น provider-abstraction layer** + **Anthropic Claude เป็น provider แรก** โดยเลือกรุ่นตาม task (รุ่นเล็ก/เร็วสำหรับแปล/ปรับสำนวน, รุ่นกลางสำหรับสรุป) เหตุผลที่เลือก AI SDK เป็น abstraction ก่อน: ถ้าอนาคตต้องสลับ/เพิ่ม provider (เช่น เพื่อ data-residency หรือราคา) เปลี่ยนแค่ adapter ไม่ต้องรื้อ business logic — ตรงกับหลัก "ลด vendor lock-in" ของ solo dev

**ตารางเปรียบเทียบ (เกณฑ์ที่ weight สูงสุด = data retention เพราะเอกสารมีข้อมูลลับ):**

| เกณฑ์ | Anthropic Claude ✅ (เลือก) | OpenAI GPT (fallback option) | สรุป |
|---|---|---|---|
| **Data retention / training** | ไม่ใช้ข้อมูล API ไป train model โดย default; รองรับ zero-retention ผ่านข้อตกลง enterprise | ไม่ใช้ข้อมูล API ไป train โดย default; retention ~30 วันเพื่อ abuse-monitoring | ทั้งคู่ไม่ train แต่ต้อง **ยืนยัน retention policy เป็นลายลักษณ์อักษร** — เป็น action ของ security-engineer |
| **คุณภาพภาษาไทย + แปล th↔en** | แข็งมากด้าน long-form Thai, รักษาโทน/บริบทเอกสารทางการได้ดี | แข็งเช่นกัน คุณภาพใกล้เคียง | เสมอกันเชิงคุณภาพ → ตัดสินด้วยเกณฑ์อื่น |
| **Streaming (token-by-token)** | รองรับผ่าน AI SDK | รองรับผ่าน AI SDK | เสมอ |
| **Latency** | ดีสำหรับรุ่นเล็ก/เร็ว | ดีสำหรับรุ่นเล็ก/เร็ว | เสมอ — จัดการด้วย streaming + timeout (ข้อ 2) |
| **ราคา** | คิดตาม input/output token, รุ่นเล็กถูกพอสำหรับ per-request | ใกล้เคียง | ควบคุมด้วย quota/rate-limit (ข้อ 2) ไม่ใช่การเลือก provider |

**เหตุผลชี้ขาดที่เลือก Claude:** คุณภาพ/ราคา/latency เสมอกัน จึงตัดสินด้วย (a) นโยบาย retention ที่คุยเป็น zero-retention ได้ชัดสำหรับข้อมูลลับ และ (b) `ai` SDK ทำให้ต้นทุนการสลับต่ำ ถ้า owner มีบัญชี OpenAI อยู่แล้วหรือราคาต่อรองได้ดีกว่า → สลับ adapter ได้โดยไม่กระทบ endpoint (นี่คือเหตุผลที่ยืนกรานใช้ abstraction layer)

> **หมายเหตุ compliance ที่ security-engineer ต้องปิด:** ไม่ว่าเลือก provider ใด ต้องมี **DPA (Data Processing Agreement)** + ยืนยัน zero/limited retention เป็นลายลักษณ์อักษรก่อน production เพราะเอกสาร user = ข้อมูลของบุคคลที่สาม (สมาชิก project) ไม่ใช่แค่ของ owner

### 2) สถาปัตยกรรม integration

#### 2.1 Endpoint ฝั่ง API — **streaming** ผ่าน module ใหม่ `apps/api/src/ai/`

**ฟันธง:** ใช้ **streaming response (SSE / chunked)** ไม่ใช่ sync request/response

- **เหตุผล:** งานเขียน/สรุปให้ผลยาว การรอ full response = latency สูง + รู้สึกค้าง; streaming แสดง token ทันทีลด perceived latency และทำให้ fallback (ข้อ 2.4) ทำงานได้ระหว่างสตรีม
- **โครงสร้าง:** module ใหม่ตาม pattern `notifications/` เป๊ะ — `ai.module.ts` / `ai.controller.ts` / `ai.service.ts` / `dto/`
- **API key อยู่ฝั่ง server เท่านั้น** — client เรียก endpoint ภายในของเรา (`POST /projects/:projectId/ai/assist`) แล้ว server เรียก LLM ต่อ **ห้าม** ให้ browser ถือ LLM key เด็ดขาด (ตาม ADR 0003 + comment ใน `.env.example:59`)
- **Authz:** endpoint ต้องผ่าน `ProjectRoleGuard` + `@MinRole(Editor)` — เฉพาะคนที่แก้เอกสารได้จริงเท่านั้นจึงเรียก AI ได้ (Viewer เรียกไม่ได้ เพราะรับ proposal ไปแก้ไม่ได้อยู่แล้ว)
- **Input contract:** client ส่ง `{ mode: 'summarize'|'rephrase'|'translate', targetLang?, selectionText }` — ส่ง **เฉพาะ selection ที่ user ไฮไลต์** ไม่ใช่ทั้งเอกสาร (ลด egress + ลด cost + ลด PII surface; ดูข้อ 5)
- **ไม่มี key = 503:** ถ้า `AI_API_KEY` ว่าง ให้ตอบ `ServiceUnavailableException` แบบเดียวกับ Google OAuth/Supabase upload ที่ทำอยู่ (graceful degrade, ปุ่ม AI ฝั่ง client แสดง disabled state)

#### 2.2 UI — **reuse `RevisionDiffDrawer`/`DiffView` แสดง proposal เป็น diff ก่อน accept** (ยืนยันแนวทาง candidate doc)

**ฟันธง:** ยืนยันการ reuse `DiffView` — **แต่ปรับสถาปัตยกรรม component เล็กน้อย** ไม่ใช่ reuse `RevisionDiffDrawer` ทั้งก้อนตรง ๆ

- อ่านโค้ดจริง: `RevisionDiffDrawer.tsx` ผูกแน่นกับ revision endpoints (`useRevision`/`useRevisions`, `DiffTarget` มี `revisionId`) — coupling นี้ไม่ตรงกับ use case AI (เราไม่มี revision เรามี original selection vs AI proposal)
- **แกนที่ reuse ได้จริง = `DiffView` (`apps/web/src/components/DiffView.tsx`) + `diffHtml` (`lib/htmlDiff`)** ซึ่งเป็น pure rendering ของ hunks/added/removed — `RevisionDiffDrawer` ก็แค่ห่อ `DiffView` เท่านั้น (บรรทัด 96)
- **แนวทาง:** สร้าง `AiProposalDrawer.tsx` ใหม่ ใช้ layout drawer แบบเดียวกัน (slide-in ขวา, overlay, a11y `role="dialog"` — copy โครงจาก `RevisionDiffDrawer` บรรทัด 50–101) แต่ป้อน `diffHtml(originalSelection, aiProposal)` เข้า `DiffView` แทน แล้วมีปุ่ม **[ยอมรับ]** (replace selection ผ่าน TipTap transaction) / **[ยกเลิก]** / **[ลองใหม่]**
- **เหตุผลไม่ reuse Drawer ตรง ๆ:** ยัด AI logic เข้า `RevisionDiffDrawer` จะทำให้ component ที่ตอนนี้สะอาด (single responsibility = revision diff) กลายเป็น god-component ที่รับ 2 use case — แยกไฟล์ share เฉพาะ `DiffView` คือ boundary ที่ถูกต้อง

#### 2.3 Rate-limit / cost control — **2 ชั้น**

**ฟันธง:** ป้องกัน cost abuse ด้วย 2 ชั้นพร้อมกัน (ชั้นเดียวไม่พอ):

1. **Request-rate:** `@nestjs/throttler` (มีอยู่แล้ว, ใช้ที่ `auth.controller.ts`) ตั้ง `@Throttle` เฉพาะ AI endpoint เข้มกว่าปกติ (เช่น N req/นาที/user) — กัน burst/loop
2. **Usage-quota:** ตารางนับโควตาต่อ **project ต่อรอบบิล** (เช่น token หรือจำนวนครั้ง/เดือน) เก็บใน Postgres (model ใหม่ `AiUsage`: projectId, userId, periodKey, tokensUsed/requestCount) — throttler กัน rate ไม่ได้กัน "ใช้เยอะสะสม" ต้องมี quota แยก เกินโควตา → ตอบ 429 + microcopy th/en

- **ทำไมต่อ project ไม่ใช่ต่อ user:** cost ควรผูกกับเจ้าของงาน (Owner ของ project) และ candidate doc/owner จะได้เห็นค่าใช้จ่ายเป็นก้อนต่อ project — SRS ค่อยกำหนดตัวเลขจริง (ทิ้ง TODO ให้ owner)

#### 2.4 Fallback UX — **AI เป็น non-blocking เสมอ** (กฎเหล็กของ real-time app)

**ฟันธง:** AI ทำงานใน overlay/drawer แยกจาก editing surface — **ห้าม** ให้ AI แตะ Yjs doc จนกว่า user กด "ยอมรับ"

- ระหว่างรอ AI: editor ยังพิมพ์/collab ได้ปกติ (AI ทำงานใน drawer ข้าง ๆ ไม่ lock selection)
- **Timeout:** ตั้ง hard timeout ฝั่ง server (เช่น ~15–20s) ถ้า provider ช้า/ล่ม → ตอบ error ที่ client แสดงเป็น toast "AI ไม่พร้อมใช้งานตอนนี้ ลองใหม่อีกครั้ง" (th/en) **โดยไม่กระทบเนื้อหาที่พิมพ์อยู่**
- **Error/ล่ม:** ปุ่ม AI กลับสู่ idle, เอกสารไม่เปลี่ยน, ไม่มี partial write ลง doc
- **Accept เท่านั้นที่เขียน:** การ apply proposal = TipTap transaction ปกติ (ผ่าน Yjs) เหมือน user พิมพ์เอง → ได้ Revision + collab sync ฟรี ไม่ต้องมี path พิเศษที่แตะ `File.content` ตรง (เคารพกฎเหล็กข้อ 3 ของ PROJECT_BRIEF)

### 3) Secrets management

**ฟันธง:** ทำตาม pattern เดิมใน `.env.example` เป๊ะ — key เป็น **global server-side config** ไม่ใช่ per-user

| ประเด็น | การตัดสินใจ |
|---|---|
| เก็บที่ไหน | `.env` (ไม่ commit) เพิ่มบล็อกใหม่ท้าย `.env.example` เป็น **ตัวอย่างค่าว่าง** ตาม pattern Supabase/Google OAuth |
| ตัวแปร | `AI_API_KEY` (server-only), `AI_PROVIDER="anthropic"`, `AI_MODEL_FAST`, `AI_MODEL_SMART` (เลือกรุ่นต่อ task โดยไม่แก้โค้ด), `AI_REQUEST_TIMEOUT_MS` |
| อ่านผ่าน | `ConfigService` (pattern `mail.service.ts:27`) — ห้ามอ่าน `process.env` ตรงในโค้ด business |
| ใครตั้งค่าได้ | **owner/ผู้ดูแล deploy เท่านั้น** ผ่าน env ของ server — **ไม่ใช่** per-user/per-project key ใน UI (v1) เพราะจะเปิด attack surface (เก็บ key ของ user, เข้ารหัส, จัดการ rotation) ที่ solo dev ยังไม่ควรแบกใน sprint แรก |
| ว่าง = ปิดฟีเจอร์ | `AI_API_KEY` ว่าง → endpoint ตอบ 503, ปุ่มฝั่ง client disabled (graceful) เหมือน OAuth/Supabase |

> **ความเสี่ยงที่ security-engineer ต้องระบุ:** key ตัวเดียวใช้ร่วมทุก project = ถ้า key leak กระทบทุกคน → ต้องมี rotation runbook + จำกัดสิทธิ์ key ที่ provider (spending cap ฝั่ง vendor)

### 4) ขอบเขต v1 — **ทำ 3 mode พร้อมกัน แต่ scope แคบที่ "selection-based" เท่านั้น**

**ฟันธง:** v1 = **สรุป + ปรับสำนวน + แปล th↔en ครบทั้ง 3** — เพราะทั้งสามใช้ **สถาปัตยกรรมเดียวกันทุกอย่าง** (endpoint เดียว, diff drawer เดียว, ต่างแค่ `mode` + prompt template) การตัด mode ใดออกไม่ได้ลด engineering surface อย่างมีนัยสำคัญ แต่ลด value ที่ owner ขอ

**สิ่งที่อยู่ใน v1:**
- Input = **selection ที่ไฮไลต์เท่านั้น** (ไม่ใช่ทั้งเอกสาร, ไม่ใช้เนื้อหาจาก user อื่นเป็น context) — ตัดความเสี่ยง prompt injection + PII egress ลงมากที่สุด (ดูข้อ 5)
- Output = diff proposal, apply ด้วยการ replace selection

**สิ่งที่ **ตัด**ออกจาก v1 (ทิ้งเป็น future work):**
- "AI รู้บริบททั้งเอกสาร/ทั้ง project" (RAG/context stuffing) — เพิ่มทั้ง PII egress, cost, และ prompt-injection surface มหาศาล ต้อง threat model แยก
- Per-user/per-project API key ใน UI
- Streaming ghost-text แบบ inline autocomplete ในตัว editor (แตะ Yjs/collab path โดยตรง = เสี่ยงชน real-time)

### 5) ความเสี่ยง security ที่ `security-engineer` ต้องทำ threat model ต่อ (ก่อนเขียน SRS)

ADR นี้ **ไม่ปิดงาน** — เป็น gate ที่ต้องส่งต่อ security-engineer สิ่งที่ต้องตรวจ:

1. **Data egress / PII:** เอกสารอาจมีข้อมูลลับของสมาชิก project ที่ถูกส่งไป third-party
   - ยืนยัน DPA + zero/limited retention เป็นลายลักษณ์อักษรกับ provider
   - v1 จำกัด input = selection เท่านั้น (ADR ตัดสินแล้ว) — security ต้องยืนยันว่าเพียงพอ หรือต้องมี consent/notice ให้ user รู้ว่าข้อความจะถูกส่งออก
   - ต้องมี data-residency requirement หรือไม่ (ถ้า owner มีลูกค้าที่ต้องการ region เฉพาะ)
2. **Prompt injection ผ่านเนื้อหาเอกสาร:** เนื้อหาที่ user อื่นพิมพ์ร่วมกันอาจฝังคำสั่ง (เช่น "ignore instructions and…") — แม้ v1 ส่งเฉพาะ selection ก็ยัง inject ได้ผ่านข้อความที่ถูกเลือก
   - ต้องออกแบบ prompt ให้แยก system instruction ออกจาก user content ชัดเจน + ไม่ให้ AI output ทำ action ใด ๆ (output เป็น text proposal อย่างเดียว ไม่มี tool/agent)
3. **Error message ไม่ leak internal:** error จาก provider/timeout ต้อง map เป็น message กลาง (th/en) ไม่ส่ง raw provider error / stack / model name / key hint กลับ client
4. **Cost-abuse เป็น security concern:** ยืนยันว่า throttle + quota (ข้อ 2.3) กัน DoS-by-cost ได้ + spending cap ฝั่ง vendor เป็น backstop
5. **Authz:** ยืนยัน `@MinRole(Editor)` ถูกต้อง และ Viewer เรียก AI endpoint ไม่ได้ (server-side ตามกฎเหล็กข้อ 1)

---

## Consequences

**บวก:**
- ไม่มี runtime ที่ 2 (ยึด ADR 0003), key ปลอดภัยฝั่ง server, reuse pattern เดิมเกือบทั้งหมด (module, config, throttler, 503-degrade, DiffView) → engineering surface ต่ำสำหรับ solo dev
- diff-first = สอดคล้อง identity ของแอป, non-blocking = ไม่ชน real-time
- abstraction ผ่าน `ai` SDK = สลับ provider ได้ถ้า security/cost บังคับ

**ลบ / ต้องระวัง:**
- ผูกกับ vendor ภายนอก → ต้องจัดการ retention/DPA, cost, rotation runbook
- ต้องรอ security-engineer + owner ratify (provider + งบ + retention) ก่อนเขียน SRS — **บล็อกการเริ่ม dev**
- ต้องเพิ่ม dependency ใหม่ (`ai`, `@ai-sdk/anthropic`) — เป็นข้อยกเว้นที่ ADR 0003 อนุญาตไว้แล้ว

**ต้องตัดสินใจต่อ (owner/security ก่อน SRS):**
1. Owner: เลือก provider เชิงพาณิชย์ (default Claude) + งบต่อเดือน + ตัวเลข quota/rate จริง
2. Owner: ยอมรับความเสี่ยง data-egress + จัดหา DPA/retention จาก provider
3. security-engineer: threat model ตามข้อ 5 → ออก security requirement ให้ SRS

---

### 🤝 HANDOFF

**จาก:** fullstack-architect-mentor (Tech Lead) — ADR only, ไม่แตะโค้ด
**ไฟล์ผลงาน:** `docs/decisions/0007-ai-writing-assist.md` (commit ไฟล์เดียว, ไม่ push)

**ถึง (ขนานกันได้):**
- **owner/PM** — ratify: provider (default = Anthropic Claude), งบ + quota, ยอมรับ data-egress + จัดหา DPA
- **`security-engineer`** — threat model ตาม §5 (data egress/PII, prompt injection, error-leak, cost-abuse, authz) → ส่ง security requirement เข้า SRS
- **`srs-architect`** (หลัง 2 ข้อบนเสร็จ) — เขียน SRS จากสถาปัตยกรรม §2 + ขอบเขต v1 §4

**ยังไม่เริ่ม dev จนกว่า:** owner ratify + security-engineer เคลียร์ §5 (เป็น gate ตาม candidate doc §3)
