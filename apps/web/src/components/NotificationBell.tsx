import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { Icon } from '../lib/icons'
import { Avatar } from './ui'
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
  type NotificationItem,
} from '../lib/notifications'

/** Compact relative time using the i18n catalog (just now / m / h / d). */
function useRelativeTime() {
  const { t } = useTranslation()
  return (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return t('notifications.justNow')
    if (mins < 60) return t('notifications.minutesAgo', { count: mins })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('notifications.hoursAgo', { count: hours })
    return t('notifications.daysAgo', { count: Math.floor(hours / 24) })
  }
}

function messageFor(t: ReturnType<typeof useTranslation>['t'], n: NotificationItem): string {
  const p = n.payload
  switch (n.type) {
    case 'ProjectInvite':
      return t('notifications.invite', { project: p.projectName ?? '' })
    case 'Mention':
      return t('notifications.mention', { file: p.fileName ?? '' })
    case 'Revision':
      return t('notifications.revision', { file: p.fileName ?? '' })
    default:
      return ''
  }
}

export function NotificationBell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const rel = useRelativeTime()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: unread = 0 } = useUnreadCount()
  const { data: items = [], isLoading } = useNotifications(open) // fetch the list only when opened
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllRead()

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  function onItemClick(n: NotificationItem) {
    if (!n.read) markRead.mutate(n.id)
    const pid = n.payload.projectId
    setOpen(false)
    if (pid) navigate(`/projects/${pid}/work`)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-10 place-items-center rounded-xl text-ink hover:bg-ink/5"
        aria-label={t('notifications.title')}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Icon.bell />
        {unread > 0 && (
          <span
            className="absolute right-1.5 top-1.5 grid min-w-[16px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-card"
            aria-label={`${unread}`}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1.5 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-card p-1.5 shadow-pop animate-pop"
        >
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-[13px] font-semibold text-ink">{t('notifications.title')}</span>
            {items.some((n) => !n.read) && (
              <button
                onClick={() => markAll.mutate()}
                className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-primary hover:bg-primary-soft"
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>
          <div className="my-1 h-px bg-line" />

          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <p className="px-2.5 py-6 text-center text-sm text-muted">{t('common.loading')}</p>
            ) : items.length === 0 ? (
              <p className="px-2.5 py-8 text-center text-sm text-muted">{t('notifications.empty')}</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onItemClick(n)}
                  className={cn('flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-ink/5',
                    !n.read && 'bg-primary-soft/40')}
                >
                  <Avatar initial={(n.payload.actorName ?? '?').charAt(0).toUpperCase()} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-ink">
                      <b className="font-semibold">{n.payload.actorName ?? ''}</b> {messageFor(t, n)}
                    </p>
                    <p className="text-[11px] text-subtle">{rel(n.createdAt)}</p>
                  </div>
                  {!n.read && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
