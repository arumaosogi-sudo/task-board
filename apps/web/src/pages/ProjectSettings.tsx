// /projects/:id/settings — Phase 2 project management.
// General (rename/description), Members (invite/role/remove/transfer), Danger (leave/delete).
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Avatar, Banner, Button, Card, Field, Input, Menu, MenuItem, Modal, Segmented, Tag,
} from '../components/ui'
import { Icon } from '../lib/icons'
import { useAuth } from '../lib/auth'
import { apiError } from '../lib/api'
import {
  useDeleteProject, useInviteMember, useLeaveProject, useProject, useRemoveMember,
  useTransferOwnership, useUpdateMemberRole, useUpdateProject, type ProjectMember, type Role,
} from '../lib/projects'

function RoleTag({ role }: { role: Role }) {
  const tone = role === 'Owner' ? 'primary' : role === 'Editor' ? 'add' : 'neutral'
  return <Tag tone={tone as 'primary' | 'add' | 'neutral'}>{role}</Tag>
}

export default function ProjectSettings() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: project, isLoading, isError } = useProject(id)

  const update = useUpdateProject(id)
  const invite = useInviteMember(id)
  const changeRole = useUpdateMemberRole(id)
  const removeMember = useRemoveMember(id)
  const transfer = useTransferOwnership(id)
  const leave = useLeaveProject(id)
  const del = useDeleteProject()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Exclude<Role, 'Owner'>>('Editor')
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; msg: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [transferTarget, setTransferTarget] = useState<ProjectMember | null>(null)

  // Seed the form once the project loads.
  useEffect(() => {
    if (project) { setName(project.name); setDescription(project.description) }
  }, [project?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center bg-paper"><span className="size-7 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
  }
  if (isError || !project) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper p-4">
        <Card className="max-w-md p-6 text-center">
          <h1 className="font-heading text-lg font-semibold">{t('projectSettings.notFound')}</h1>
          <p className="mt-1 text-sm text-muted">{t('projectSettings.notFoundDesc')}</p>
          <Link to="/home" className="mt-4 inline-block"><Button>{t('common.backHome')}</Button></Link>
        </Card>
      </div>
    )
  }

  const isOwner = project.myRole === 'Owner'
  const canEdit = project.myRole === 'Owner' || project.myRole === 'Editor'

  function flash(tone: 'success' | 'error', msg: string) {
    setBanner({ tone, msg })
    setTimeout(() => setBanner(null), 3500)
  }
  function onErr(err: unknown, fallback: string) {
    flash('error', apiError(err).message || fallback)
  }

  async function saveGeneral() {
    try { await update.mutateAsync({ name: name.trim(), description }); flash('success', t('common.saved')) }
    catch (e) { onErr(e, t('errors.saveFailed')) }
  }
  async function sendInvite() {
    try {
      await invite.mutateAsync({ email: inviteEmail.trim(), role: inviteRole })
      setInviteEmail(''); flash('success', t('projectSettings.inviteSent'))
    } catch (e) { onErr(e, t('projectSettings.inviteFailed')) }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex h-16 items-center gap-3 border-b border-line px-5 sm:px-8">
        <Link to="/home" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-ink/5" aria-label={t('common.back')}>
          <Icon.logout width={18} height={18} className="rotate-180" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-heading text-[15px] font-semibold">{project.name}</h1>
          <p className="text-[12px] text-muted">{t('projectSettings.headerRole', { role: project.myRole })}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 sm:px-8">
        {banner && <Banner tone={banner.tone}>{banner.msg}</Banner>}

        {/* General */}
        <Card className="p-5 sm:p-6">
          <h2 className="font-heading text-base font-semibold">{t('projectSettings.general')}</h2>
          <div className="mt-4 space-y-4">
            <Field label={t('project.nameLabel')} htmlFor="pn">
              <Input id="pn" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} maxLength={120} />
            </Field>
            <Field label={t('project.descriptionLabel')} htmlFor="pd" optional>
              <Input id="pd" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit} maxLength={2000} />
            </Field>
            {canEdit && (
              <div className="flex justify-end">
                <Button onClick={saveGeneral} loading={update.isPending} disabled={!name.trim()}>{t('common.save')}</Button>
              </div>
            )}
          </div>
        </Card>

        {/* Members */}
        <Card className="p-5 sm:p-6">
          <h2 className="font-heading text-base font-semibold">{t('projectSettings.membersCount', { count: project.members.length })}</h2>

          {isOwner && (
            <div className="mt-4 flex flex-col gap-2 rounded-xl bg-paper p-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label={t('projectSettings.inviteByEmail')} htmlFor="inv">
                  <Input id="inv" type="email" placeholder="teammate@example.com" value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)} />
                </Field>
              </div>
              <Segmented value={inviteRole} onChange={(v) => setInviteRole(v)}
                options={[{ value: 'Editor', label: 'Editor' }, { value: 'Viewer', label: 'Viewer' }]} />
              <Button onClick={sendInvite} loading={invite.isPending} disabled={!inviteEmail.trim()}>
                <Icon.invite width={16} height={16} /> {t('projectSettings.invite')}
              </Button>
            </div>
          )}

          <ul className="mt-4 divide-y divide-line">
            {project.members.map((m) => {
              const isSelf = m.userId === user?.id
              const isRowOwner = m.role === 'Owner'
              return (
                <li key={m.userId} className="flex items-center gap-3 py-3">
                  <Avatar initial={m.username.charAt(0).toUpperCase()} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{m.username}{isSelf && <span className="text-muted"> {t('common.youMarker')}</span>}</p>
                    <p className="truncate text-[12px] text-muted">{m.email}</p>
                  </div>
                  <RoleTag role={m.role} />
                  {isOwner && !isRowOwner && (
                    <Menu align="right" trigger={
                      <button className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5" aria-label={t('projectSettings.manageMemberAria')}>
                        <Icon.dots width={18} height={18} />
                      </button>
                    }>
                      {m.role !== 'Editor' && (
                        <MenuItem onClick={() => changeRole.mutate({ userId: m.userId, role: 'Editor' })}>{t('projectSettings.setEditor')}</MenuItem>
                      )}
                      {m.role !== 'Viewer' && (
                        <MenuItem onClick={() => changeRole.mutate({ userId: m.userId, role: 'Viewer' })}>{t('projectSettings.setViewer')}</MenuItem>
                      )}
                      <MenuItem icon={<Icon.pin width={16} height={16} />} onClick={() => setTransferTarget(m)}>{t('projectSettings.transferOwnership')}</MenuItem>
                      <div className="my-1 h-px bg-line" />
                      <MenuItem danger icon={<Icon.trash width={16} height={16} />} onClick={() => removeMember.mutate(m.userId)}>{t('projectSettings.removeFromProject')}</MenuItem>
                    </Menu>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>

        {/* Danger zone */}
        <Card className="border-danger/30 p-5 sm:p-6">
          <h2 className="font-heading text-base font-semibold text-danger">{t('settings.sectionDanger')}</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {!isOwner && (
              <Button variant="secondary" onClick={() => setConfirmLeave(true)}>
                <Icon.logout width={16} height={16} /> {t('projectSettings.leaveProject')}
              </Button>
            )}
            {isOwner && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                <Icon.trash width={16} height={16} /> {t('projectSettings.moveProjectToTrash')}
              </Button>
            )}
          </div>
          {isOwner && <p className="mt-2 text-[12px] text-muted">{t('projectSettings.ownerLeaveHint')}</p>}
        </Card>
      </main>

      {/* Transfer confirm */}
      <Modal
        open={!!transferTarget}
        onClose={() => setTransferTarget(null)}
        title={t('projectSettings.transferTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransferTarget(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={transfer.isPending}
              onClick={async () => {
                if (!transferTarget) return
                try { await transfer.mutateAsync(transferTarget.userId); setTransferTarget(null); flash('success', t('projectSettings.transferred')) }
                catch (e) { setTransferTarget(null); onErr(e, t('projectSettings.transferFailed')) }
              }}>
              {t('projectSettings.confirmTransfer')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          {t('projectSettings.transferBody', { name: transferTarget?.username })}
        </p>
      </Modal>

      {/* Leave confirm */}
      <Modal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title={t('projectSettings.leaveTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmLeave(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={leave.isPending}
              onClick={async () => {
                try { await leave.mutateAsync(); navigate('/home', { replace: true }) }
                catch (e) { setConfirmLeave(false); onErr(e, t('projectSettings.leaveFailed')) }
              }}>
              {t('projectSettings.leaveProject')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('projectSettings.leaveBody', { name: project.name })}</p>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('project.trashTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={del.isPending}
              onClick={async () => {
                try { await del.mutateAsync(project.id); navigate('/home', { replace: true }) }
                catch (e) { setConfirmDelete(false); onErr(e, t('project.deleteFailed')) }
              }}>
              {t('project.moveToTrash')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('project.trashRestoreNote', { name: project.name })}</p>
      </Modal>
    </div>
  )
}
