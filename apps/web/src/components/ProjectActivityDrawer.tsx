// Sprint 4 — project-scoped activity feed drawer.
//
// Shortcut for the central /activity page: instead of leaving the editor →
// sidebar → Activity → manually filtering by project, this shows *the current
// project's* revision feed in-context. It reuses the same `useProjectChanges`
// hook the Activity page uses, but binds `projectId` to the current project and
// drops the project filter (the user can't pick another project here — that is
// the whole point). Same slide-in pattern as RevisionDiffDrawer; clicking a row
// opens that same diff drawer stacked on top.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner, Card, EmptyState, Segmented, Skeleton } from './ui'
import { RevisionDiffDrawer, type DiffTarget } from './RevisionDiffDrawer'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'
import { useProjectChanges, type ProjectChangeItem, type UpdatesRange } from '../lib/updates'

function formatWhen(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

interface Props {
  projectId: string
  projectName: string
  open: boolean
  onClose: () => void
}

export function ProjectActivityDrawer({ projectId, projectName, open, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const [range, setRange] = useState<UpdatesRange>('30d')
  const [target, setTarget] = useState<DiffTarget | null>(null)

  // Bound to the current project; `enabled` gates the request to when the drawer
  // is actually open so closing/reopening other projects never over-fetches.
  const { data, isLoading, isError } = useProjectChanges(range, projectId, null, open)

  const rangeOptions = useMemo(
    () => [
      { value: '7d' as const, label: t('updates.range7d') },
      { value: '30d' as const, label: t('updates.range30d') },
      { value: 'all' as const, label: t('updates.rangeAll') },
    ],
    [t],
  )

  function openDiff(row: ProjectChangeItem) {
    setTarget({
      projectId: row.projectId,
      fileId: row.fileId,
      revisionId: row.id,
      fileName: row.fileName,
      title: `${projectName} · ${row.fileName}`,
      subtitle: `${t('updates.by')} ${row.authorName} · ${formatWhen(row.createdAt, i18n.language)}`,
    })
  }

  return (
    <>
      <div className={cn('fixed inset-0 z-50', open ? '' : 'pointer-events-none')}>
        <div
          className={cn('absolute inset-0 bg-ink/40 transition-opacity', open ? 'opacity-100' : 'opacity-0')}
          onClick={onClose}
          aria-hidden
        />
        <div
          className={cn(
            'absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-paper shadow-pop transition-transform',
            open ? 'translate-x-0' : 'translate-x-full',
          )}
          role="dialog"
          aria-modal="true"
          aria-label={t('projectActivity.title')}
        >
          <div className="flex items-center gap-3 border-b border-line bg-card px-5 py-3.5">
            <button
              onClick={onClose}
              className="grid size-9 place-items-center rounded-lg hover:bg-ink/5"
              aria-label={t('common.close')}
            >
              <Icon.x />
            </button>
            <div className="min-w-0">
              <p className="truncate font-heading font-semibold">{t('projectActivity.title')}</p>
              <p className="truncate text-[12px] text-muted">{projectName}</p>
            </div>
          </div>

          <div className="border-b border-line px-5 py-2.5">
            <Segmented value={range} onChange={setRange} options={rangeOptions} />
          </div>

          <div className="scroll-thin flex-1 overflow-auto p-5">
            {isError ? (
              <Banner tone="error">{t('updates.loadError')}</Banner>
            ) : isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="space-y-2.5 p-4">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                  </Card>
                ))}
              </div>
            ) : data && data.length > 0 ? (
              <ul className="space-y-3 animate-fade">
                {data.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => openDiff(row)}
                      className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Card interactive className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="text-body-sm text-primary">{row.fileName}</span>
                            <p className="mt-0.5 text-caption text-muted">
                              {t('updates.by')}: <b className="font-medium text-ink">{row.authorName}</b>
                            </p>
                            {row.label && <p className="mt-1 text-[13.5px] text-muted">{row.label}</p>}
                            <div className="mt-2.5 flex items-center gap-1.5 text-caption text-subtle">
                              <Icon.clock width={13} height={13} /> {formatWhen(row.createdAt, i18n.language)}
                            </div>
                          </div>
                          <Icon.chevronR className="mt-1 shrink-0 text-subtle" />
                        </div>
                      </Card>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Icon.list width={26} height={26} />}
                title={t('projectActivity.emptyTitle')}
                body={t('projectActivity.emptyBody')}
              />
            )}
          </div>
        </div>
      </div>

      {/* Stacked on top: reuse the same diff drawer the Activity page opens. */}
      <RevisionDiffDrawer target={target} onClose={() => setTarget(null)} />
    </>
  )
}
