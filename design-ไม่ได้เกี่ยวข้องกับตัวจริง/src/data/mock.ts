// Mock content for the prototype. Real copy (not lorem) so empty/filled states
// read like the real product. Bilingual TH/EN to mirror the brief.

export const presenceColors: Record<string, string> = {
  A: '#f08a8a', B: '#e9c46a', C: '#82d178', D: '#5fc9d6', E: '#6d5bd0', F: '#e08ad0',
}

export type Project = {
  id: string
  name: string
  about: string
  owner: string
  ownerInitial: string
  members: { initial: string; key: string }[]
  updatedAt: string
  pinned?: boolean
  mine?: boolean
}

export const projects: Project[] = [
  { id: 'p1', name: 'Q3 Marketing Report', about: 'รวมผลแคมเปญไตรมาส 3 และแผนสื่อสารสำหรับเปิดตัวสินค้าใหม่', owner: 'Me', ownerInitial: 'M', members: [{ initial: 'M', key: 'E' }, { initial: 'N', key: 'A' }, { initial: 'P', key: 'C' }], updatedAt: '2 ชั่วโมงที่แล้ว', pinned: true, mine: true },
  { id: 'p2', name: 'Onboarding Handbook', about: 'คู่มือพนักงานใหม่ ฉบับปรับปรุง 2026 — ครอบคลุมขั้นตอนและนโยบาย', owner: 'Me', ownerInitial: 'M', members: [{ initial: 'M', key: 'E' }, { initial: 'K', key: 'B' }], updatedAt: 'เมื่อวาน', mine: true },
  { id: 'p3', name: 'Research: User Interviews', about: 'บันทึกบทสัมภาษณ์ผู้ใช้ 12 คน พร้อมสรุปประเด็นและ insight สำคัญ', owner: 'Nicha', ownerInitial: 'N', members: [{ initial: 'N', key: 'A' }, { initial: 'M', key: 'E' }, { initial: 'J', key: 'D' }, { initial: 'T', key: 'F' }], updatedAt: '3 วันที่แล้ว' },
  { id: 'p4', name: 'Annual Budget Plan', about: 'แผนงบประมาณประจำปี แยกตามแผนกและไตรมาส', owner: 'Me', ownerInitial: 'M', members: [{ initial: 'M', key: 'E' }], updatedAt: '5 วันที่แล้ว', mine: true },
  { id: 'p5', name: 'Design Critique Notes', about: 'สรุป feedback จากรอบรีวิวดีไซน์ และ action items ที่ต้องแก้', owner: 'Kan', ownerInitial: 'K', members: [{ initial: 'K', key: 'B' }, { initial: 'M', key: 'E' }], updatedAt: '1 สัปดาห์ที่แล้ว' },
  { id: 'p6', name: 'Product Roadmap 2026', about: 'แผนผลิตภัณฑ์รายไตรมาส เป้าหมาย และ milestone หลัก', owner: 'Praew', ownerInitial: 'P', members: [{ initial: 'P', key: 'C' }, { initial: 'M', key: 'E' }, { initial: 'N', key: 'A' }], updatedAt: '2 สัปดาห์ที่แล้ว' },
]

export type Update = {
  id: string
  project: string
  file: string
  summary: string
  by?: string
  byKey?: string
  timestamp: string
  added: number
  removed: number
  scope?: 'owner' | 'member'
}

export const myUpdates: Update[] = [
  { id: 'u1', project: 'Q3 Marketing Report', file: 'Executive Summary', summary: 'ปรับบทสรุปผู้บริหารใหม่ เพิ่มตัวเลข ROI ของแคมเปญหลัก และลบย่อหน้าที่ซ้ำซ้อนออก', timestamp: 'วันนี้ 14:32', added: 24, removed: 8 },
  { id: 'u2', project: 'Onboarding Handbook', file: 'Leave Policy', summary: 'อัปเดตนโยบายวันลาให้ตรงกับระเบียบใหม่ปี 2026 และเพิ่มตารางสรุปสิทธิ์การลา', timestamp: 'เมื่อวาน 09:15', added: 41, removed: 3 },
  { id: 'u3', project: 'Annual Budget Plan', file: 'Q1 Breakdown', summary: 'แก้ตัวเลขงบการตลาดไตรมาส 1 และเพิ่มหมายเหตุอธิบายการปรับเปลี่ยน', timestamp: '23 มิ.ย. 16:40', added: 6, removed: 14 },
]

