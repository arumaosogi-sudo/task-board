// DELIVERABLE 1 — Design System page: tokens + component library.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../lib/icons'
import {
  Button, Input, PasswordInput, Field, Card, Tag, Toggle, Avatar, AvatarStack,
  Menu, MenuItem, Modal, EmptyState, Skeleton, Segmented, Banner,
} from '../components/ui'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { DiffView } from '../components/DiffView'

const colorTokens = [
  ['--c-primary', 'Primary', 'bg-primary'], ['--c-primary-soft', 'Primary soft', 'bg-primary-soft'],
  ['--c-ink', 'Ink / text', 'bg-ink'], ['--c-nav', 'Nav', 'bg-nav'],
  ['--c-paper', 'Paper', 'bg-paper'], ['--c-card', 'Card', 'bg-card'],
  ['--c-line', 'Line', 'bg-line'], ['--c-muted', 'Muted', 'bg-muted'],
  ['--c-add-bg', 'Diff add', 'bg-add-bg'], ['--c-del-bg', 'Diff remove', 'bg-del-bg'],
]
const typeScale = [
  ['Display', 'text-[36px] font-heading font-bold', 'Sora 36/Bold'],
  ['Heading 1', 'text-[28px] font-heading font-semibold', 'Sora 28/Semibold'],
  ['Heading 2', 'text-[22px] font-heading font-semibold', 'Sora 22/Semibold'],
  ['Title', 'text-[18px] font-heading font-medium', 'Sora 18/Medium'],
  ['Body', 'text-[14px] font-body', 'Inter 14/Regular'],
  ['Small', 'text-[12px] font-body text-muted', 'Inter 12/Regular'],
  ['Mono', 'text-[13px] font-mono', 'JetBrains Mono 13'],
]

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      <Card className="p-6">{children}</Card>
    </section>
  )
}

