// Phase 2 — Projects home: list / create / pin / soft-delete, wired to the real API.
// (Work Page, member management UI and Trash view arrive in later slices.)
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Avatar, Banner, Button, Card, EmptyState, Field, Input, Menu, MenuItem, Modal, Skeleton,
} from '../components/ui'
import { Icon } from '../lib/icons'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { SearchOverlay } from '../components/SearchOverlay'
import { NotificationBell } from '../components/NotificationBell'
import { useAuth } from '../lib/auth'
import { apiError } from '../lib/api'
import { useUpdateSetting } from '../lib/account'
import type { ThemeId, Mode } from '../lib/cn'
import {
  useCreateProject, useDeleteProject, useProjects, useTogglePin, type ProjectSummary,
} from '../lib/projects'

function formatDate(iso: string, lang: string): string {
  return new Date(iso).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short', year: '2-digit' })
}

function ProjectCard({ p, onDelete }: { p: ProjectSummary; onDelete: (p: ProjectSummary) => void }) {
  const { t, i18n } = useTranslation()
  const togglePin = useTogglePin()
  const navigate = useNavigate()
  const isOwner = p.myRole === 'Owner'
  return (
    <Card className="group relative flex flex-col transition-shadow hover:shadow-pop">
      <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3">
        <Link to={`/projects/${p.id}/work`} className="truncate font-heading text-[15px] font-semibold text-primary-fg hover:underline">{p.name}</Link>
        <div className="flex items-center gap-1">
          {p.pinned && <span className="text-primary-fg/80" title={t('project.pin')}><Icon.pin width={16} height={16} /></span>}
          <Menu align="right" trigger={
            <button className="grid size-8 place-items-center rounded-lg text-primary-fg/90 hover:bg-white/15" aria-label={t('project.optionsAria')}>
              <Icon.dots width={18} height={18} />
            </button>
          }>
            <MenuItem icon={<Icon.invite width={16} height={16} />} onClick={() => navigate(`/projects/${p.id}/settings`)}>
              {t('project.manageMembers')}
            </MenuItem>
            <MenuItem icon={<Icon.pin width={16} height={16} />}
              onClick={() => togglePin.mutate({ id: p.id, pinned: p.pinned })}>
              {p.pinned ? t('project.unpin') : t('project.pin')}
            </MenuItem>
            {isOwner && (
              <>
                <div className="my-1 h-px bg-line" />
                <MenuItem icon={<Icon.trash width={16} height={16} />} danger onClick={() => onDelete(p)}>
                  {t('project.deleteProject')}
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-3 min-h-[3.6rem] text-[13.5px] leading-relaxed text-muted">
          {p.description || <span className="text-subtle">{t('project.noDescription')}</span>}
        </p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar initial={p.owner.username.charAt(0).toUpperCase()} size={24} />
            <span className="text-[12px] text-muted">Owner: <b className="font-medium text-ink">{p.owner.username}</b></span>
          </div>
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">{p.myRole}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-subtle">
          <Icon.clock width={13} height={13} /> {t('project.cardMeta', { date: formatDate(p.updatedAt, i18n.language), count: p.memberCount })}
        </div>
      </div>
    </Card>
  )
}

function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const create = useCreateProject()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  function reset() {
    setName(''); setDescription(''); setError('')
  }

  async function submit() {
    setError('')
    try {
      await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined })
      reset()
      onClose()
    } catch (err) {
      setError(apiError(err).message || t('project.createFailed'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose() }}
      title={t('project.createTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={() => { reset(); onClose() }}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={create.isPending} disabled={!name.trim()}>{t('common.create')}</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void submit() }}>
        {error && <Banner tone="error">{error}</Banner>}
        <Field label={t('project.nameLabel')} htmlFor="pname">
          <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('project.namePlaceholder')} autoFocus maxLength={120} />
        </Field>
        <Field label={t('project.descriptionLabel')} htmlFor="pdesc" optional>
          <Input id="pdesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('project.descriptionPlaceholder')} maxLength={2000} />
        </Field>
      </form>
    </Modal>
  )
}

export default function Home() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { data: projects, isLoading, isError } = useProjects()
  const del = useDeleteProject()
  const updateSetting = useUpdateSetting()

  // Persist theme/mode chosen from the header switcher to the server.
  function persistTheme(theme: ThemeId, mode: Mode) {
    updateSetting.mutate({ themeColor: theme, themeMode: mode })
  }

  const [createOpen, setCreateOpen] = useState(false)
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  // Global Cmd/Ctrl+K opens the search overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  async function confirmDelete() {
    if (!toDelete) return
    await del.mutateAsync(toDelete.id).catch(() => undefined)
    setToDelete(null)
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex h-16 items-center justify-between border-b border-line px-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-primary-fg font-heading font-bold">T</span>
          <span className="font-heading text-[15px] font-semibold">Task Board</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setSearchOpen(true)}
            className="grid size-10 place-items-center rounded-xl text-muted hover:bg-ink/5" title={t('common.search')} aria-label={t('common.search')}>
            <Icon.search width={18} height={18} />
          </button>
          <NotificationBell />
          <Link to="/trash" className="grid size-10 place-items-center rounded-xl text-muted hover:bg-ink/5" title={t('nav.trash')} aria-label={t('nav.trash')}>
            <Icon.trash width={18} height={18} />
          </Link>
          <Link to="/settings" className="grid size-10 place-items-center rounded-xl text-muted hover:bg-ink/5" title={t('nav.settings')} aria-label={t('nav.settings')}>
            <Icon.gear width={18} height={18} />
          </Link>
          <Menu align="right" trigger={
            <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-ink/5" aria-label={t('home.userMenu')}>
              <Avatar initial={user?.username?.charAt(0).toUpperCase() ?? '?'} size={28} />
              <span className="hidden text-sm font-medium sm:block">{user?.username}</span>
            </button>
          }>
            <div className="px-2.5 py-1.5 text-[12px] text-muted">{user?.email}</div>
            <ThemeSwitcher inline onChange={persistTheme} />
            <div className="my-1 h-px bg-line" />
            <MenuItem icon={<Icon.logout width={16} height={16} />} danger onClick={handleLogout}>{t('common.logout')}</MenuItem>
          </Menu>
        </div>
      </header>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold">{t('nav.allProjects')}</h1>
            <p className="mt-1 text-sm text-muted">{t('home.subtitle')}</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Icon.plus width={18} height={18} /> {t('project.newProject')}
          </Button>
        </div>

        {isError && <Banner tone="error">{t('home.loadError')}</Banner>}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="flex flex-col overflow-hidden">
                <div className="h-12 bg-primary-soft" />
                <div className="space-y-3 p-4">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              </Card>
            ))}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => <ProjectCard key={p.id} p={p} onDelete={setToDelete} />)}
          </div>
        ) : (
          !isError && (
            <EmptyState
              icon={<Icon.folder width={26} height={26} />}
              title={t('home.emptyTitle')}
              body={t('home.emptyBody')}
              action={<Button onClick={() => setCreateOpen(true)}><Icon.plus width={18} height={18} /> {t('project.createProject')}</Button>}
            />
          )
        )}
      </main>

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={t('project.trashTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={confirmDelete} loading={del.isPending}>{t('project.moveToTrash')}</Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          {t('project.trashBody', { name: toDelete?.name })}
        </p>
      </Modal>
    </div>
  )
}
