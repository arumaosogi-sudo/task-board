// PAGE 9 — Editor. Tool toolbar (draw/write/image/box) + formatting bar
// (B/I/U/heading/list/table) + undo/redo + autosave status + version history +
// export PDF. A4 canvas with presence avatars and live cursors.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../lib/icons'
import { Button, Avatar, Menu, MenuItem, Modal, Tag } from '../components/ui'
import { DiffView } from '../components/DiffView'
import { cn } from '../lib/cn'

const tools = [
  { id: 'draw', label: 'วาดภาพ', icon: Icon.pencil },
  { id: 'write', label: 'เขียนรายงาน', icon: Icon.edit },
  { id: 'image', label: 'ใส่รูป', icon: Icon.image },
  { id: 'box', label: 'Box file', icon: Icon.box },
] as const

const collaborators = [{ initial: 'N', key: 'A', name: 'Nicha' }, { initial: 'P', key: 'C', name: 'Praew' }]

function ToolBtn({ active, onClick, children, label }: { active?: boolean; onClick?: () => void; children: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} aria-pressed={active}
      className={cn('grid size-11 place-items-center rounded-xl transition', active ? 'bg-primary text-primary-fg shadow-soft' : 'text-ink hover:bg-ink/5')}>
      {children}
    </button>
  )
}

function FmtBtn({ children, label }: { children: React.ReactNode; label: string }) {
  return <button title={label} aria-label={label} className="grid size-9 shrink-0 place-items-center rounded-lg text-ink hover:bg-ink/5">{children}</button>
}

function LiveCursor({ color, name, style }: { color: string; name: string; style: React.CSSProperties }) {
  return (
    <div className="pointer-events-none absolute z-10" style={style}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill={color}><path d="M1 1l5 14 2.5-5.5L14 7 1 1z" /></svg>
      <span className="ml-3 -mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: color }}>{name}</span>
    </div>
  )
}

