// /activity — consolidated revision feed (Sprint 3 IA consolidation).
//
// Merges the former "My Edits" (/my-updates) and "Changes" (/project-changes)
// pages into one screen with a scope toggle. Per ADR 0002 this is a UI-only
// merge: the two backend endpoints stay separate, so we mount both hooks and
// gate them with `enabled` to fire only the selected scope's request. Rows are
// normalized to a single view type (ActivityRow) so there is one JSX path.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { Avatar, Banner, Button, Card, EmptyState, Menu, MenuItem, Segmented, Skeleton, Tag } from '../components/ui'
import { Icon } from '../lib/icons'
import { RevisionDiffDrawer, type DiffTarget } from '../components/RevisionDiffDrawer'
import {
  useMyUpdates, useProjectChanges,
  type MyUpdateItem, type ProjectChangeItem, type UpdatesRange,
} from '../lib/updates'
import { useProjects } from '../lib/projects'

type Scope = 'all' | 'mine'

/** Single view model both endpoint shapes normalize into. */
interface ActivityRow {
  id: string
  projectId: string
  projectName: string
  fileId: string
  fileName: string
  label: string | null
  createdAt: string
  author?: string // present in "all" scope (ProjectChangeItem.authorName)
  scope?: 'owner' | 'member' // present in "mine" scope (MyUpdateItem.scope)
}

function formatWhen(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function toRowFromMine(u: MyUpdateItem): ActivityRow {
  return {
    id: u.id, projectId: u.projectId, projectName: u.projectName,
    fileId: u.fileId, fileName: u.fileName, label: u.label, createdAt: u.createdAt,
    scope: u.scope,
  }
}

function toRowFromAll(u: ProjectChangeItem): ActivityRow {
  return {
    id: u.id, projectId: u.projectId, projectName: u.projectName,
    fileId: u.fileId, fileName: u.fileName, label: u.label, createdAt: u.createdAt,
    author: u.authorName,
  }
}

export default function Activity() {
  const { t, i18n } = useTranslation()
  const [scope, setScope] = useState<Scope>('all')
  const [range, setRange] = useState<UpdatesRange>('30d')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [target, setTarget] = useState<DiffTarget | null>(null)

  const { data: projects } = useProjects()
  // Both hooks are declared (rules of hooks) but only the active scope fetches.
  const mine = useMyUpdates(range, projectId, scope === 'mine')
  const all = useProjectChanges(range, projectId, null, scope === 'all')
  const active = scope === 'mine' ? mine : all

  const rows: ActivityRow[] | undefined = useMemo(() => {
    if (scope === 'mine') return mine.data?.map(toRowFromMine)
    return all.data?.map(toRowFromAll)
  }, [scope, mine.data, all.data])

  const scopeOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('updates.scopeAll') },
      { value: 'mine' as const, label: t('updates.scopeMine') },
    ],
    [t],
  )
  const rangeOptions = useMemo(
    () => [
      { value: '7d' as const, label: t('updates.range7d') },
      { value: '30d' as const, label: t('updates.range30d') },
      { value: 'all' as const, label: t('updates.rangeAll') },
    ],
    [t],
  )
  const activeProjectName = projects?.find((p) => p.id === projectId)?.name ?? t('updates.allProjects')

  function openDiff(row: ActivityRow) {
    const subtitle = row.author
      ? `${t('updates.by')} ${row.author} · ${formatWhen(row.createdAt, i18n.language)}`
      : formatWhen(row.createdAt, i18n.language)
    setTarget({
      projectId: row.projectId,
      fileId: row.fileId,
      revisionId: row.id,
      fileName: row.fileName,
      title: `${row.projectName} · ${row.fileName}`,
      subtitle,
    })
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-4">
          <h1 className="font-heading text-display">{t('updates.activityTitle')}</h1>
          <p className="mt-1 text-body-sm text-muted">{t('updates.activitySubtitle')}</p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Segmented value={scope} onChange={setScope} options={scopeOptions} />
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

        {active.isError ? (
          <Banner tone="error">{t('updates.loadError')}</Banner>
        ) : active.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="space-y-2.5 p-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </Card>
            ))}
          </div>
        ) : rows && rows.length > 0 ? (
          // key={scope} remounts the list so it fades on toggle, avoiding a jump.
          <ul key={scope} className="space-y-3 animate-fade">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => openDiff(row)}
                  className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Card interactive className="p-4">
                    <div className="flex items-start gap-3">
                      {row.author && <Avatar initial={row.author.charAt(0).toUpperCase()} size={36} />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-heading text-[15px] font-semibold text-ink">{row.projectName}</span>
                          <Icon.chevronR width={14} height={14} className="text-subtle" />
                          <span className="text-body-sm text-primary">{row.fileName}</span>
                          {row.scope && (
                            <Tag tone={row.scope === 'owner' ? 'primary' : 'neutral'}>
                              {row.scope === 'owner' ? t('updates.scopeOwner') : t('updates.scopeMember')}
                            </Tag>
                          )}
                        </div>
                        {row.author && (
                          <p className="mt-0.5 text-caption text-muted">
                            {t('updates.by')}: <b className="font-medium text-ink">{row.author}</b>
                          </p>
                        )}
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
            icon={<Icon.edit width={26} height={26} />}
            title={scope === 'mine' ? t('updates.activityEmptyMineTitle') : t('updates.activityEmptyAllTitle')}
            body={scope === 'mine' ? t('updates.activityEmptyMineBody') : t('updates.activityEmptyAllBody')}
          />
        )}
      </div>

      <RevisionDiffDrawer target={target} onClose={() => setTarget(null)} />
    </AppShell>
  )
}
