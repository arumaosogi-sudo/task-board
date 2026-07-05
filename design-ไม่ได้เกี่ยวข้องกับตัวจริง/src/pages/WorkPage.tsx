// PAGE 8 — Work Page. Left: searchable file tree (parent/kid/box).
// Center: real A4 thumbnails. Top-right "+ ใหม่" menu + create-file dialog.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../lib/icons'
import { fileTree, type FileNode } from '../data/mock'
import { Button, Input, Menu, MenuItem, Modal, Field, Segmented, EmptyState, Avatar, Skeleton, Card } from '../components/ui'
import { StateTabs } from './_StateTabs'
import { cn } from '../lib/cn'

function TreeNode({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [open, setOpen] = useState(true)
  const isParent = node.kind === 'parent'
  const Icn = node.kind === 'box' ? Icon.box : node.kind === 'parent' ? Icon.folder : Icon.file
  return (
    <div>
      <div className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-ink/5" style={{ paddingLeft: 8 + depth * 14 }}>
        {isParent ? (
          <button onClick={() => setOpen((o) => !o)} className="text-subtle">
            <Icon.chevronR width={14} height={14} className={cn('transition-transform', open && 'rotate-90')} />
          </button>
        ) : <span className="w-[14px]" />}
        <Icn width={16} height={16} className={cn(node.kind === 'box' ? 'text-primary' : 'text-muted')} />
        <Link to="/editor" className="flex-1 truncate text-[13px] text-ink">{node.name}</Link>
        <Menu align="right" trigger={<button className="opacity-0 group-hover:opacity-100"><Icon.dots width={15} height={15} className="text-muted" /></button>}>
          <MenuItem icon={<Icon.edit width={15} height={15} />}>เปลี่ยนชื่อ</MenuItem>
          <MenuItem icon={<Icon.file width={15} height={15} />}>ทำซ้ำ</MenuItem>
          <MenuItem icon={<Icon.folder width={15} height={15} />}>ย้ายไป…</MenuItem>
          <div className="my-1 h-px bg-line" />
          <MenuItem icon={<Icon.trash width={15} height={15} />} danger>ลบ</MenuItem>
        </Menu>
      </div>
      {isParent && open && node.children?.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} />)}
    </div>
  )
}

function A4Thumb({ name, orientation = 'portrait', updated }: { name: string; orientation?: string; updated?: string }) {
  const land = orientation === 'landscape'
  return (
    <Link to="/editor" className="group">
      <div className={cn('paper-shadow mx-auto overflow-hidden rounded-lg bg-white ring-1 ring-line transition group-hover:ring-primary',
        land ? 'aspect-[1.414/1]' : 'aspect-[1/1.414]')}>
        <div className="space-y-1.5 p-3">
          <div className="h-2 w-1/2 rounded bg-ink/15" />
          <div className="h-1.5 w-full rounded bg-ink/8" />
          <div className="h-1.5 w-full rounded bg-ink/8" />
          <div className="h-1.5 w-4/5 rounded bg-ink/8" />
          <div className="mt-2 h-10 w-full rounded bg-primary-soft" />
          <div className="h-1.5 w-full rounded bg-ink/8" />
          <div className="h-1.5 w-2/3 rounded bg-ink/8" />
        </div>
      </div>
      <p className="mt-2 truncate text-center text-[13px] font-medium text-ink">{name}</p>
      <p className="text-center text-[11px] text-subtle">{updated} · {land ? 'แนวนอน' : 'แนวตั้ง'}</p>
    </Link>
  )
}

type WorkView = 'default' | 'loading' | 'empty' | 'error'

