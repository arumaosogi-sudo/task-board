// /accept-invite?token=xxx — target of the invitation email link.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../components/AuthLayout'
import { Card, Button, Banner } from '../components/ui'
import { Icon } from '../lib/icons'
import { useAuth } from '../lib/auth'
import { api, apiError } from '../lib/api'

type State = 'working' | 'done' | 'error' | 'need-login'

export default function AcceptInvite() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, initializing } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<State>('working')
  const [error, setError] = useState('')
  const [projectName, setProjectName] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (initializing || ran.current) return
    ran.current = true
    if (!token) {
      setError(t('invite.noToken'))
      setState('error')
      return
    }
    if (!user) {
      // Preserve the invite link so the user can return after signing in.
      setState('need-login')
      return
    }
    ;(async () => {
      try {
        const res = await api.post<{ name: string }>('/projects/accept-invite', { token })
        setProjectName(res.data.name)
        setState('done')
      } catch (err) {
        setError(apiError(err).message || t('invite.invalidExpired'))
        setState('error')
      }
    })()
    // `t` is read only for error/label strings; re-running this accept-invite POST
    // because the UI language changed would be incorrect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializing, user, token])

  const back = `/accept-invite?token=${encodeURIComponent(token)}`

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-7">
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          {state === 'working' && (
            <>
              <span className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted">{t('invite.accepting')}</p>
            </>
          )}
          {state === 'need-login' && (
            <>
              <div className="grid size-16 place-items-center rounded-2xl bg-primary-soft"><Icon.invite width={28} height={28} className="text-primary" /></div>
              <h1 className="font-heading text-xl font-semibold">{t('invite.needLoginTitle')}</h1>
              <p className="text-sm text-muted">{t('invite.needLoginDesc')}</p>
              <Link to="/" state={{ next: back }} className="w-full"><Button full>{t('invite.goToSignIn')}</Button></Link>
            </>
          )}
          {state === 'done' && (
            <>
              <div className="grid size-16 place-items-center rounded-2xl bg-success/10"><Icon.check width={28} height={28} className="text-success" /></div>
              <h1 className="font-heading text-xl font-semibold">{t('invite.joinedTitle')}</h1>
              <p className="text-sm text-muted">{t('invite.joinedDesc', { project: projectName })}</p>
              <Button full onClick={() => navigate('/home', { replace: true })}>{t('invite.goToProject')}</Button>
            </>
          )}
          {state === 'error' && (
            <>
              <Banner tone="error">{error}</Banner>
              <Link to="/home" className="w-full"><Button full variant="secondary">{t('common.backHome')}</Button></Link>
            </>
          )}
        </div>
      </Card>
    </AuthLayout>
  )
}