export default function Editor() {
  const [tool, setTool] = useState<string>('write')
  const [saved, setSaved] = useState<'saved' | 'saving'>('saved')
  const [history, setHistory] = useState(false)

  return (
    <div className="flex h-screen flex-col bg-paper">
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-card px-3">
        <Link to="/work" className="grid size-9 place-items-center rounded-lg hover:bg-ink/5"><Icon.arrowLeft /></Link>
        <span className="font-heading text-[14px] font-semibold">บทสรุปผู้บริหาร</span>
        <span className="flex items-center gap-1 text-[12px] text-muted">
          {saved === 'saving'
            ? <><span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> กำลังบันทึก…</>
            : <><Icon.check width={14} height={14} className="text-success" /> บันทึกแล้ว</>}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex -space-x-2 pr-1">
            <Avatar initial="M" ck="E" size={30} ring />
            {collaborators.map((c) => <Avatar key={c.key} initial={c.initial} ck={c.key} size={30} ring />)}
          </div>
          <button onClick={() => { setSaved('saving'); setTimeout(() => setSaved('saved'), 900) }} className="grid size-9 place-items-center rounded-lg hover:bg-ink/5" title="เลิกทำ"><Icon.undo /></button>
          <button className="grid size-9 place-items-center rounded-lg hover:bg-ink/5" title="ทำซ้ำ"><Icon.redo /></button>
          <button onClick={() => setHistory(true)} className="grid size-9 place-items-center rounded-lg hover:bg-ink/5" title="ประวัติเวอร์ชัน"><Icon.clock /></button>
          <Menu align="right" trigger={<Button size="sm" variant="secondary"><Icon.download width={15} height={15} /> Export</Button>}>
            <MenuItem icon={<Icon.download width={15} height={15} />}>Export เป็น PDF</MenuItem>
            <MenuItem icon={<Icon.file width={15} height={15} />}>Export เป็น Word</MenuItem>
          </Menu>
        </div>
      </header>

      {/* formatting bar */}
      <div className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-card/70 px-3">
        <Menu trigger={<button className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium hover:bg-ink/5">หัวข้อ 1 <Icon.chevronD width={14} height={14} /></button>}>
          <MenuItem>หัวข้อ 1</MenuItem><MenuItem>หัวข้อ 2</MenuItem><MenuItem>ข้อความปกติ</MenuItem>
        </Menu>
        <span className="mx-1 h-5 w-px bg-line" />
        <FmtBtn label="ตัวหนา"><Icon.bold width={16} height={16} /></FmtBtn>
        <FmtBtn label="ตัวเอียง"><Icon.italic width={16} height={16} /></FmtBtn>
        <FmtBtn label="ขีดเส้นใต้"><Icon.underline width={16} height={16} /></FmtBtn>
        <span className="mx-1 h-5 w-px bg-line" />
        <FmtBtn label="รายการ"><Icon.list width={16} height={16} /></FmtBtn>
        <FmtBtn label="ตาราง"><Icon.table width={16} height={16} /></FmtBtn>
        <span className="mx-1 h-5 w-px bg-line" />
        <div className="ml-auto flex items-center gap-1 text-[12px] text-muted">
          <button className="grid size-8 place-items-center rounded-lg hover:bg-ink/5">−</button>
          <span className="tabular-nums">100%</span>
          <button className="grid size-8 place-items-center rounded-lg hover:bg-ink/5">+</button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left tool rail */}
        <aside className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-line bg-card py-4 sm:flex">
          {tools.map((t) => (
            <ToolBtn key={t.id} active={tool === t.id} onClick={() => setTool(t.id)} label={t.label}><t.icon /></ToolBtn>
          ))}
        </aside>

        {/* canvas */}
        <main className="scroll-thin relative min-w-0 flex-1 overflow-auto bg-paper p-6 sm:p-10">
          <div className="relative mx-auto w-full max-w-[760px]">
            {/* live cursors of collaborators */}
            <LiveCursor color="#f08a8a" name="Nicha" style={{ top: 120, left: 220 }} />
            <LiveCursor color="#82d178" name="Praew" style={{ top: 360, left: 90 }} />

            <div className="paper-shadow aspect-[1/1.414] rounded-lg bg-white p-12 ring-1 ring-line">
              <h1 className="font-heading text-2xl font-bold text-ink">บทสรุปผู้บริหาร</h1>
              <p className="mt-4 text-[14px] leading-relaxed text-ink/85">
                แคมเปญไตรมาส 3 มุ่งเน้นการเข้าถึงกลุ่มลูกค้าใหม่ผ่านช่องทางดิจิทัลเป็นหลัก
                โดยมีเป้าหมายเพิ่ม awareness 22% ภายในสิ้นไตรมาส และพบว่า ROI เฉลี่ยของแคมเปญหลักอยู่ที่ 3.4x
                ซึ่งเกินเป้าที่ตั้งไว้ที่ 2.8x
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-ink/85">
                งบประมาณรวมที่ใช้ไปคิดเป็น 92% ของที่ตั้งไว้ ทีมเสนอให้ยุติช่องทางที่ ROI ต่ำกว่า 1.5x
                และโยกงบไปยังช่องทาง social ที่ให้ผลตอบรับดีที่สุด
              </p>
              {/* embedded box file */}
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-paper/70 p-3">
                <Icon.box width={18} height={18} className="text-primary" />
                <span className="text-[13px] text-ink">box: ข้อมูลดิบ &amp; ไฟล์แนบ</span>
                <Tag tone="neutral" className="ml-auto">3 ไฟล์</Tag>
              </div>
            </div>
            <p className="mt-3 text-center text-[12px] text-subtle">หน้า 1 / 4 · A4 แนวตั้ง</p>
          </div>
        </main>
      </div>

      {/* bottom mobile tool bar */}
      <div className="flex h-14 items-center justify-around border-t border-line bg-card sm:hidden">
        {tools.map((t) => (
          <ToolBtn key={t.id} active={tool === t.id} onClick={() => setTool(t.id)} label={t.label}><t.icon /></ToolBtn>
        ))}
      </div>

      {/* version history */}
      <Modal open={history} onClose={() => setHistory(false)} title="ประวัติเวอร์ชัน" width="max-w-3xl"
        footer={<Button variant="ghost" onClick={() => setHistory(false)}>ปิด</Button>}>
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div className="space-y-1">
            {[['วันนี้ 14:32', 'Me', true], ['เมื่อวาน 09:15', 'Nicha', false], ['23 มิ.ย. 16:40', 'Me', false]].map(([t, who, cur], i) => (
              <button key={i} className={cn('w-full rounded-lg px-3 py-2 text-left text-[13px]', cur ? 'bg-primary-soft text-primary' : 'hover:bg-ink/5')}>
                <p className="font-medium">{t as string}</p>
                <p className="text-[11px] text-muted">โดย {who as string}{cur ? ' · ปัจจุบัน' : ''}</p>
              </button>
            ))}
          </div>
          <DiffView added={24} removed={8} />
        </div>
      </Modal>
    </div>
  )
}
