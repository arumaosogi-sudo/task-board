// PAGE 3 (Home) + PAGE 4 (My Projects) share this view — `mineOnly` flips the
// filter. Demonstrates default / loading (skeleton) / empty / error states.
import { useMemo, useState } from 'react'
import { Shell } from '../components/Shell'
import { Icon } from '../lib/icons'
import { projects } from '../data/mock'
import { ProjectCard, ProjectCardSkeleton, ProjectGrid } from '../components/ProjectCard'
import { Button, Input, Menu, MenuItem, EmptyState, Banner, Modal, Field, Segmented } from '../components/ui'
import { StateTabs } from './_StateTabs'

type View = 'default' | 'loading' | 'empty' | 'error'

export function ProjectsView({ mineOnly = false, title }: { mineOnly?: boolean; title: string }) {
  const [view, setView] = useState<View>('default')
  const [sort, setSort] = useState('recent')
  const [create, setCreate] = useState(false)
  const [perm, setPerm] = useState<'editor' | 'viewer'>('editor')

  const list = useMemo(() => {
    const base = mineOnly ? projects.filter((p) => p.mine) : projects
    return [...base].sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1))
  }, [mineOnly])

  return (
    <Shell title={title}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-muted">{mineOnly ? 'project ที่ฉันเป็นเจ้าของ' : 'ทุก project ที่เข้าร่วม'}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-48 sm:w-64">
              <Input icon={<Icon.search width={18} height={18} />} placeholder="ค้นหา project…" />
            </div>
            <Menu align="right" trigger={<Button variant="secondary" size="md"><Icon.sliders width={16} height={16} /> เรียง</Button>}>
              {[['recent', 'แก้ล่าสุด'], ['name', 'ชื่อ A–Z'], ['pinned', 'ปักหมุดก่อน']].map(([v, l]) => (
                <MenuItem key={v} icon={sort === v ? <Icon.check width={16} height={16} /> : <span className="size-4" />} onClick={() => setSort(v)}>{l}</MenuItem>
              ))}
            </Menu>
          </div>
        </div>

        <StateTabs value={view} onChange={setView}
          options={[{ value: 'default', label: 'Default' }, { value: 'loading', label: 'Loading' }, { value: 'empty', label: 'Empty' }, { value: 'error', label: 'Error' }]} />

        {view === 'error' && (
          <Banner>โหลด project ไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่ <button className="ml-1 underline" onClick={() => setView('default')}>ลองอีกครั้ง</button></Banner>
        )}

        {view === 'loading' && <ProjectGrid>{Array.from({ length: 6 }).map((_, i) => <ProjectCardSkeleton key={i} />)}</ProjectGrid>}

        {view === 'empty' && (
          <EmptyState icon={<Icon.folder width={26} height={26} />}
            title="ยังไม่มี project"
            body={mineOnly ? 'project ที่สร้างเองจะมาอยู่ที่นี่ — เริ่มอันแรกได้เลย' : 'สร้าง project แรกเพื่อเริ่มเขียนรายงานร่วมกับทีม'}
            action={<Button onClick={() => setCreate(true)}><Icon.plus width={18} height={18} /> สร้าง project</Button>} />
        )}

        {view === 'default' && <ProjectGrid>{list.map((p) => <ProjectCard key={p.id} p={p} />)}</ProjectGrid>}
      </div>

      {/* FAB */}
      <button onClick={() => setCreate(true)} aria-label="สร้าง project"
        className="fixed bottom-6 right-6 z-20 grid size-14 place-items-center rounded-full bg-primary text-primary-fg shadow-fab transition hover:bg-primary-hover active:scale-95">
        <Icon.plus width={26} height={26} />
      </button>

      <Modal open={create} onClose={() => setCreate(false)} title="สร้าง Project ใหม่"
        footer={<>
          <Button variant="ghost" onClick={() => setCreate(false)}>ยกเลิก</Button>
          <Button onClick={() => setCreate(false)}>สร้าง project</Button>
        </>}>
        <div className="space-y-4">
          <Field label="ชื่อ Project" htmlFor="np"><Input id="np" placeholder="เช่น Q4 Marketing Report" autoFocus /></Field>
          <Field label="คำอธิบาย" htmlFor="nd" optional><Input id="nd" placeholder="project นี้เกี่ยวกับอะไร" /></Field>
          <Field label="เชิญผู้ร่วมงาน (Gmail)" htmlFor="inv" hint="ถ้ายังไม่มีบัญชี ระบบจะส่งคำเชิญให้สมัครแล้วเข้า project อัตโนมัติ">
            <Input id="inv" placeholder="name@gmail.com" />
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink">สิทธิ์ผู้ถูกเชิญ</span>
            <Segmented value={perm} onChange={setPerm} options={[{ value: 'editor', label: 'Editor' }, { value: 'viewer', label: 'Viewer' }]} />
          </div>
        </div>
      </Modal>
    </Shell>
  )
}
