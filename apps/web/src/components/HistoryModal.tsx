// Phase 4.5 — document version history: snapshot, browse, diff, and restore.
//
// Restore is CRDT-safe: it doesn't touch the DB directly. Instead the parent writes the
// chosen snapshot back into the *live* editor (a normal collaborative edit), so every
// connected client and the persisted Y.Doc converge on the restored content.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Modal } from './ui'
import { DiffView } from './DiffView'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'
import { diffHtml } from '../lib/htmlDiff'
import { useCreateRevision, useRevision, useRevisions } from '../lib/revisions'

function formatWhen(iso: string, lang: string): string {
  const d = new Date(iso)
  return d.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export function HistoryModal({
  open, onClose, projectId, fileId, fileName, currentHtml, canEdit, onRestore,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  fileId: string
  fileName: string
  currentHtml: string
  canEdit: boolean
  onRestore: (html: string) => void
}) {
  const { t, i18n } = useTranslation()
  const { data: revisions, isLoading } = useRevisions(projectId, fileId, open)
  const create = useCreateRevision(projectId, fileId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [confirmRestore, setConfirmRestore] = useState(false)

  const { data: detail, isLoading: detailLoading } = useRevision(projectId, fileId, selectedId)

  // Diff the selected snapshot against the current live document.
  const diff = useMemo(
    () => (detail ? diffHtml(detail.content, currentHtml) : null),
    [detail, currentHtml],
  )

  async function saveSnapshot() {
    await create.mutateAsync({ label: label.trim() || undefined, content: currentHtml }).catch(() => undefined)
    setLabel('')
  }

  function restore() {
    if (!detail) return
    onRestore(detail.content)
    setConfirmRestore(false)
    onClose()
  }

  function close() {
    setSelectedId(null)
    setConfirmRestore(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title={t('history.title')} width="max-w-[920px]">
      <div className="flex flex-col gap-4 md:flex-row md:gap-5">
        {/* Revision list + snapshot control */}
        <div className="md:w-64 md:shrink-0">
          {canEdit && (
            <div className="mb-3 space-y-2 rounded-xl border border-line bg-paper/50 p-3">
              <Field label={t('history.saveCurrentVersion')} htmlFor="rev-label">
                <Input id="rev-label" value={label} onChange={(e) => setLabel(e.target.value)}
                  placeholder={t('history.labelPlaceholder')}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveSnapshot() }} />
              </Field>
              <Button onClick={saveSnapshot} loading={create.isPending} className="w-full">
                <Icon.clock width={16} height={16} /> {t('history.saveVersion')}
              </Button>
            </div>
          )}

          <div className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
            {isLoading ? (
              <p className="px-2 py-4 text-[13px] text-muted">{t('common.loading')}</p>
            ) : revisions && revisions.length > 0 ? (
              revisions.map((r) => (
                <button key={r.id} onClick={() => { setSelectedId(r.id); setConfirmRestore(false) }}
                  className={cn('flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm',
                    r.id === selectedId ? 'bg-primary-soft text-primary' : 'hover:bg-ink/5')}>
                  <span className="font-medium">{r.label || t('history.noLabel')}</span>
                  <span className="text-[11px] text-subtle">{r.authorName} · {formatWhen(r.createdAt, i18n.language)}</span>
                </button>
              ))
            ) : (
              <p className="px-2 py-4 text-[13px] text-muted">{t('history.noVersions')}</p>
            )}
          </div>
        </div>

        {/* Diff pane */}
        <div className="min-w-0 flex-1">
          {!selectedId ? (
            <div className="grid h-full min-h-[40vh] place-items-center rounded-xl border border-dashed border-line text-center">
              <p className="max-w-xs px-4 text-sm text-muted">
                {t('history.selectToCompare')}
              </p>
            </div>
          ) : detailLoading || !diff ? (
            <p className="px-2 py-8 text-center text-sm text-muted">{t('history.comparing')}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-[12px] text-subtle">
                {t('history.comparePrefix')} <b className="text-ink">{t('history.selectedVersion')}</b> {t('history.compareWith')} <b className="text-ink">{t('history.currentDocument')}</b>
              </p>
              <DiffView file={fileName} hunks={diff.hunks} added={diff.added} removed={diff.removed} />
              {canEdit && (
                <div className="flex items-center justify-end gap-2">
                  {confirmRestore ? (
                    <>
                      <span className="mr-auto text-[12px] text-warn">{t('history.restoreWarn')}</span>
                      <Button variant="ghost" onClick={() => setConfirmRestore(false)}>{t('common.cancel')}</Button>
                      <Button variant="danger" onClick={restore}>{t('history.confirmRestore')}</Button>
                    </>
                  ) : (
                    <Button variant="ghost" onClick={() => setConfirmRestore(true)}>
                      <Icon.undo width={16} height={16} /> {t('history.restoreThis')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
