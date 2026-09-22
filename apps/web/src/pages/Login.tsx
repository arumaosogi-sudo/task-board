import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../components/AuthLayout'
import { Card, Button, Input, PasswordInput, Field, Toggle, Banner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { api, apiError, API_URL } from '../lib/api'
import { errorMessage } from '../lib/errorMessage'

// The Google OAuth routes redirect here with ?error=<code> when the flow fails
// (see api GoogleOAuthExceptionFilter), so the user lands on a real page with a
// banner instead of the API's raw JSON. Map each code to a localized message.
function googleErrorKey(code: string | null): string | null {
  switch (code) {
    case 'google-unconfigured':
      return 'auth.googleUnconfigured'
    case 'google-cancelled':
      return 'auth.googleCancelled'
    case 'google-failed':
      return 'auth.googleFailed'
    default:
      // Any other google-* code degrades to the generic failure message.
      return code?.startsWith('google') ? 'auth.googleFailed' : null
  }
}

export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  // Set by flows that bounce through login (e.g. /accept-invite when signed out).
  const next = (location.state as { next?: string } | null)?.next ?? '/home'

  const [identity, setIdentity] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(() => {
    const key = googleErrorKey(searchParams.get('error'))
    return key ? t(key) : ''
  })
  const [needsVerify, setNeedsVerify] = useState(false)
  const [resent, setResent] = useState(false)

  // Strip ?error= from the URL once captured, so a refresh or share doesn't
  // re-surface the banner. The message is already in state, so this is cosmetic.
  useEffect(() => {
    if (!searchParams.has('error')) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('error')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNeedsVerify(false)
    setLoading(true)
    try {
      await login(identity, password)
      navigate(next, { replace: true })
    } catch (err) {
      if (apiError(err).code === 'email-not-verified') {
        setNeedsVerify(true)
        setError(t('auth.emailNotVerified'))
      } else {
        setError(errorMessage(err, t, t('auth.signInFailed')))
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    // identity may be a username; only attempt when it looks like an email.
    if (!identity.includes('@')) {
      navigate('/verify-email')
      return
    }
    try {
      await api.post('/auth/resend-verify', { email: identity })
      setResent(true)
    } catch {
      setResent(true) // response is intentionally generic
    }
  }

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-7">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-primary-soft">
            <span className="font-heading text-xl font-bold text-primary">T</span>
          </div>
          <h1 className="font-heading text-h2">{t('auth.signInTitle')}</h1>
          <p className="mt-1 text-body text-muted">{t('auth.welcomeBack')}</p>
        </div>

        {error && (
          <div className="mb-4">
            <Banner tone="error">
              {error}
              {needsVerify && (
                <div className="mt-2">
                  {resent ? (
                    <span className="text-success">{t('auth.verifyResent')}</span>
                  ) : (
                    <button type="button" onClick={handleResend} className="font-medium underline">
                      {t('auth.resendVerify')}
                    </button>
                  )}
                </div>
              )}
            </Banner>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field label={t('auth.identityLabel')} htmlFor="id">
            <Input
              id="id"
              type="text"
              placeholder="you@example.com"
              autoComplete="username"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              required
            />
          </Field>
          <Field label={t('auth.password')} htmlFor="pw">
            <PasswordInput
              id="pw"
              showToggle={false}
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2.5 text-body-sm text-ink cursor-pointer">
              <Toggle checked={remember} onChange={setRemember} label={t('auth.rememberToggle')} />
              {t('auth.rememberMe')}
            </label>
            <Link to="/forgot-password" className="text-body-sm font-medium text-primary hover:underline">
              {t('auth.forgotPassword')}
            </Link>
          </div>

          <Button type="submit" full size="lg" loading={loading}>{t('auth.signIn')}</Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-caption text-subtle">
          <span className="h-px flex-1 bg-line" /> {t('auth.or')} <span className="h-px flex-1 bg-line" />
        </div>
        <Button
          variant="google"
          full
          size="lg"
          type="button"
          onClick={() => { window.location.href = `${API_URL}/auth/google` }}
        >
          {t('auth.continueGoogle')}
        </Button>

        <p className="mt-6 text-center text-body text-muted">
          {t('auth.newToTaskBoard')}{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">{t('auth.signUp')}</Link>
        </p>
      </Card>
    </AuthLayout>
  )
}