export const projectChanges: Update[] = [
  { id: 'c1', project: 'Research: User Interviews', file: 'Interview #07', summary: 'เพิ่มสรุปบทสัมภาษณ์ผู้ใช้คนที่ 7 และไฮไลต์ pain point เรื่องการค้นหาไฟล์', by: 'Nicha', byKey: 'A', timestamp: 'วันนี้ 11:02', added: 52, removed: 0, scope: 'member' },
  { id: 'c2', project: 'Q3 Marketing Report', file: 'Channel Plan', summary: 'ปรับแผนช่องทางสื่อ ลบช่องที่ ROI ต่ำออก และเพิ่มงบไปที่ social', by: 'Praew', byKey: 'C', timestamp: 'วันนี้ 10:20', added: 18, removed: 22, scope: 'owner' },
  { id: 'c3', project: 'Design Critique Notes', file: 'Round 2', summary: 'เพิ่ม action items จากรอบรีวิวที่สอง พร้อมระบุผู้รับผิดชอบแต่ละข้อ', by: 'Kan', byKey: 'B', timestamp: 'เมื่อวาน 17:45', added: 30, removed: 5, scope: 'member' },
]

export const diffSample = {
  file: 'Executive Summary.tbx',
  hunks: [
    { header: '@@ -12,7 +12,9 @@ Overview', lines: [
      { type: 'ctx', n1: 12, n2: 12, text: 'แคมเปญไตรมาส 3 มุ่งเน้นการเข้าถึงกลุ่มลูกค้าใหม่' },
      { type: 'ctx', n1: 13, n2: 13, text: 'ผ่านช่องทางดิจิทัลเป็นหลัก โดยมีเป้าหมายดังนี้:' },
      { type: 'del', n1: 14, text: '- เพิ่ม awareness 15% ภายในสิ้นไตรมาส' },
      { type: 'add', n2: 14, text: '+ เพิ่ม awareness 22% ภายในสิ้นไตรมาส (ปรับตามผลจริง)' },
      { type: 'add', n2: 15, text: '+ ROI เฉลี่ยของแคมเปญหลักอยู่ที่ 3.4x เกินเป้า 2.8x' },
      { type: 'ctx', n1: 15, n2: 16, text: 'งบประมาณรวมที่ใช้ไปคิดเป็น 92% ของที่ตั้งไว้' },
    ]},
    { header: '@@ -28,4 +30,3 @@ Next steps', lines: [
      { type: 'ctx', n1: 28, n2: 30, text: 'แผนการดำเนินงานต่อในไตรมาสถัดไป:' },
      { type: 'del', n1: 29, text: '- ทบทวนช่องทางที่ผลตอบรับต่ำอีกครั้ง' },
      { type: 'del', n1: 30, text: '- จัดประชุมสรุปกับทีมขายภายในสองสัปดาห์' },
      { type: 'add', n2: 32, text: '+ ยุติช่องทางที่ ROI ต่ำกว่า 1.5x และโยกงบไป social' },
    ]},
  ],
}

export type FileNode = {
  id: string
  name: string
  kind: 'parent' | 'kid' | 'box'
  orientation?: 'portrait' | 'landscape'
  updated?: string
  children?: FileNode[]
}

export const fileTree: FileNode[] = [
  { id: 'f1', name: 'รายงานหลัก (Main Report)', kind: 'parent', updated: '2 ชม.', children: [
    { id: 'f1a', name: 'บทนำ', kind: 'kid', orientation: 'portrait', updated: '2 ชม.' },
    { id: 'f1b', name: 'ผลการดำเนินงาน', kind: 'kid', orientation: 'portrait', updated: 'เมื่อวาน' },
    { id: 'f1c', name: 'ตารางงบประมาณ', kind: 'kid', orientation: 'landscape', updated: '3 วัน' },
  ]},
  { id: 'f2', name: 'ภาคผนวก (Appendix)', kind: 'parent', updated: '1 สัปดาห์', children: [
    { id: 'f2a', name: 'ข้อมูลดิบ', kind: 'kid', orientation: 'landscape', updated: '1 สัปดาห์' },
    { id: 'f2b', name: 'แหล่งอ้างอิง', kind: 'kid', orientation: 'portrait', updated: '1 สัปดาห์' },
    { id: 'f2box', name: 'ไฟล์แนบ & อ้างอิง', kind: 'box', updated: '1 สัปดาห์' },
  ]},
]

export const notifications = [
  { id: 'n1', key: 'A', who: 'Nicha', text: 'เชิญคุณเข้าร่วม “Research: User Interviews”', time: '5 นาที', unread: true },
  { id: 'n2', key: 'C', who: 'Praew', text: 'แก้ไข “Channel Plan” ใน Q3 Marketing Report', time: '1 ชม.', unread: true },
  { id: 'n3', key: 'B', who: 'Kan', text: 'แสดงความเห็นในเอกสารของคุณ', time: '3 ชม.', unread: false },
]
