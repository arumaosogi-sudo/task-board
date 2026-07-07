// /project-changes — "Changes": revisions by everyone in the user's projects,
// with an extra per-person filter and a "BY: <author>" line on each row.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { Avatar, Banner, Button, Card, EmptyState, Menu, MenuItem, Segmented, Skeleton } from '../components/ui'
import { Icon } from '../lib/icons'
import { RevisionDiffDrawer, type DiffTarget } from '../components/RevisionDiffDrawer'
import { useProjectChanges, type ProjectChangeItem, type UpdatesRange } from '../lib/updates'
import { useProjects } from '../lib/projects'

function formatWhen(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function ProjectChanges() {
  const { t, i18n } = useTranslation()
  const [range, setRange] = useState<UpdatesRange>('30d')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [authorId, setAuthorId] = useState<string | null>(null)
  const [target, setTarget] = useState<DiffTarget | null>(null)

  const { data: projects } = useProjects()
  // Unfiltered-by-author feed (shares its cache key with the display query when
  // authorId is null) — used to build a stable person filter list.
  const { data: allItems } = useProjectChanges(range, projectId, null)
  const { data: items, isLoading, isError } = useProjectChanges(range, projectId, authorId)

  const rangeOptions = useMemo(
    () => [
      { value: '7d' as const, label: t('updates.range7d') },
      { value: '30d' as const, label: t('updates.range30d') },
      { value: 'all' as const, label: t('updates.rangeAll') },
    ],
    [t],
  )

  // Distinct authors present in the current project/range window.
  const people = useMemo(() => {
    const seen = new Map<string, string>()
    for (const it of allItems ?? []) if (!seen.has(it.authorId)) seen.set(it.authorId, it.authorName)
    return Array.from(seen, ([id, name]) => ({ id, name }))
  }, [allItems])

  const activeProjectName = projects?.find((p) => p.id === projectId)?.name ?? t('updates.allProjects')
  const activePersonName = people.find((p) => p.id === authorId)?.name ?? t('updates.allPeople')

  // Dropping the project filter can strand a now-invalid author selection; the
  // people list simply won't contain it, so the label falls back to "everyone".

  function openDiff(u: ProjectChangeItem) {
    setTarget({
      projectId: u.projectId,
      fileId: u.fileId,
      revisionId: u.id,
      fileName: u.fileName,
      title: `${u.projectName} · ${u.fileName}`,
      subtitle: `${t('updates.by')} ${u.authorName} · ${formatWhen(u.createdAt, i18n.language)}`,
    })
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-4">
          <h1 className="font-heading text-2xl font-semibold">{t('updates.changesTitle')}</h1>
          <p className="text-sm text-muted">{t('updates.changesSubtitle')}</p>
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
          <Menu align="left" trigger={
            <Button variant="secondary">
              <Icon.invite width={16} height={16} /> {activePersonName}
            </Button>
          }>
            <MenuItem
              icon={authorId === null ? <Icon.check width={16} height={16} /> : <span className="size-4" />}
              onClick={() => setAuthorId(null)}
            >
              {t('updates.allPeople')}
            </MenuItem>
            {people.map((p) => (
              <MenuItem
                key={p.id}
                icon={authorId === p.id ? <Icon.check width={16} height={16} /> : <span className="size-4" />}
                onClick={() => setAuthorId(p.id)}
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
                  <Avatar initial={u.authorName.charAt(0).toUpperCase()} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-heading text-[15px] font-semibold text-ink">{u.projectName}</span>
                      <Icon.chevronR width={14} height={14} className="text-subtle" />
                      <span className="text-[13px] text-primary">{u.fileName}</span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {t('updates.by')}: <b className="font-medium text-ink">{u.authorName}</b>
                    </p>
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
            title={t('updates.changesEmptyTitle')}
            body={t('updates.changesEmptyBody')}
          />
        )}
      </div>

      <RevisionDiffDrawer target={target} onClose={() => setTarget(null)} />
    </AppShell>
  )
}
