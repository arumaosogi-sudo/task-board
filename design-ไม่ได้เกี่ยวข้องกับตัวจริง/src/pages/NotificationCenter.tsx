// NEW SCREEN — Notification Center (/notifications)
// All notifications with filter tabs and date grouping
import { useState } from 'react'
import { Shell } from '../components/Shell'
import { Icon } from '../lib/icons'
import { Card, Button, Avatar, EmptyState } from '../components/ui'
import { cn } from '../lib/cn'

type NotifTab = 'all' | 'unread' | 'invite' | 'edit'
type NotifType = 'invite' | 'edit' | 'mention' | 'system'

interface Notif {
  id: string; type: NotifType; who: string; whoKey: string; text: string
  time: string; group: 'today' | 'yesterday' | 'week'; unread: boolean
}

const notifications: Notif[] = [
  { id: '1', type: 'invite', who: 'Nicha', whoKey: 'A', text: 'เชิญคุณเข้าร่วม Q3 Marketing Report ในฐานะ Editor', time: '30 นาที', group: 'today', unread: true },
  { id: '2', type: 'edit', who: 'Praew', whoKey: 'C', text: 'แก้ไข บทสรุปผู้บริหาร ใน Q3 Marketing Report', time: '2 ชั่วโมง', group: 'today', unread: true },
  { id: '3', type: 'mention', who: 'Kan', whoKey: 'D', text: 'แท็กคุณในความคิดเห็นของ Onboarding Handbook', time: '5 ชั่วโมง', group: 'today', unread: false },
  { id: '4', type: 'edit', who: 'Nicha', whoKey: 'A', text: 'สร้างไฟล์ใหม่ แผนการตลาด Q4 ใน Q3 Marketing Report', time: '1 วัน', group: 'yesterday', unread: false },
  { id: '5', type: 'system', who: 'Task Board', whoKey: 'E', text: 'คุณถูกเพิ่มเป็น Viewer ใน Onboarding Handbook', time: '2 วัน', group: 'yesterday', unread: false },
  { id: '6', type: 'invite', who: 'Praew', whoKey: 'C', text: 'เชิญคุณเข้าร่วม Brand Guidelines 2026 ในฐานะ Editor', time: '5 วัน', group: 'week', unread: false },
]

const typeIcon: Record<NotifType, typeof Icon.bell> = {
  invite: Icon.invite,
  edit: Icon.edit,
  mention: Icon.edit,
  system: Icon.gear,
}

const tabDef: { id: NotifTab; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'unread', label: 'ยังไม่อ่าน' },
  { id: 'invite', label: 'คำเชิญ' },
  { id: 'edit', label: 'การแก้ไข' },
]

const groupLabel: Record<Notif['group'], string> = {
  today: 'วันนี้',
  yesterday: 'เมื่อวาน',
  week: 'สัปดาห์นี้',
}

export default function NotificationCenter() {
  const [tab, setTab] = useState<NotifTab>('all')
  const [notifs, setNotifs] = useState(notifications)

  const filtered = notifs.filter((n) => {
    if (tab === 'unread') return n.unread
    if (tab === 'invite') return n.type === 'invite'
    if (tab === 'edit') return n.type === 'edit' || n.type === 'mention'
    return true
  })

  const unreadCount = notifs.filter((n) => n.unread).length

  function markRead(id: string) {
    setNotifs((n) => n.map((x) => x.id === id ? { ...x, unread: false } : x))
  }

  function markAllRead() {
    setNotifs((n) => n.map((x) => ({ ...x, unread: false })))
  }

  const groups: Notif['group'][] = ['today', 'yesterday', 'week']

  return (
    <Shell title="การแจ้งเตือน">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold">การแจ้งเตือน</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-muted">ยังไม่ได้อ่าน {unreadCount} รายการ</p>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="secondary" size="sm" onClick={markAllRead}>
              <Icon.check width={14} height={14} /> อ่านทั้งหมด
            </Button>
          )}
        </div>

        {/* tabs */}
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
          {tabDef.map((t) => {
            const count = t.id === 'unread' ? unreadCount
              : t.id === 'invite' ? notifs.filter((n) => n.type === 'invite').length
              : t.id === 'edit' ? notifs.filter((n) => n.type === 'edit' || n.type === 'mention').length
              : notifs.length
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn('flex shrink-0 items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-[13.5px] font-medium transition-colors',
                  tab === t.id ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-ink')}>
                {t.label}
                {count > 0 && (
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                    tab === t.id ? 'bg-primary-soft text-primary' : 'bg-line text-muted')}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* results */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Icon.bell width={24} height={24} />}
            title={tab === 'unread' ? 'อ่านทุกอย่างแล้ว' : 'ไม่มีการแจ้งเตือน'}
            body={tab === 'unread' ? 'ยอดเยี่ยม! คุณอ่านทุกการแจ้งเตือนแล้ว' : 'การแจ้งเตือนใหม่จะมาปรากฏที่นี่'}
          />
        ) : (
          <div className="space-y-6">
            {groups.map((g) => {
              const items = filtered.filter((n) => n.group === g)
              if (!items.length) return null
              return (
                <div key={g}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    {groupLabel[g]}
                  </p>
                  <div className="space-y-1">
                    {items.map((n) => {
                      const Icn = typeIcon[n.type]
                      return (
                        <Card
                          key={n.id}
                          className={cn('flex items-start gap-3 p-4 transition-shadow hover:shadow-pop cursor-pointer',
                            n.unread && 'bg-primary-soft/30')}
                          onClick={() => markRead(n.id)}
                        >
                          <div className="relative shrink-0">
                            <Avatar initial={n.who[0]} ck={n.whoKey} size={38} />
                            <div className={cn('absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full border-2 border-card',
                              n.type === 'invite' ? 'bg-primary' : 'bg-muted')}>
                              <Icn width={10} height={10} className="text-white" />
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] leading-snug text-ink">
                              <strong className="font-semibold">{n.who}</strong> {n.text}
                            </p>
                            <p className="mt-1 text-[11px] text-subtle">{n.time}ที่แล้ว</p>
                          </div>
                          {n.unread && (
                            <div className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                          )}
                          {n.type === 'invite' && n.unread && (
                            <div className="flex shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm">เข้าร่วม</Button>
                              <Button variant="secondary" size="sm">ปฏิเสธ</Button>
                            </div>
                          )}
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Shell>
  )
}
