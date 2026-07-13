# UI Guidelines — Anti-AI-Slop (Task Board)

> **บังคับอ่านก่อนงาน UI ทุกชิ้นใน Sprint 4+.** เป้าหมาย: UI ดู "มีคนตัดสินใจ" ไม่ใช่ค่าเฉลี่ยที่ AI เลือกเมื่อไม่มีทิศทาง. หลักการ: **commit ทิศทางเดียว + ล็อก token + ใช้ของที่มี** — ห้ามคิด aesthetic ใหม่รายหน้า.

## ทิศทางที่ล็อกแล้ว (ห้ามเปลี่ยนโดยพลการ)

Task Board = **เครื่องมือเขียน/รีวิวรายงานร่วมกัน สองภาษา** — โทน **calm, editorial, document-first** เหมือน Google Docs/Linear ไม่ใช่ landing-page SaaS. ความน่าเชื่อถือ > ความหวือหวา.

## Design Tokens (ใช้ชื่อ token เท่านั้น — ห้าม hardcode hex / arbitrary values)

| กลุ่ม | ใช้ | ห้าม |
|---|---|---|
| **สี** | Tailwind semantic จาก `--c-*`: `primary`/`ink`/`paper`/`card`/`line`/`muted`/`subtle`, diff `add-*`/`del-*`, `warn`/`danger`/`success`. รองรับ 12 ธีม (6 accent × light/dark) อัตโนมัติ | hex ตรง ๆ, สีนอกระบบ, พื้นดำ/ขาวล้วน, gradient ม่วง→น้ำเงิน |
| **Type** | scale ที่มี: `text-display/h2/h3/body/body-sm/caption/label`. font: `font-heading`(Sora) หัวข้อ, `font-body`(Inter) เนื้อหา, ไทยได้ Noto Sans Thai อัตโนมัติ | `text-[Npx]` arbitrary ใหม่, Inter เป็น headline |
| **Radius** | `rounded-lg`(14) / `xl`(18) / `2xl`(22) | มนเกินจนดูของเล่น (`rounded-full` กับการ์ด), เหลี่ยมคมทั้งหน้า |
| **Shadow** | `shadow-soft` = การ์ด static (default), `shadow-card` = คลิกได้ (`Card interactive`), `shadow-pop` = overlay/menu | ขอบเทา 1px เท่ากันทุกใบ → ใช้ shadow/พื้นหลัง (`bg-card` บน `bg-paper`) แยกชั้นแทน |
| **Motion** | `animate-fade`/`animate-pop` (มี `both` กัน blank), transition ~200-300ms ตอน hover เท่าที่มีความหมาย, เคารพ `prefers-reduced-motion` | animation ฟุ่มเฟือย, เด้งทุกอย่าง |

## กฎ Anti-Slop (ตรวจทุกครั้ง)

1. **1 signature ต่อฟีเจอร์** — หาองค์ประกอบเด่นที่มาจากเนื้อหาจริง (เช่น comment thread ที่ผูกกับ diff) ไม่ใช่ของตกแต่งลอย ๆ
2. **หลีกเลี่ยง AI tell**: การ์ด feature 3 ใบเรียงแถว, เลขนำ 01/02/03 ที่ไม่ใช่ลำดับจริง, gradient demo, boilerplate ที่ไม่ปรับ
3. **ออกแบบ state ให้ครบตั้งแต่แรก**: `focus-visible` (ring), disabled, error, **empty** (Task Board มี empty state pattern เช่น 2 แบบใน Activity), loading (**Skeleton** ไม่ใช่ spinner/ข้อความเปล่า)
4. **contrast จริง** — ตรวจ WCAG AA ทั้ง light+dark (โปรเจกต์เคยผ่าน 96/96 — อย่าให้ถอย)
5. **โครงสร้าง**: white space พอดี, hierarchy ชัด (หนา=สำคัญ, บาง=รอง), ไม่แออัด
6. **a11y**: clickable = `<button>`/`<a>` จริง (ห้าม `<div onClick>`), มี `aria-label`/`aria-current` ตามควร
7. **Self-critique ก่อนส่ง**: ระบุ 3 จุดที่ยัง "ดู AI ทำ" แล้วแก้ก่อนส่ง

## Prompt block (แปะให้ agent UI ทุกตัวใน Sprint 4)

```
ก่อนเขียน/แก้ UI ใด ๆ อ่าน design/UI_GUIDELINES.md แล้วทำตามนี้:
- ใช้ design token ที่ล็อกไว้เท่านั้น (Tailwind semantic colors จาก --c-*, type scale
  text-display..label, radius lg/xl/2xl, shadow soft/card/pop) — ห้าม hex/arbitrary ใหม่
- ทิศทาง = calm editorial document-tool สองภาษา ไม่ใช่ generic SaaS/landing
- ห้าม AI tell: gradient ม่วง-น้ำเงิน, การ์ดขอบ 1px เท่ากันหมด (ใช้ shadow/bg แยกชั้น),
  3-feature-card, เลข 01/02/03 ปลอม, rounded มนเกิน
- ออกแบบครบทุก state (focus-visible/disabled/error/empty/loading=Skeleton) ตั้งแต่แรก
- clickable เป็น <button>/<a> จริง + a11y + contrast AA ทั้ง light/dark
- ก่อนส่ง: บอก 3 จุดที่ยังดู AI-generated แล้วแก้จริง
ถ้าเจ้าของระบุสไตล์เจาะจงไว้แล้ว → ทำตามนั้นเป๊ะ (คำสั่งเจ้าของชนะ token default)
```

## Concise output (ใช้กับทุก agent)

ตอบตรงประเด็น ไม่มีคำนำ/ไม่ทวนคำถาม/ไม่สรุปซ้ำท้าย, ใช้ bullet/ตารางแทนย่อหน้ายาว, โค้ดให้เฉพาะส่วนที่แก้ + comment เฉพาะจุดที่ไม่ตรงไปตรงมา. ยกเว้นเมื่อ task ต้องการความละเอียดจริง.

---
_อ้างอิง: anti-ai-slop-ui-skill + concise-output-skill (ผู้ใช้จัดหา), frontend-design pattern, `design/DESIGN_SPEC.md` (Sprint 3 tokens)_
