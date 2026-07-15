// Report templates (Sprint 4). Static, code-owned seed content — NOT user-editable and
// not stored in the DB (see docs/decisions/0003-tech-stack-sprint4.md #4). When a file is
// created from a template we duplicate the locale-matched HTML string into `File.content`;
// the editor then seeds the Yjs doc from it via the existing legacy-seed path in
// CollabEditor. Each template ships a hand-written th + en body (no machine translation).
import type { Language } from '../i18n'

export type TemplateId = 'blank' | 'progress' | 'meeting' | 'proposal'

export interface ReportTemplate {
  id: TemplateId
  /** i18n key under `templates.*` for the card label. */
  labelKey: string
  /** i18n key for the short card description. */
  descKey: string
  /** Locale-specific HTML seed. `blank` intentionally seeds nothing. */
  content: Record<Language, string>
}

// Kept deliberately small: headings + a couple of prompts so the page isn't blank, without
// dictating the whole document. Structure mirrors the editor's own HTML (h1/h2/p/ul, and a
// TipTap taskList for action items) so it round-trips cleanly through getHTML()/PDF export.
const progressTh = `<h1>รายงานความคืบหน้า</h1>
<p><strong>ช่วงเวลา:</strong> </p>
<p><strong>ผู้รายงาน:</strong> </p>
<h2>สรุปภาพรวม</h2>
<p>สรุปสั้น ๆ ว่าช่วงนี้คืบหน้าอะไรบ้าง</p>
<h2>งานที่ทำเสร็จ</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>ตัวอย่างงานที่เสร็จแล้ว</p></div></li></ul>
<h2>กำลังดำเนินการ / ขั้นตอนถัดไป</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>งานที่ต้องทำต่อ</p></div></li></ul>
<h2>ปัญหา / อุปสรรค</h2>
<p>อุปสรรคที่พบและสิ่งที่ต้องการการสนับสนุน</p>`

const progressEn = `<h1>Progress Report</h1>
<p><strong>Period:</strong> </p>
<p><strong>Reported by:</strong> </p>
<h2>Summary</h2>
<p>A short summary of what moved forward this period</p>
<h2>Completed</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Example of a completed item</p></div></li></ul>
<h2>In progress / Next steps</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Work still to do</p></div></li></ul>
<h2>Blockers</h2>
<p>Blockers encountered and where you need support</p>`

const meetingTh = `<h1>สรุปการประชุม</h1>
<p><strong>วันที่:</strong> </p>
<p><strong>ผู้เข้าร่วม:</strong> </p>
<h2>วาระการประชุม</h2>
<ul><li>หัวข้อที่ 1</li><li>หัวข้อที่ 2</li></ul>
<h2>ประเด็นสำคัญ</h2>
<p>สรุปสิ่งที่พูดคุยและมติที่ได้</p>
<h2>สิ่งที่ต้องทำต่อ (Action items)</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>ผู้รับผิดชอบ — งานที่ต้องทำ — กำหนดเสร็จ</p></div></li></ul>`

const meetingEn = `<h1>Meeting Notes</h1>
<p><strong>Date:</strong> </p>
<p><strong>Attendees:</strong> </p>
<h2>Agenda</h2>
<ul><li>Topic 1</li><li>Topic 2</li></ul>
<h2>Key points</h2>
<p>Summary of the discussion and decisions made</p>
<h2>Action items</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Owner — task — due date</p></div></li></ul>`

const proposalTh = `<h1>ข้อเสนอโครงการ</h1>
<p><strong>ผู้เสนอ:</strong> </p>
<h2>ที่มาและปัญหา</h2>
<p>อธิบายปัญหาที่ต้องการแก้และเหตุผลที่ควรทำโครงการนี้</p>
<h2>วัตถุประสงค์</h2>
<ul><li>เป้าหมายที่วัดผลได้ข้อ 1</li><li>เป้าหมายที่วัดผลได้ข้อ 2</li></ul>
<h2>ขอบเขตงาน</h2>
<p>สิ่งที่อยู่ในและนอกขอบเขตของโครงการ</p>
<h2>ระยะเวลาและทรัพยากร</h2>
<p>ช่วงเวลาโดยประมาณ งบประมาณ และทีมที่เกี่ยวข้อง</p>`

const proposalEn = `<h1>Project Proposal</h1>
<p><strong>Proposed by:</strong> </p>
<h2>Background &amp; problem</h2>
<p>Describe the problem to solve and why this project is worth doing</p>
<h2>Objectives</h2>
<ul><li>Measurable goal 1</li><li>Measurable goal 2</li></ul>
<h2>Scope</h2>
<p>What is in and out of scope for this project</p>
<h2>Timeline &amp; resources</h2>
<p>Rough timeline, budget, and the team involved</p>`

export const REPORT_TEMPLATES: ReportTemplate[] = [
  { id: 'blank', labelKey: 'templates.blank', descKey: 'templates.blankDesc', content: { th: '', en: '' } },
  { id: 'progress', labelKey: 'templates.progress', descKey: 'templates.progressDesc', content: { th: progressTh, en: progressEn } },
  { id: 'meeting', labelKey: 'templates.meeting', descKey: 'templates.meetingDesc', content: { th: meetingTh, en: meetingEn } },
  { id: 'proposal', labelKey: 'templates.proposal', descKey: 'templates.proposalDesc', content: { th: proposalTh, en: proposalEn } },
]

/** Resolve a template's seed body for the given UI language. Unknown ids → '' (blank). */
export function templateContent(id: TemplateId, lang: Language): string {
  const tpl = REPORT_TEMPLATES.find((t) => t.id === id)
  return tpl?.content[lang] ?? ''
}
