import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'
import { Card, Avatar, AvatarStack, Menu, MenuItem, Skeleton } from './ui'
import type { Project } from '../data/mock'

export function ProjectCard({ p }: { p: Project }) {
  const { t } = useTranslation()
  return (
    <Card className="group relative flex flex-col transition-shadow hover:shadow-pop">
      <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3">
        <Link to={`/work/${p.id}`} className="truncate font-heading text-[15px] font-semibold text-primary-fg">{p.name}</Link>
        <div className="flex items-center gap-1">
          {p.pinned && <span className="text-primary-fg/80" title={t('project.pin')}><Icon.pin width={16} height={16} /></span>}
          <Menu align="right" trigger={
            <button className="grid size-8 place-items-center rounded-lg text-primary-fg/90 hover:bg-white/15" aria-label={t('project.optionsAria')}>
              <Icon.dots width={18} height={18} />
            </button>
          }>
            <MenuItem icon={<Icon.invite width={16} height={16} />}>{t('projectCard.inviteMembers')}</MenuItem>
            <MenuItem icon={<Icon.pin width={16} height={16} />}>{p.pinned ? t('project.unpin') : t('project.pin')}</MenuItem>
            <div className="my-1 h-px bg-line" />
            <MenuItem icon={<Icon.logout width={16} height={16} />}>{t('projectCard.leaveProject')}</MenuItem>
            <MenuItem icon={<Icon.trash width={16} height={16} />} danger>{t('project.deleteProject')}</MenuItem>
          </Menu>
        </div>
      </div>
      <Link to={`/work/${p.id}`} className="flex flex-1 flex-col p-4">
        <p className="line-clamp-3 min-h-[3.6rem] text-[13.5px] leading-relaxed text-muted">{p.about}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar initial={p.ownerInitial} ck={p.members[0]?.key} size={24} />
            <span className="text-[12px] text-muted">Owner: <b className="font-medium text-ink">{p.owner}</b></span>
          </div>
          <AvatarStack people={p.members} size={24} />
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-subtle">
          <Icon.clock width={13} height={13} /> {t('project.cardMeta', { date: p.updatedAt, count: p.members.length })}
        </div>
      </Link>
    </Card>
  )
}

export function ProjectCardSkeleton() {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="h-12 bg-primary-soft" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
        <div className="flex items-center justify-between pt-3">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
    </Card>
  )
}

export function ProjectGrid({ children }: { children: React.ReactNode }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3')}>{children}</div>
}
