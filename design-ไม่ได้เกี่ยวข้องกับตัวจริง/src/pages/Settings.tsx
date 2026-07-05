// PAGE 7 — Settings. Two columns: section nav (left) + content (right).
import { useState } from 'react'
import { Shell } from '../components/Shell'
import { Icon } from '../lib/icons'
import { Card, Button, Input, Field, Toggle, Segmented, Banner } from '../components/ui'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { cn } from '../lib/cn'

const sections = [
  { id: 'theme', label: 'ธีม & การแสดงผล' },
  { id: 'account', label: 'บัญชี' },
  { id: 'notify', label: 'การแจ้งเตือน' },
  { id: 'privacy', label: 'ความเป็นส่วนตัว' },
  { id: 'language', label: 'ภาษา' },
  { id: 'a11y', label: 'การเข้าถึง' },
  { id: 'data', label: 'ข้อมูล & พื้นที่' },
  { id: 'danger', label: 'Danger zone' },
]

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div><p className="text-sm font-medium text-ink">{title}</p>{desc && <p className="text-[12px] text-muted">{desc}</p>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-1 font-heading text-lg font-semibold">{title}</h2>
      <div className="divide-y divide-line">{children}</div>
    </Card>
  )
}

export default function Settings() {
  const [active, setActive] = useState('theme')
  const [n1, setN1] = useState(true); const [n2, setN2] = useState(true); const [n3, setN3] = useState(false)
  const [lang, setLang] = useState<'th' | 'en'>('th')
  const [contrast, setContrast] = useState(false)
  const [font, setFont] = useState<'sm' | 'md' | 'lg'>('md')

  return (
    <Shell title="ตั้งค่า">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-5 font-heading text-2xl font-semibold">ตั้งค่า</h1>
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          {/* section nav */}
          <nav className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
            {sections.map((s) => (
              <button key={s.id} onClick={() => setActive(s.id)}
                className={cn('whitespace-nowrap rounded-xl px-3 py-2 text-left text-[13.5px] font-medium transition',
                  active === s.id ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-ink/5 hover:text-ink',
                  s.id === 'danger' && active !== s.id && 'text-danger/80')}>
                {s.label}
              </button>
            ))}
          </nav>

          <div className="space-y-5">
            {active === 'theme' && (
              <SectionCard title="ธีมสี">
                <div className="py-3.5"><p className="mb-3 text-[12px] text-muted">เปลี่ยนทันที — มีให้เลือก 6 ธีม</p><ThemeSwitcher /></div>
              </SectionCard>
            )}
            {active === 'account' && (
              <SectionCard title="บัญชี">
                <div className="py-3.5"><Field label="Username"><Input defaultValue="Me" /></Field></div>
                <div className="py-3.5"><Field label="เปลี่ยนรหัสผ่าน"><Button variant="secondary" size="sm">ตั้งรหัสผ่านใหม่</Button></Field></div>
                <Row title="บัญชี Google" desc="me@gmail.com — เชื่อมต่อแล้ว"><Button variant="secondary" size="sm">ยกเลิกการเชื่อมต่อ</Button></Row>
                <Row title="ออกจากระบบ"><Button variant="ghost" size="sm"><Icon.logout width={16} height={16} /> Logout</Button></Row>
              </SectionCard>
            )}
            {active === 'notify' && (
              <SectionCard title="การแจ้งเตือน">
                <Row title="อีเมล" desc="สรุปกิจกรรมและคำเชิญทางอีเมล"><Toggle checked={n1} onChange={setN1} /></Row>
                <Row title="ในแอป" desc="แจ้งเตือนแบบเรียลไทม์ในแอป"><Toggle checked={n2} onChange={setN2} /></Row>
                <Row title="เมื่อมีคนแก้งานของเรา"><Toggle checked={n3} onChange={setN3} /></Row>
              </SectionCard>
            )}
            {active === 'privacy' && (
              <SectionCard title="ความเป็นส่วนตัว">
                <Row title="ใครเชิญเราได้"><Segmented value="anyone" onChange={() => {}} options={[{ value: 'anyone', label: 'ทุกคน' }, { value: 'team', label: 'เฉพาะทีม' }]} /></Row>
                <Row title="ใครเห็น project ของเราได้"><Segmented value="members" onChange={() => {}} options={[{ value: 'members', label: 'สมาชิก' }, { value: 'me', label: 'เฉพาะฉัน' }]} /></Row>
              </SectionCard>
            )}
            {active === 'language' && (
              <SectionCard title="ภาษา">
                <Row title="ภาษาของแอป"><Segmented value={lang} onChange={setLang} options={[{ value: 'th', label: 'ไทย' }, { value: 'en', label: 'English' }]} /></Row>
              </SectionCard>
            )}
            {active === 'a11y' && (
              <SectionCard title="การเข้าถึง">
                <Row title="ขนาดฟอนต์"><Segmented value={font} onChange={setFont} options={[{ value: 'sm', label: 'เล็ก' }, { value: 'md', label: 'ปกติ' }, { value: 'lg', label: 'ใหญ่' }]} /></Row>
                <Row title="โหมดคอนทราสต์สูง"><Toggle checked={contrast} onChange={setContrast} /></Row>
                <Row title="ลดการเคลื่อนไหว" desc="ปฏิบัติตามค่าระบบ (prefers-reduced-motion)"><Toggle checked onChange={() => {}} disabled /></Row>
              </SectionCard>
            )}
            {active === 'data' && (
              <SectionCard title="ข้อมูล & พื้นที่จัดเก็บ">
                <div className="py-3.5">
                  <p className="text-sm font-medium">ใช้ไป 2.4 GB จาก 10 GB</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div className="h-full w-[24%] rounded-full bg-primary" /></div>
                </div>
                <Row title="จัดการไฟล์ที่อัปโหลด"><Button variant="secondary" size="sm">ดูไฟล์</Button></Row>
              </SectionCard>
            )}
            {active === 'danger' && (
              <Card className="border-danger/30 p-5">
                <h2 className="mb-1 font-heading text-lg font-semibold text-danger">Danger zone</h2>
                <div className="mt-2"><Banner tone="warn">การกระทำเหล่านี้ไม่สามารถย้อนกลับได้</Banner></div>
                <div className="divide-y divide-line">
                  <Row title="ออกจากระบบทุกอุปกรณ์"><Button variant="secondary" size="sm">ออกจากระบบทั้งหมด</Button></Row>
                  <Row title="ลบบัญชีถาวร" desc="ข้อมูลทั้งหมดจะถูกลบหลัง 30 วัน"><Button variant="danger" size="sm">ลบบัญชี</Button></Row>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}
