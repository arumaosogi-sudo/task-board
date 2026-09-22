import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { AuthLayout } from '../components/AuthLayout'
import { Card, Button, Input, PasswordInput, Field, Banner } from '../components/ui'
import { Icon } from '../lib/icons'
import { api, apiError } from '../lib/api'
import { errorMessage } from '../lib/errorMessage'

type Uname = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/

function UsernameStatus({ s, t }: { s: Uname; t: TFunction }) {
  if (s === 'checking') return <span className="flex items-center gap-1 text-caption text-muted"><span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> {t('auth.checking')}</span>
  if (s === 'available') return <span className="flex items-center gap-1 text-caption text-success"><Icon.check width={13} height={13} /> {t('auth.usernameAvailable')}</span>
  if (s === 'taken') return <span className="flex items-center gap-1 text-caption text-danger"><Icon.x width={13} height={13} /> {t('auth.usernameTaken')}</span>
  if (s === 'invalid') return <span className="flex items-center gap-1 text-caption text-danger"><Icon.x width={13} height={13} /> {t('auth.usernameRule')}</span>
  return null
}

export default function SignUp() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [username, setUsername] = useState('')
  const [uname, setUname] = useState<Uname>('idle')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Debounced (500ms) username availability check.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!username) return setUname('idle')
    if (!USERNAME_RE.test(username)) return setUname('invalid')

    setUname('checking')
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ available: boolean }>(`/auth/check-username/${encodeURIComponent(username)}`)
        setUname(res.data.available ? 'available' : 'taken')
      } catch {
        setUname('idle')
      }
    }, 500)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [username])

  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit =
    !!email && password.length >= 8 && !mismatch && uname === 'available' && agree && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!canSubmit) return
    setLoading(true)
    try {
      // Two happy paths, both land on the "check your email" screen:
      //  - 'verify-email-sent'   → brand-new account
      //  - 'verification-resent' → reclaimed an existing UNVERIFIED account
      //    (backend resent the link + reset the password instead of erroring).
      const res = await api.post<{ message: string; emailDelivery?: 'sent' | 'failed' }>(
        '/auth/register',
        { username, email, password },
      )
      navigate('/verify-email', {
        state: {
          email,
          resent: res.data.message === 'verification-resent',
          // Thread the honest delivery outcome so the pending screen can warn the
          // user (instead of claiming "sent") when SMTP failed.
          delivery: res.data.emailDelivery ?? 'sent',
        },
      })
    } catch (err) {
      if (apiError(err).code === 'username-taken') setUname('taken')
      setError(errorMessage(err, t, t('auth.signUpFailed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-7">
        <h1 className="text-center font-heading text-h2">{t('auth.createAccount')}</h1>

        {error && <div className="mt-5"><Banner tone="error">{error}</Banner></div>}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Field label={t('auth.email')} htmlFor="em" hint={t('auth.emailHint')}>
            <Input id="em" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label={t('auth.password')} htmlFor="pw" hint={t('auth.passwordHint')}>
            <PasswordInput id="pw" showToggle={false} placeholder={t('auth.passwordCreatePlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Field label={t('auth.confirmPassword')} htmlFor="pw2" error={mismatch ? t('auth.passwordMismatch') : undefined}>
            <PasswordInput id="pw2" showToggle={false} placeholder={t('auth.confirmPasswordPlaceholder')} value={confirm} onChange={(e) => setConfirm(e.target.value)}
              state={mismatch ? 'error' : 'default'} required />
          </Field>
          <Field label={t('auth.username')} htmlFor="un">
            <Input id="un" placeholder={t('auth.usernamePlaceholder')} value={username} onChange={(e) => setUsername(e.target.value)}
              state={uname === 'taken' || uname === 'invalid' ? 'error' : uname === 'available' ? 'success' : 'default'}
              trailing={<span className="pr-2"><UsernameStatus s={uname} t={t} /></span>} />
          </Field>

          <label className="flex items-start gap-2.5 text-body-sm text-muted">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 size-4 rounded border-line text-primary focus:ring-primary" />
            <span>{t('auth.agreePrefix')} <Link to="#" className="text-primary hover:underline">{t('auth.terms')}</Link> {t('auth.and')} <Link to="#" className="text-primary hover:underline">{t('auth.privacy')}</Link></span>
          </label>

          <Button type="submit" full size="lg" loading={loading} disabled={!canSubmit}>{t('auth.createAccountButton')}</Button>
        </form>

        <p className="mt-6 text-center text-body text-muted">
          {t('auth.haveAccount')} <Link to="/" className="font-medium text-primary hover:underline">{t('auth.signIn')}</Link>
        </p>
      </Card>
    </AuthLayout>
  )
}
