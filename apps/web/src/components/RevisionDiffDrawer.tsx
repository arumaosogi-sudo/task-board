// Phase 5 — slide-in drawer that diffs a chosen revision against the one before it.
//
// Shared by the "My Edits" and "Changes" feeds. The feed rows carry only metadata,
// so the drawer lazily fetches the selected revision's HTML (and its predecessor's)
// via the existing per-file revision endpoints, then renders a unified diff. When a
// revision is the file's first snapshot there is no predecessor, so it diffs against
// an empty document (the whole body shows as added).
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from './ui'
import { DiffView } from './DiffView'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'
import { diffHtml } from '../lib/htmlDiff'
import { useRevision, useRevisions } from '../lib/revisions'

export interface DiffTarget {
  projectId: string
  fileId: string
  revisionId: string
  fileName: string
  title: string
  subtitle: string
}

export function RevisionDiffDrawer({ target, onClose }: { target: DiffTarget | null; onClose: () => void }) {
  const { t } = useTranslation()
  const open = !!target
  const projectId = target?.projectId ?? ''
  const fileId = target?.fileId ?? null

  // The file's revision list (newest-first) locates the selected revision's predecessor.
  const { data: revisions } = useRevisions(projectId, fileId, open)
  const prevId = useMemo(() => {
    if (!target || !revisions) return null
    const idx = revisions.findIndex((r) => r.id === target.revisionId)
    if (idx === -1) return null
    return revisions[idx + 1]?.id ?? null // next item is older
  }, [target, revisions])

  const { data: current, isLoading: currentLoading } = useRevision(projectId, fileId, target?.revisionId ?? null)
  const { data: previous } = useRevision(projectId, fileId, prevId)

  const diff = useMemo(
    () => (current ? diffHtml(previous?.content ?? '', current.content) : null),
    [current, previous],
  )

  return (
    <div className={cn('fixed inset-0 z-50', open ? '' : 'pointer-events-none')}>
      <div
        className={cn('absolute inset-0 bg-ink/40 transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          'absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-paper shadow-pop transition-transform',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
      >
        {target && (
          <>
            <div className="flex items-center gap-3 border-b border-line bg-card px-5 py-3.5">
              <button
                onClick={onClose}
                className="grid size-9 place-items-center rounded-lg hover:bg-ink/5"
                aria-label={t('common.back')}
              >
                <Icon.arrowLeft />
              </button>
              <div className="min-w-0">
                <p className="truncate font-heading font-semibold">{target.title}</p>
                <p className="truncate text-[12px] text-muted">{target.subtitle}</p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <Link to={`/projects/${target.projectId}/work?file=${target.fileId}&history=1`}>
                  <Button variant="ghost" size="sm">
                    <Icon.clock width={15} height={15} /> {t('updates.viewAllHistory')}
                  </Button>
                </Link>
                <Link to={`/projects/${target.projectId}/work?file=${target.fileId}`}>
                  <Button variant="secondary" size="sm">
                    <Icon.file width={15} height={15} /> {t('updates.openFile')}
                  </Button>
                </Link>
              </div>
            </div>
            <div className="scroll-thin flex-1 overflow-auto p-5">
              {currentLoading || !diff ? (
                <p className="px-2 py-8 text-center text-sm text-muted">{t('history.comparing')}</p>
              ) : (
                <DiffView file={target.fileName} hunks={diff.hunks} added={diff.added} removed={diff.removed} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
