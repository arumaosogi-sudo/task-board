// /trash — owner's soft-deleted projects: restore or permanently delete (30-day window).
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Banner, Button, Card, EmptyState, Modal } from '../components/ui'
import { Icon } from '../lib/icons'
import { usePermanentDelete, useRestoreProject, useTrash, type ProjectSummary } from '../lib/projects'

function daysLeft(deletedAt: string | null): number {
  if (!deletedAt) return 30
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86_400_000
  return Math.max(0, Math.ceil(30 - elapsed))
}

export default function Trash() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: projects, isLoading, isError } = useTrash()
  const restore = useRestoreProject()
  const purge = usePermanentDelete()
  const [toPurge, setToPurge] = useState<ProjectSummary | null>(null)

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex h-16 items-center gap-3 border-b border-line px-5 sm:px-8">
        <button onClick={() => navigate('/home')} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-ink/5" aria-label={t('common.back')}>
          <Icon.logout width={18} height={18} className="rotate-180" />
        </button>
        <div>
          <h1 className="font-heading text-[15px] font-semibold">{t('nav.trash')}</h1>
          <p className="text-[12px] text-muted">{t('trash.subtitle')}</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        {isError && <Banner tone="error">{t('trash.loadError')}</Banner>}

        {isLoading ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : projects && projects.length > 0 ? (
          <ul className="space-y-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Card className="flex items-center gap-3 p-4">
                  <div className="grid size-10 place-items-center rounded-xl bg-ink/5 text-muted"><Icon.trash width={18} height={18} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                    <p className="text-[12px] text-muted">{t('trash.daysLeft', { count: daysLeft(p.deletedAt) })}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => restore.mutate(p.id)} loading={restore.isPending && restore.variables === p.id}>{t('trash.restore')}</Button>
                  <Button variant="danger" size="sm" onClick={() => setToPurge(p)}>{t('trash.deleteForever')}</Button>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          !isError && (
            <EmptyState
              icon={<Icon.trash width={26} height={26} />}
              title={t('trash.emptyTitle')}
              body={t('trash.emptyBody')}
              action={<Link to="/home"><Button>{t('common.backHome')}</Button></Link>}
            />
          )
        )}
      </main>

      <Modal
        open={!!toPurge}
        onClose={() => setToPurge(null)}
        title={t('trash.deleteForeverTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToPurge(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={purge.isPending}
              onClick={async () => { if (toPurge) { await purge.mutateAsync(toPurge.id).catch(() => undefined); setToPurge(null) } }}>
              {t('trash.deleteForever')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('trash.deleteForeverBody', { name: toPurge?.name })}</p>
      </Modal>
    </div>
  )
}
