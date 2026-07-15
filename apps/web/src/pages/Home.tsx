// Phase 2 — Projects home: list / create / pin / soft-delete, wired to the real API.
// (Work Page, member management UI and Trash view arrive in later slices.)
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Avatar, Banner, Button, Card, EmptyState, Field, Input, Menu, MenuItem, Modal, Skeleton,
} from '../components/ui'
import { Icon } from '../lib/icons'
import { AppShell } from '../components/AppShell'
import { apiError } from '../lib/api'
import {
  ProjectsApi,
  useCreateProject, useDeleteProject, useLeaveProject, useProjects, useTogglePin,
  type ProjectSummary,
} from '../lib/projects'

function formatDate(iso: string, lang: string): string {
  return new Date(iso).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short', year: '2-digit' })
}

function ProjectCard({ p, onDelete, onLeave }: {
  p: ProjectSummary
  onDelete: (p: ProjectSummary) => void
  onLeave: (p: ProjectSummary) => void
}) {
  const { t, i18n } = useTranslation()
  const togglePin = useTogglePin()
  const navigate = useNavigate()
  const isOwner = p.myRole === 'Owner'
  return (
    <Card interactive className="group relative flex flex-col border-line/80">
      {/* Header bar. The title carries a stretched-link overlay (after:absolute
          after:inset-0) so clicking anywhere on the card navigates to the Work
          page — one keyboard-accessible anchor, no JS event bubbling needed. */}
      <div className="flex items-center justify-between gap-2 rounded-t-xl bg-primary px-4 py-3">
        <Link
          to={`/projects/${p.id}/work`}
          className="min-w-0 flex-1 truncate font-heading text-h3 text-primary-fg after:absolute after:inset-0 after:content-[''] focus-visible:underline focus-visible:outline-none"
        >
          {p.name}
        </Link>
        {/* Action zone — lifted above the stretched-link overlay (relative z-10)
            so the pin badge and ⋯ menu stay clickable and never navigate. */}
        <div className="relative z-10 flex items-center gap-0.5">
          {p.pinned && (
            <span className="grid size-8 place-items-center text-primary-fg" title={t('project.pin')}>
              <Icon.pin width={16} height={16} />
            </span>
          )}
          <Menu align="right" trigger={
            <button
              className="grid size-8 place-items-center rounded-lg text-primary-fg/90 transition-colors hover:bg-white/20 focus-visible:bg-white/20 focus-visible:outline-none"
              aria-label={t('project.optionsAria')}
            >
              <Icon.dots width={18} height={18} />
            </button>
          }>
            <MenuItem icon={<Icon.chevronR width={16} height={16} />} onClick={() => navigate(`/projects/${p.id}/work`)}>
              {t('project.openProject')}
            </MenuItem>
            <MenuItem icon={<Icon.invite width={16} height={16} />} onClick={() => navigate(`/projects/${p.id}/settings`)}>
              {t('project.manageMembers')}
            </MenuItem>
            <MenuItem icon={<Icon.pin width={16} height={16} />}
              onClick={() => togglePin.mutate({ id: p.id, pinned: p.pinned })}>
              {p.pinned ? t('project.unpin') : t('project.pin')}
            </MenuItem>
            {/* Danger action depends on role: owners can delete the project,
                members can only leave it. Never both. */}
            {isOwner ? (
              <>
                <div className="my-1 h-px bg-line" />
                <MenuItem icon={<Icon.trash width={16} height={16} />} danger onClick={() => onDelete(p)}>
                  {t('project.deleteProject')}
                </MenuItem>
              </>
            ) : (
              <>
                <div className="my-1 h-px bg-line" />
                <MenuItem icon={<Icon.logout width={16} height={16} />} danger onClick={() => onLeave(p)}>
                  {t('projectCard.leaveProject')}
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-3 min-h-[3.6rem] text-body-sm leading-relaxed text-muted">
          {p.description || <span className="text-subtle">{t('project.noDescription')}</span>}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar initial={p.owner.username.charAt(0).toUpperCase()} size={24} />
            <span className="truncate text-caption text-muted">{t('project.ownerLabel')} <b className="font-medium text-ink">{p.owner.username}</b></span>
          </div>
          <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">{p.myRole}</span>
        </div>
        <div className="mt-3 flex items-center gap-1.5 border-t border-line/70 pt-3 text-caption text-subtle">
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
  const [inviteEmail, setInviteEmail] = useState('')
  const [error, setError] = useState('')
  // Set only when the project was created but the follow-up invite failed. The
  // project is already live, so the footer switches to a plain "close" action to
  // avoid a re-submit that would create a duplicate.
  const [warning, setWarning] = useState('')
  const [createdOk, setCreatedOk] = useState(false)

  function reset() {
    setName(''); setDescription(''); setInviteEmail(''); setError(''); setWarning(''); setCreatedOk(false)
  }

  function close() { reset(); onClose() }

  async function submit() {
    setError(''); setWarning('')
    try {
      const created = await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined })
      const email = inviteEmail.trim()
      if (email) {
        try {
          await ProjectsApi.invite(created.id, { email, role: 'Editor' })
        } catch (err) {
          // Best-effort invite: the project stands, we never roll it back. Surface a
          // warning and keep the modal open so the message is actually seen.
          setCreatedOk(true)
          setWarning(apiError(err).message || t('project.inviteWarnFailed'))
          return
        }
      }
      close()
    } catch (err) {
      setError(apiError(err).message || t('project.createFailed'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('project.createTitle')}
      footer={
        createdOk ? (
          <Button onClick={close}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
            <Button onClick={submit} loading={create.isPending} disabled={!name.trim()}>{t('common.create')}</Button>
          </>
        )
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!createdOk && name.trim()) void submit() }}>
        {error && <Banner tone="error">{error}</Banner>}
        {warning && <Banner tone="warn">{warning}</Banner>}
        <Field label={t('project.nameLabel')} htmlFor="pname">
          <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('project.namePlaceholder')} autoFocus maxLength={120} />
        </Field>
        <Field label={t('project.descriptionLabel')} htmlFor="pdesc" optional>
          <Input id="pdesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('project.descriptionPlaceholder')} maxLength={2000} />
        </Field>
        <Field label={t('project.inviteEmail')} htmlFor="pinv" optional>
          <Input id="pinv" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
            placeholder={t('project.inviteEmailPlaceholder')} maxLength={254} />
        </Field>
      </form>
    </Modal>
  )
}

