// /verify-email
//  - with ?token=xxx  → verifies the email against the API (verifying/success/error)
//  - without a token  → "pending" screen after sign-up, with resend
import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../components/AuthLayout'
import { Card, Button, Banner } from '../components/ui'
import { Icon } from '../lib/icons'
import { api, apiError } from '../lib/api'

type VerifyState = 'verifying' | 'verified' | 'error'

function TokenVerify({ token }: { token: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<VerifyState>('verifying')
  const [error, setError] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // guard StrictMode double-invoke
    ran.current = true
    ;(async () => {
      try {
        await api.post('/auth/verify-email', { token })
        setState('verified')
      } catch (err) {
        setError(apiError(err).message || t('auth.verifyInvalidExpired'))
        setState('error')
      }
    })()
  }, [token])

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-7">
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          {state === 'verifying' && (
            <>
              <span className="size-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <h1 className="font-heading text-xl font-semibold">{t('auth.verifying')}</h1>
            </>
          )}
          {state === 'verified' && (
            <>
              <div className="grid size-16 place-items-center rounded-2xl bg-success/10">
                <Icon.check width={28} height={28} className="text-success" />
              </div>
              <div className="space-y-1">
                <h1 className="font-heading text-xl font-semibold">{t('auth.verifySuccess')}</h1>
                <p className="text-sm text-muted">{t('auth.accountReady')}</p>
              </div>
              <Link to="/" className="w-full"><Button full>{t('auth.signIn')}</Button></Link>
            </>
          )}
          {state === 'error' && (
            <>
              <Banner tone="error">{error}</Banner>
              <Link to="/verify-email" className="w-full"><Button full variant="secondary">{t('auth.requestNewVerifyLink')}</Button></Link>
            </>
          )}
        </div>
      </Card>
    </AuthLayout>
  )
}

function VerifyPending({ email }: { email: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [countdown, setCountdown] = useState(60)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  async function handleResend() {
    if (!email) {
      navigate('/signup')
      return
    }
    setError('')
    try {
      await api.post('/auth/resend-verify', { email })
      setResent(true)
      setCountdown(60)
      setTimeout(() => setResent(false), 3000)
    } catch (err) {
      setError(apiError(err).message || t('auth.sendEmailFailed'))
    }
  }

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-7">
        <div className="flex flex-col items-center gap-6 py-2 text-center">
          <div className="relative">
            <div className="grid size-20 place-items-center rounded-3xl bg-primary-soft">
              <Icon.bell width={32} height={32} className="text-primary" />
            </div>
            <div className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-success ring-2 ring-card">
              <Icon.check width={12} height={12} className="text-white" />
            </div>
          </div>

          <h1 className="font-heading text-[22px] font-semibold">{t('auth.checkEmailTitle')}</h1>

          <div className="space-y-1.5">
            <p className="text-sm text-muted">{t('auth.verifySentTo')}</p>
            <p className="font-semibold text-ink">{email || t('auth.yourEmail')}</p>
            <p className="text-sm text-muted">{t('auth.verifyClickLink')}</p>
          </div>

          {resent && (
            <div className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-2.5 text-[13px] text-success">
              <Icon.check width={14} height={14} /> {t('auth.emailResent')}
            </div>
          )}
          {error && <Banner tone="error">{error}</Banner>}

          <div className="w-full space-y-2">
            <Button variant="secondary" full disabled={countdown > 0} onClick={handleResend}>
              {countdown > 0 ? t('auth.resendInBtn', { count: countdown }) : t('auth.resendVerifyEmail')}
            </Button>
            <p className="text-[12px] text-muted">
              {t('auth.wrongEmail')} <Link to="/signup" className="font-medium text-primary hover:underline">{t('auth.changeEmail')}</Link>
            </p>
          </div>

          <Link to="/" className="text-sm text-muted hover:text-ink">{t('auth.backToSignIn')}</Link>
        </div>
      </Card>
    </AuthLayout>
  )
}

export default function EmailVerify() {
  const [params] = useSearchParams()
  const location = useLocation()
  const token = params.get('token')
  const email = (location.state as { email?: string } | null)?.email ?? ''

  return token ? <TokenVerify token={token} /> : <VerifyPending email={email} />
}
