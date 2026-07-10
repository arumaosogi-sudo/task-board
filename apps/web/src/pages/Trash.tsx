// /trash — owner's soft-deleted projects: restore or permanently delete (30-day window).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { Banner, Button, Card, EmptyState, Modal, Skeleton } from '../components/ui'
import { Icon } from '../lib/icons'
import { usePermanentDelete, useRestoreProject, useTrash, type ProjectSummary } from '../lib/projects'

function daysLeft(deletedAt: string | null): number {
  if (!deletedAt) return 30
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86_400_000
  return Math.max(0, Math.ceil(30 - elapsed))
}

export default function Trash() {
  const { t } = useTranslation()
  const { data: projects, isLoading, isError } = useTrash()
  const restore = useRestoreProject()
  const purge = usePermanentDelete()
  const [toPurge, setToPurge] = useState<ProjectSummary | null>(null)

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="font-heading text-display">{t('nav.trash')}</h1>
          <p className="mt-1 text-body-sm text-muted">{t('trash.subtitle')}</p>
        </div>

        {isError && <Banner tone="error">{t('trash.loadError')}</Banner>}

        {isLoading ? (
          <ul className="space-y-3">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Card className="flex items-center gap-3 p-4">
                  <Skeleton className="size-10 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-9 w-20 rounded-[10px]" />
                  <Skeleton className="h-9 w-24 rounded-[10px]" />
                </Card>
              </li>
            ))}
          </ul>
        ) : projects && projects.length > 0 ? (
          <ul className="space-y-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Card className="flex items-center gap-3 p-4">
                  <div className="grid size-10 place-items-center rounded-xl bg-ink/5 text-muted"><Icon.trash width={18} height={18} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                    <p className="text-caption text-muted">{t('trash.daysLeft', { count: daysLeft(p.deletedAt) })}</p>
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
      </div>

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
    </AppShell>
  )
}