export default function Home() {
  const { t } = useTranslation()
  const { data: projects, isLoading, isError } = useProjects()
  const del = useDeleteProject()
  const [searchParams] = useSearchParams()

  const [toLeave, setToLeave] = useState<ProjectSummary | null>(null)
  // The leave mutation is keyed by the currently-selected project. When no card
  // is queued for leaving the id is empty and the mutation simply stays idle.
  const leave = useLeaveProject(toLeave?.id ?? '')
  const [leaveError, setLeaveError] = useState('')

  // `?filter=mine` scopes the list to projects the user owns. The nav item that
  // drives this lives in AppShell; here we just react to the query param.
  const filterMine = searchParams.get('filter') === 'mine'
  const visibleProjects = filterMine
    ? projects?.filter((p) => p.myRole === 'Owner')
    : projects

  const [createOpen, setCreateOpen] = useState(false)
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null)

  async function confirmDelete() {
    if (!toDelete) return
    await del.mutateAsync(toDelete.id).catch(() => undefined)
    setToDelete(null)
  }

  async function confirmLeave() {
    if (!toLeave) return
    setLeaveError('')
    try {
      await leave.mutateAsync()
      setToLeave(null)
    } catch (err) {
      setLeaveError(apiError(err).message || t('project.leaveFailed'))
    }
  }

  const heading = filterMine ? t('nav.myProjects') : t('nav.allProjects')

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-display">{heading}</h1>
          <p className="mt-1 text-body-sm text-muted">{t('home.subtitle')}</p>
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
      ) : visibleProjects && visibleProjects.length > 0 ? (
        <div className="grid gap-4 pb-24 sm:grid-cols-2 xl:grid-cols-3">
          {visibleProjects.map((p) => (
            <ProjectCard key={p.id} p={p} onDelete={setToDelete} onLeave={setToLeave} />
          ))}
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
          {t('project.trashBody', { name: toDelete?.name, count: toDelete?.memberCount ?? 0 })}
        </p>
      </Modal>

      {/* Leave confirm — members only; owners get the delete flow above instead. */}
      <Modal
        open={!!toLeave}
        onClose={() => { setToLeave(null); setLeaveError('') }}
        title={t('project.leaveTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setToLeave(null); setLeaveError('') }}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={confirmLeave} loading={leave.isPending}>{t('projectCard.leaveProject')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          {leaveError && <Banner tone="error">{leaveError}</Banner>}
          <p className="text-sm text-muted">
            {t('project.leaveBody', { name: toLeave?.name })}
          </p>
        </div>
      </Modal>

      {/* FAB — create project. Fixed to the viewport so it stays reachable while
          scrolling; the grid carries pb-24 so it never covers the last card. */}
      <button
        onClick={() => setCreateOpen(true)}
        className="fixed bottom-6 right-6 z-30 grid size-14 place-items-center rounded-full bg-primary text-primary-fg shadow-pop transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={t('project.newProject')}
      >
        <Icon.plus width={24} height={24} />
      </button>
    </AppShell>
  )
}
