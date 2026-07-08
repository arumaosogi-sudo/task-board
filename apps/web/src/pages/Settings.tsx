// /settings — account, appearance (theme), language, notifications, danger zone.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Banner, Button, Card, Field, Input, Modal, PasswordInput, Segmented, Toggle,
} from '../components/ui'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { Icon } from '../lib/icons'
import { useAuth } from '../lib/auth'
import { apiError } from '../lib/api'
import { setLanguage, type Language } from '../i18n'
import {
  useChangePassword, useDeleteAccount, useUpdateProfile, useUpdateSetting,
} from '../lib/account'
import type { Mode, ThemeId } from '../lib/cn'

type NotifyKey = 'notifyInvite' | 'notifyMention' | 'notifyRevision'

export default function Settings() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, logout, refreshMe } = useAuth()

  const updateProfile = useUpdateProfile()
  const changePassword = useChangePassword()
  const updateSetting = useUpdateSetting()
  const deleteAccount = useDeleteAccount()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [notify, setNotify] = useState({ notifyInvite: true, notifyMention: true, notifyRevision: true })
  const [lang, setLang] = useState<Language>((user?.setting?.language as Language) || 'th')
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; msg: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletePw, setDeletePw] = useState('')

  // Seed forms from the loaded profile/settings.
  useEffect(() => {
    if (!user) return
    setUsername(user.username)
    setEmail(user.email)
    if (user.setting) {
      setNotify({
        notifyInvite: user.setting.notifyInvite,
        notifyMention: user.setting.notifyMention,
        notifyRevision: user.setting.notifyRevision,
      })
      setLang((user.setting.language as Language) || 'th')
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function flash(tone: 'success' | 'error', msg: string) {
    setBanner({ tone, msg })
    setTimeout(() => setBanner(null), 3500)
  }
  function onErr(err: unknown, fallback: string) {
    flash('error', apiError(err).message || fallback)
  }

  async function saveProfile() {
    try {
      const body: { username?: string; email?: string } = {}
      if (username.trim() && username.trim() !== user?.username) body.username = username.trim()
      if (Object.keys(body).length === 0) return
      await updateProfile.mutateAsync(body)
      await refreshMe()
      flash('success', t('settings.profileSaved'))
    } catch (e) { onErr(e, t('errors.saveFailed')) }
  }

  async function savePassword() {
    if (newPw !== confirmPw) { flash('error', t('settings.passwordMismatch')); return }
    try {
      await changePassword.mutateAsync({ currentPassword: curPw, newPassword: newPw })
      setCurPw(''); setNewPw(''); setConfirmPw('')
      flash('success', t('settings.passwordChanged'))
    } catch (e) { onErr(e, t('errors.saveFailed')) }
  }

  async function persistTheme(theme: ThemeId, mode: Mode) {
    try { await updateSetting.mutateAsync({ themeColor: theme, themeMode: mode }) }
    catch (e) { onErr(e, t('errors.saveFailed')) }
  }

  async function persistLanguage(next: Language) {
    setLang(next)
    setLanguage(next) // apply immediately
    try { await updateSetting.mutateAsync({ language: next }); await refreshMe() }
    catch (e) { onErr(e, t('errors.saveFailed')) }
  }

  async function persistNotify(key: NotifyKey, value: boolean) {
    setNotify((n) => ({ ...n, [key]: value }))
    try { await updateSetting.mutateAsync({ [key]: value }) }
    catch (e) { onErr(e, t('errors.saveFailed')); setNotify((n) => ({ ...n, [key]: !value })) }
  }

  async function doDeleteAccount() {
    try {
      await deleteAccount.mutateAsync({ password: deletePw || undefined })
      await logout()
      navigate('/', { replace: true })
    } catch (e) { onErr(e, t('errors.saveFailed')) }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex h-16 items-center gap-3 border-b border-line px-5 sm:px-8">
        <Link to="/home" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-ink/5" aria-label={t('common.back')}>
          <Icon.arrowLeft width={18} height={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-heading text-[15px] font-semibold">{t('settings.title')}</h1>
          <p className="text-[12px] text-muted">{t('settings.subtitle')}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 sm:px-8">
        {banner && <Banner tone={banner.tone}>{banner.msg}</Banner>}

        {/* Account */}
        <Card className="p-5 sm:p-6">
          <h2 className="font-heading text-base font-semibold">{t('settings.sectionAccount')}</h2>
          <div className="mt-4 space-y-4">
            <Field label={t('settings.username')} htmlFor="un">
              <Input id="un" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} autoComplete="username" />
            </Field>
            <Field label={t('settings.email')} htmlFor="em"
              hint={user && !user.emailVerified ? t('settings.emailUnverified') : undefined}>
              <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" readOnly disabled className="opacity-70 cursor-not-allowed" />
            </Field>
            <div className="flex justify-end">
              <Button onClick={saveProfile} loading={updateProfile.isPending}
                disabled={!username.trim() || username.trim() === user?.username}>
                {t('settings.saveProfile')}
              </Button>
            </div>
          </div>

          <div className="my-5 h-px bg-line" />

          <h3 className="text-sm font-semibold text-ink">{t('settings.changePassword')}</h3>
          <div className="mt-3 space-y-4">
            <Field label={t('settings.currentPassword')} htmlFor="cpw">
              <PasswordInput id="cpw" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('settings.newPassword')} htmlFor="npw">
                <PasswordInput id="npw" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
              </Field>
              <Field label={t('settings.confirmPassword')} htmlFor="npw2"
                error={confirmPw && newPw !== confirmPw ? t('settings.passwordMismatch') : undefined}>
                <PasswordInput id="npw2" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={savePassword} loading={changePassword.isPending}
                disabled={!curPw || newPw.length < 8 || newPw !== confirmPw}>
                {t('settings.changePassword')}
              </Button>
            </div>
          </div>
        </Card>

        {/* Appearance */}
        <Card className="p-5 sm:p-6">
          <h2 className="font-heading text-base font-semibold">{t('settings.sectionAppearance')}</h2>
          <div className="mt-4">
            <ThemeSwitcher onChange={persistTheme} />
          </div>
        </Card>

        {/* Language */}
        <Card className="p-5 sm:p-6">
          <h2 className="font-heading text-base font-semibold">{t('settings.sectionLanguage')}</h2>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-ink">{t('settings.languageLabel')}</p>
            <Segmented<Language>
              value={lang}
              onChange={persistLanguage}
              options={[
                { value: 'th', label: t('settings.languageTh') },
                { value: 'en', label: t('settings.languageEn') },
              ]}
            />
          </div>
        </Card>

        {/* Notifications */}
        <Card className="p-5 sm:p-6">
          <h2 className="font-heading text-base font-semibold">{t('settings.sectionNotifications')}</h2>
          <div className="mt-4 divide-y divide-line">
            {([
              ['notifyInvite', t('settings.notifyInvite')],
              ['notifyMention', t('settings.notifyMention')],
              ['notifyRevision', t('settings.notifyRevision')],
            ] as [NotifyKey, string][]).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-3">
                <span className="text-sm text-ink">{label}</span>
                <Toggle checked={notify[key]} onChange={(v) => persistNotify(key, v)} label={label} />
              </div>
            ))}
          </div>
        </Card>

        {/* Danger zone */}
        <Card className="border-danger/30 p-5 sm:p-6">
          <h2 className="font-heading text-base font-semibold text-danger">{t('settings.sectionDanger')}</h2>
          <p className="mt-2 text-[13px] text-muted">{t('settings.deleteAccountDesc')}</p>
          <div className="mt-4">
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Icon.trash width={16} height={16} /> {t('settings.deleteAccount')}
            </Button>
          </div>
        </Card>
      </main>

      {/* Delete account confirm */}
      <Modal
        open={confirmDelete}
        onClose={() => { setConfirmDelete(false); setDeletePw('') }}
        title={t('settings.deleteAccountConfirm')}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setConfirmDelete(false); setDeletePw('') }}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={deleteAccount.isPending} onClick={doDeleteAccount}>
              {t('settings.deleteAccountButton')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('settings.deleteAccountWarn')}</p>
          <Field label={t('settings.passwordToConfirm')} htmlFor="delpw">
            <PasswordInput id="delpw" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} autoComplete="current-password" />
          </Field>
          <p className="text-[12px] text-subtle">{t('settings.ownsProjectsHint')}</p>
        </div>
      </Modal>
    </div>
  )
}
