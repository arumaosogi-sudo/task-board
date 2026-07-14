import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../components/AuthLayout'
import { Card, Button, Input, Field } from '../components/ui'
import { Icon } from '../lib/icons'
import { api } from '../lib/api'

type State = 'default' | 'loading' | 'success'

export default function ForgotPassword() {
  const { t } = useTranslation()
  const [state, setState] = useState<State>('default')
  const [email, setEmail] = useState('')
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  async function submit() {
    setState('loading')
    try {
      // Always succeeds from the UI's perspective (anti-enumeration on the API).
      await api.post('/auth/forgot-password', { email })
    } catch {
      /* ignore — show the same success screen regardless */
    }
    setState('success')
    setCountdown(60)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void submit()
  }

  if (state === 'success') {
    return (
      <AuthLayout>
        <Card className="p-6 sm:p-7">
          <div className="flex flex-col items-center gap-5 py-2 text-center">
            <div className="grid size-16 place-items-center rounded-2xl bg-primary-soft">
              <Icon.bell width={28} height={28} className="text-primary" />
            </div>
            <div className="space-y-1.5">
              <h1 className="font-heading text-h2">{t('auth.checkEmailTitle')}</h1>
              <p className="text-body text-ink">{t('auth.resetSentTo')}</p>
              <p className="font-semibold text-ink">{email}</p>
              <p className="text-body text-muted">{t('auth.linkExpires1h')}</p>
            </div>
            <div className="w-full rounded-xl bg-paper p-4 text-body-sm text-muted">
              {t('auth.noEmailSpam')}{' '}
              {countdown > 0
                ? <span className="text-subtle">{t('auth.resendIn', { count: countdown })}</span>
                : <button onClick={() => void submit()} className="font-medium text-primary hover:underline">{t('auth.resendAgain')}</button>}
            </div>
            <Link to="/" className="text-body text-muted hover:text-ink">{t('auth.backToSignIn')}</Link>
          </div>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-7">
        <div className="mb-6 text-center">
          <h1 className="font-heading text-h2">{t('auth.forgotPassword')}</h1>
          <p className="mt-1 text-body text-muted">{t('auth.forgotPasswordSubtitle')}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t('auth.email')} htmlFor="email">
            <Input id="email" type="email" placeholder="you@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Button type="submit" full size="lg" loading={state === 'loading'} disabled={state === 'loading'}>
            {t('auth.sendResetLink')}
          </Button>
          <p className="text-center text-body text-muted">
            {t('auth.rememberPassword')} <Link to="/" className="font-medium text-primary hover:underline">{t('auth.signIn')}</Link>
          </p>
        </form>
      </Card>
    </AuthLayout>
  )
}
