// /my-updates — "My Edits": revisions the current user saved, across every project.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { Banner, Button, Card, EmptyState, Menu, MenuItem, Segmented, Skeleton, Tag } from '../components/ui'
import { Icon } from '../lib/icons'
import { RevisionDiffDrawer, type DiffTarget } from '../components/RevisionDiffDrawer'
import { useMyUpdates, type MyUpdateItem, type UpdatesRange } from '../lib/updates'
import { useProjects } from '../lib/projects'

function formatWhen(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function MyUpdates() {
  const { t, i18n } = useTranslation()
  const [range, setRange] = useState<UpdatesRange>('30d')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [target, setTarget] = useState<DiffTarget | null>(null)

  const { data: projects } = useProjects()
  const { data: items, isLoading, isError } = useMyUpdates(range, projectId)

  const rangeOptions = useMemo(
    () => [
      { value: '7d' as const, label: t('updates.range7d') },
      { value: '30d' as const, label: t('updates.range30d') },
      { value: 'all' as const, label: t('updates.rangeAll') },
    ],
    [t],
  )
  const activeProjectName = projects?.find((p) => p.id === projectId)?.name ?? t('updates.allProjects')

  function openDiff(u: MyUpdateItem) {
    setTarget({
      projectId: u.projectId,
      fileId: u.fileId,
      revisionId: u.id,
      fileName: u.fileName,
      title: `${u.projectName} · ${u.fileName}`,
      subtitle: formatWhen(u.createdAt, i18n.language),
    })
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-4">
          <h1 className="font-heading text-2xl font-semibold">{t('updates.myTitle')}</h1>
          <p className="text-sm text-muted">{t('updates.mySubtitle')}</p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Segmented value={range} onChange={setRange} options={rangeOptions} />
          <Menu align="left" trigger={
            <Button variant="secondary">
              <Icon.folder width={16} height={16} /> {activeProjectName}
            </Button>
          }>
            <MenuItem
              icon={projectId === null ? <Icon.check width={16} height={16} /> : <span className="size-4" />}
              onClick={() => setProjectId(null)}
            >
              {t('updates.allProjects')}
            </MenuItem>
            {projects?.map((p) => (
              <MenuItem
                key={p.id}
                icon={projectId === p.id ? <Icon.check width={16} height={16} /> : <span className="size-4" />}
                onClick={() => setProjectId(p.id)}
              >
                {p.name}
              </MenuItem>
            ))}
          </Menu>
        </div>

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
        ) : items && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((u) => (
              <Card key={u.id} className="cursor-pointer p-4 transition-shadow hover:shadow-pop" onClick={() => openDiff(u)}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-heading text-[15px] font-semibold text-ink">{u.projectName}</span>
                      <Icon.chevronR width={14} height={14} className="text-subtle" />
                      <span className="text-[13px] text-primary">{u.fileName}</span>
                      <Tag tone={u.scope === 'owner' ? 'primary' : 'neutral'}>
                        {u.scope === 'owner' ? t('updates.scopeOwner') : t('updates.scopeMember')}
                      </Tag>
                    </div>
                    {u.label && <p className="mt-1 text-[13.5px] text-muted">{u.label}</p>}
                    <div className="mt-2.5 flex items-center gap-1.5 text-[12px] text-subtle">
                      <Icon.clock width={13} height={13} /> {formatWhen(u.createdAt, i18n.language)}
                    </div>
                  </div>
                  <Icon.chevronR className="mt-1 shrink-0 text-subtle" />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Icon.edit width={26} height={26} />}
            title={t('updates.myEmptyTitle')}
            body={t('updates.myEmptyBody')}
          />
        )}
      </div>

      <RevisionDiffDrawer target={target} onClose={() => setTarget(null)} />
    </AppShell>
  )
}