export default function WorkPage() {
  const [dialog, setDialog] = useState(false)
  const [mobileTree, setMobileTree] = useState(false)
  const [workView, setWorkView] = useState<WorkView>('default')
  const [size] = useState('A4')
  const [orient, setOrient] = useState<'portrait' | 'landscape'>('portrait')
  const allKids = fileTree.flatMap((p) => p.children ?? []).filter((c) => c.kind !== 'box')

  return (
    <div className="flex h-screen flex-col bg-paper">
      {/* top bar */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-card px-4">
        <Link to="/home" className="grid size-10 place-items-center rounded-xl hover:bg-ink/5"><Icon.arrowLeft /></Link>
        <div>
          <h1 className="font-heading text-[15px] font-semibold leading-tight">Q3 Marketing Report</h1>
          <p className="text-[11px] text-muted">8 ไฟล์ · 3 สมาชิก</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="md:hidden grid size-11 place-items-center rounded-xl text-ink hover:bg-ink/5"
            onClick={() => setMobileTree(true)} aria-label="ดูไฟล์">
            <Icon.folder width={20} height={20} />
          </button>
          <div className="hidden sm:flex -space-x-2">
            {[['M', 'E'], ['N', 'A'], ['P', 'C']].map(([i, k]) => <Avatar key={i} initial={i} ck={k} size={30} ring />)}
          </div>
          <Menu align="right" trigger={<Button size="md"><Icon.plus width={18} height={18} /> ใหม่</Button>}>
            <MenuItem icon={<Icon.folder width={16} height={16} />} onClick={() => setDialog(true)}>File แม่</MenuItem>
            <MenuItem icon={<Icon.file width={16} height={16} />} onClick={() => setDialog(true)}>File ลูก</MenuItem>
            <MenuItem icon={<Icon.edit width={16} height={16} />} onClick={() => setDialog(true)}>Quick file</MenuItem>
            <div className="my-1 h-px bg-line" />
            <MenuItem icon={<Icon.image width={16} height={16} />}>นำรูปภาพ</MenuItem>
            <MenuItem icon={<Icon.image width={16} height={16} />}>ถ่ายภาพ</MenuItem>
            <MenuItem icon={<Icon.download width={16} height={16} />}>นำเข้า PDF / Word</MenuItem>
          </Menu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* file tree */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-card md:flex">
          <div className="p-3"><Input icon={<Icon.search width={16} height={16} />} placeholder="ค้นหาไฟล์…" className="h-9" /></div>
          <div className="scroll-thin flex-1 overflow-auto px-1.5 pb-3">
            {fileTree.map((n) => <TreeNode key={n.id} node={n} />)}
          </div>
        </aside>

        {/* center: thumbnails */}
        <main className="scroll-thin min-w-0 flex-1 overflow-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-semibold">ไฟล์ทั้งหมด</h2>
              {workView === 'default' && <span className="text-sm text-muted">({allKids.length})</span>}
            </div>
            <StateTabs value={workView} onChange={setWorkView}
              options={[{ value: 'default', label: 'Default' }, { value: 'loading', label: 'Loading' }, { value: 'empty', label: 'Empty' }, { value: 'error', label: 'Error' }]} />
          </div>

          {workView === 'loading' && (
            <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[1/1.414] w-full rounded-lg" />
                  <Skeleton className="mx-auto h-3 w-3/4" />
                </div>
              ))}
            </div>
          )}

          {workView === 'error' && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-danger/10">
                <Icon.warning width={22} height={22} className="text-danger" />
              </div>
              <p className="font-medium text-ink">โหลดไฟล์ไม่สำเร็จ</p>
              <p className="text-sm text-muted">ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง</p>
              <Button variant="secondary" size="sm" onClick={() => setWorkView('default')}>ลองใหม่</Button>
            </div>
          )}

          {workView === 'empty' && (
            <EmptyState icon={<Icon.file width={26} height={26} />} title="ยังไม่มีไฟล์ใน project นี้"
              body="สร้างไฟล์ A4 ใบแรก หรือนำเข้า PDF/Word เพื่อเริ่มทำงาน"
              action={<Button onClick={() => setDialog(true)}><Icon.plus width={18} height={18} /> สร้างไฟล์</Button>} />
          )}

          {workView === 'default' && (
            <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {allKids.map((f) => <A4Thumb key={f.id} name={f.name} orientation={f.orientation} updated={f.updated} />)}
            </div>
          )}
        </main>
      </div>

      {/* Mobile file tree bottom sheet */}
      {mobileTree && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileTree(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-card animate-pop">
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-card px-4 py-3">
              <h3 className="font-heading text-[15px] font-semibold">Files</h3>
              <button onClick={() => setMobileTree(false)} className="grid size-11 place-items-center rounded-xl hover:bg-ink/5" aria-label="ปิด">
                <Icon.x width={18} height={18} />
              </button>
            </div>
            <div className="p-3">
              <Input icon={<Icon.search width={16} height={16} />} placeholder="ค้นหาไฟล์…" className="mb-2 h-9" />
              {fileTree.map((n) => <TreeNode key={n.id} node={n} />)}
            </div>
          </div>
        </div>
      )}

      <Modal open={dialog} onClose={() => setDialog(false)} title="สร้างไฟล์ใหม่"
        footer={<><Button variant="ghost" onClick={() => setDialog(false)}>ยกเลิก</Button><Link to="/editor"><Button>สร้างและเปิด</Button></Link></>}>
        <div className="space-y-4">
          <Field label="ชื่อไฟล์" htmlFor="fn"><Input id="fn" placeholder="เช่น บทสรุปผู้บริหาร" autoFocus /></Field>
          <Field label="ขนาดกระดาษ"><Segmented value={size} onChange={() => {}} options={[{ value: 'A4', label: 'A4' }, { value: 'A5', label: 'A5' }, { value: 'Letter', label: 'Letter' }]} /></Field>
          <Field label="แนววาง"><Segmented value={orient} onChange={setOrient} options={[{ value: 'portrait', label: 'แนวตั้ง' }, { value: 'landscape', label: 'แนวนอน' }]} /></Field>
          <div className="rounded-xl border border-dashed border-line bg-paper/60 p-4 text-center">
            <Icon.download width={20} height={20} className="mx-auto text-subtle" />
            <p className="mt-1 text-[13px] text-muted">หรือ ลากไฟล์มาวางเพื่อนำเข้า — PDF, Word (.docx) สูงสุด 25 MB</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
