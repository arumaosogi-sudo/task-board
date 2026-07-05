// PAGE 5 (My Updates) + PAGE 6 (Project Changes) share this view.
// `withBy` adds the "BY: [person]" line + per-person filter (page 6).
// Clicking a row opens the diff view.
import { useState } from 'react'
import { Shell } from '../components/Shell'
import { Icon } from '../lib/icons'
import { myUpdates, projectChanges, type Update } from '../data/mock'
import { Card, Tag, Avatar, Button, Menu, MenuItem, EmptyState, Skeleton, Segmented } from '../components/ui'
import { DiffView } from '../components/DiffView'
import { StateTabs } from './_StateTabs'
import { cn } from '../lib/cn'

type View = 'default' | 'loading' | 'empty' | 'error'

function UpdateRow({ u, withBy, onOpen }: { u: Update; withBy?: boolean; onOpen: () => void }) {
  return (
    <Card className="cursor-pointer p-4 transition-shadow hover:shadow-pop" onClick={onOpen}>
      <div className="flex items-start gap-3">
        {withBy && <Avatar initial={u.by![0]} ck={u.byKey} size={36} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-heading text-[15px] font-semibold text-ink">{u.project}</span>
            <Icon.chevronR width={14} height={14} className="text-subtle" />
            <span className="text-[13px] text-primary">{u.file}</span>
            {u.scope && <Tag tone={u.scope === 'owner' ? 'primary' : 'neutral'}>{u.scope === 'owner' ? 'เราเป็นเจ้าของ' : 'เราร่วมงาน'}</Tag>}
          </div>
          {withBy && <p className="mt-0.5 text-[12px] text-muted">BY: <b className="font-medium text-ink">{u.by}</b></p>}
          <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-muted">{u.summary}</p>
          <div className="mt-2.5 flex items-center gap-2 text-[12px] text-subtle">
            <Icon.clock width={13} height={13} /> {u.timestamp}
            <span className="ml-1 flex gap-1.5"><Tag tone="add">+{u.added}</Tag><Tag tone="del">−{u.removed}</Tag></span>
          </div>
        </div>
        <Icon.chevronR className="mt-1 shrink-0 text-subtle" />
      </div>
    </Card>
  )
}

export function UpdatesView({ withBy = false, title, subtitle }: { withBy?: boolean; title: string; subtitle: string }) {
  const [view, setView] = useState<View>('default')
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('30d')
  const [open, setOpen] = useState<Update | null>(null)
  const data = withBy ? projectChanges : myUpdates

  return (
    <Shell title={title}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-4">
          <h1 className="font-heading text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Segmented value={range} onChange={setRange} options={[{ value: '7d', label: '7 วัน' }, { value: '30d', label: '30 วัน' }, { value: 'all', label: 'ทั้งหมด' }]} />
          <Menu trigger={<Button variant="secondary"><Icon.folder width={16} height={16} /> ทุก project</Button>}>
            <MenuItem icon={<Icon.check width={16} height={16} />}>ทุก project</MenuItem>
            <MenuItem icon={<span className="size-4" />}>Q3 Marketing Report</MenuItem>
            <MenuItem icon={<span className="size-4" />}>Onboarding Handbook</MenuItem>
          </Menu>
          {withBy && (
            <Menu trigger={<Button variant="secondary"><Icon.invite width={16} height={16} /> ทุกคน</Button>}>
              <MenuItem icon={<Icon.check width={16} height={16} />}>ทุกคน</MenuItem>
              <MenuItem icon={<span className="size-4" />}>Nicha</MenuItem>
              <MenuItem icon={<span className="size-4" />}>Praew</MenuItem>
              <MenuItem icon={<span className="size-4" />}>Kan</MenuItem>
            </Menu>
          )}
          <div className="ml-auto"><StateTabs value={view} onChange={setView}
            options={[{ value: 'default', label: 'Default' }, { value: 'loading', label: 'Loading' }, { value: 'empty', label: 'Empty' }, { value: 'error', label: 'Error' }]} /></div>
        </div>

        {view === 'loading' && (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="space-y-2.5 p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-3/4" /></Card>
          ))}</div>
        )}

        {view === 'empty' && (
          <EmptyState icon={<Icon.edit width={26} height={26} />}
            title={withBy ? 'ยังไม่มีการเปลี่ยนแปลงจากผู้ร่วมงาน' : 'ยังไม่มีการแก้ไขของคุณ'}
            body={withBy ? 'เมื่อมีคนแก้ไขงานใน project ของคุณ การเปลี่ยนแปลงจะปรากฏที่นี่' : 'เริ่มแก้ไขเอกสารแล้วประวัติการเปลี่ยนแปลงของคุณจะมาแสดงที่นี่'} />
        )}

        {view === 'error' && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-danger/10">
              <Icon.warning width={22} height={22} className="text-danger" />
            </div>
            <p className="font-medium text-ink">โหลดข้อมูลไม่สำเร็จ</p>
            <p className="text-sm text-muted">ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง</p>
            <Button variant="secondary" size="sm" onClick={() => setView('default')}>ลองใหม่</Button>
          </div>
        )}

        {view === 'default' && (
          <div className="space-y-3">{data.map((u) => <UpdateRow key={u.id} u={u} withBy={withBy} onOpen={() => setOpen(u)} />)}</div>
        )}
      </div>

      {/* Diff drawer */}
      <div className={cn('fixed inset-0 z-50', open ? '' : 'pointer-events-none')}>
        <div className={cn('absolute inset-0 bg-ink/40 transition-opacity', open ? 'opacity-100' : 'opacity-0')} onClick={() => setOpen(null)} />
        <div className={cn('absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-paper shadow-pop transition-transform', open ? 'translate-x-0' : 'translate-x-full')}>
          {open && (<>
            <div className="flex items-center gap-3 border-b border-line bg-card px-5 py-3.5">
              <button onClick={() => setOpen(null)} className="grid size-9 place-items-center rounded-lg hover:bg-ink/5"><Icon.arrowLeft /></button>
              <div className="min-w-0">
                <p className="truncate font-heading font-semibold">{open.project} · {open.file}</p>
                <p className="text-[12px] text-muted">{open.by ? `BY ${open.by} · ` : ''}{open.timestamp}</p>
              </div>
              <Button variant="secondary" size="sm" className="ml-auto"><Icon.file width={15} height={15} /> เปิดไฟล์</Button>
            </div>
            <div className="scroll-thin flex-1 overflow-auto p-5">
              <DiffView added={open.added} removed={open.removed} />
            </div>
          </>)}
        </div>
      </div>
    </Shell>
  )
}