export default function DesignSystem() {
  const [toggle, setToggle] = useState(true)
  const [seg, setSeg] = useState('a')
  const [modal, setModal] = useState(false)

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-card/85 px-6 backdrop-blur">
        <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-primary-fg font-heading font-bold">T</span>
        <div><h1 className="font-heading text-[15px] font-semibold leading-tight">Task Board — Design System</h1>
          <p className="text-[11px] text-muted">Tokens · Components · Themes</p></div>
        <Link to="/gallery" className="ml-auto"><Button variant="secondary" size="sm">ดูทุกหน้าจอ →</Button></Link>
      </header>

      <div className="mx-auto max-w-5xl space-y-10 px-6 py-8">
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted">
          ระบบดีไซน์สำหรับ <b className="text-ink">Task Board</b> — workspace สะอาด พื้นกระดาษนวล
          ตัด accent ม่วงอย่างมีวินัย สเกลชัดเจน ฟอนต์ Sora/Inter/Noto Sans Thai รองรับ 2 ภาษา
          ทุกสีคุมด้วย CSS variables เปลี่ยนธีมได้ทันที (6 ธีม) radius 14px เงานุ่ม.
        </p>

        <Block title="ธีม (Themeable · 6 สี)">
          <ThemeSwitcher />
        </Block>

        <Block title="สี (Color tokens)">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {colorTokens.map(([v, l, bg]) => (
              <div key={v}>
                <div className={`h-16 rounded-xl border border-line ${bg}`} />
                <p className="mt-1.5 text-[12px] font-medium text-ink">{l}</p>
                <p className="font-mono text-[10px] text-subtle">{v}</p>
              </div>
            ))}
          </div>
        </Block>

        <Block title="ตัวอักษร (Typography)">
          <div className="space-y-3">
            {typeScale.map(([l, cls, meta]) => (
              <div key={l} className="flex items-baseline justify-between gap-4 border-b border-line pb-3 last:border-0">
                <span className={cls as string}>{l} · สวัสดี Aa</span>
                <span className="shrink-0 font-mono text-[11px] text-subtle">{meta}</span>
              </div>
            ))}
          </div>
        </Block>

        <Block title="ระยะ & รัศมี (Spacing · Radius)">
          <div className="flex flex-wrap items-end gap-3">
            {[4, 8, 12, 16, 24, 32].map((s) => (
              <div key={s} className="text-center"><div className="bg-primary-soft" style={{ width: s, height: s }} /><p className="mt-1 font-mono text-[10px] text-subtle">{s}</p></div>
            ))}
            <span className="mx-3 h-10 w-px bg-line" />
            {[['8', 'rounded-lg'], ['14', 'rounded-xl'], ['999', 'rounded-full']].map(([r, cls]) => (
              <div key={r} className="text-center"><div className={`size-12 border-2 border-primary ${cls}`} /><p className="mt-1 font-mono text-[10px] text-subtle">{r}px</p></div>
            ))}
          </div>
        </Block>

        <Block title="ปุ่ม (Buttons)">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="google">Continue with Google</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button size="sm">Small</Button><Button size="md">Medium</Button><Button size="lg">Large</Button>
          </div>
        </Block>

        <Block title="อินพุต (Inputs)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default"><Input placeholder="ข้อความ…" /></Field>
            <Field label="With icon"><Input icon={<Icon.search width={18} height={18} />} placeholder="ค้นหา…" /></Field>
            <Field label="Password (toggle)"><PasswordInput placeholder="••••••" /></Field>
            <Field label="Error" error="ข้อมูลไม่ถูกต้อง"><Input state="error" defaultValue="bad" /></Field>
            <Field label="Success" success="ใช้ได้"><Input state="success" defaultValue="ok" /></Field>
          </div>
        </Block>

        <Block title="แท็ก · Toggle · Segmented · Avatar">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-2"><Tag>neutral</Tag><Tag tone="primary">primary</Tag><Tag tone="add">+24</Tag><Tag tone="del">−8</Tag><Tag tone="warn">warn</Tag></div>
            <Toggle checked={toggle} onChange={setToggle} />
            <Segmented value={seg} onChange={setSeg} options={[{ value: 'a', label: 'หนึ่ง' }, { value: 'b', label: 'สอง' }]} />
            <Avatar initial="M" ck="E" />
            <AvatarStack people={[{ initial: 'M', key: 'E' }, { initial: 'N', key: 'A' }, { initial: 'P', key: 'C' }, { initial: 'K', key: 'B' }]} />
          </div>
        </Block>

        <Block title="Menu · Modal · Banner">
          <div className="flex flex-wrap items-center gap-3">
            <Menu trigger={<Button variant="secondary">เปิดเมนู <Icon.chevronD width={14} height={14} /></Button>}>
              <MenuItem icon={<Icon.invite width={16} height={16} />}>เชิญสมาชิก</MenuItem>
              <MenuItem icon={<Icon.pin width={16} height={16} />}>ปักหมุด</MenuItem>
              <MenuItem icon={<Icon.trash width={16} height={16} />} danger>ลบ</MenuItem>
            </Menu>
            <Button onClick={() => setModal(true)}>เปิด Modal</Button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Banner tone="error">เกิดข้อผิดพลาด</Banner>
            <Banner tone="success">บันทึกสำเร็จ</Banner>
            <Banner tone="warn">โปรดตรวจสอบ</Banner>
          </div>
        </Block>

        <Block title="การ์ด · Skeleton · Empty state">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4"><p className="text-sm">การ์ดมาตรฐาน</p></Card>
            <Card className="space-y-2 p-4"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-1/2" /></Card>
            <Card className="grid place-items-center p-4 text-center text-[12px] text-muted"><Icon.folder /> empty</Card>
          </div>
          <div className="mt-4"><EmptyState icon={<Icon.folder width={26} height={26} />} title="ยังไม่มีข้อมูล" body="ตัวอย่าง microcopy ของ empty state ที่สื่อสารชัดเจน" action={<Button size="sm">เริ่มต้น</Button>} /></div>
        </Block>

        <Block title="Diff view (signature)">
          <DiffView />
        </Block>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="ตัวอย่าง Modal"
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>ยกเลิก</Button><Button onClick={() => setModal(false)}>ยืนยัน</Button></>}>
        <p className="text-sm text-muted">Modal มี backdrop เบลอ, animation pop, ปิดด้วย Esc หรือคลิกพื้นหลัง</p>
      </Modal>
    </div>
  )
}
