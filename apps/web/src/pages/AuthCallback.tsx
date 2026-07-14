// Landing page for the Google OAuth redirect: /auth/callback?accessToken=...
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Card, Button, Banner } from '../components/ui'
import { setAccessToken } from '../lib/api'
import { useAuth } from '../lib/auth'

export default function AuthCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refreshMe } = useAuth()
  const [error, setError] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const accessToken = params.get('accessToken')
    if (!accessToken) {
      setError('ไม่พบ access token จากการเข้าสู่ระบบด้วย Google')
      return
    }
    ;(async () => {
      setAccessToken(accessToken)
      try {
        await refreshMe()
        navigate('/home', { replace: true })
      } catch {
        setError('เข้าสู่ระบบด้วย Google ไม่สำเร็จ')
      }
    })()
  }, [params, navigate, refreshMe])

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-7">
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          {error ? (
            <>
              <Banner tone="error">{error}</Banner>
              <Link to="/" className="w-full"><Button full>กลับไป Sign in</Button></Link>
            </>
          ) : (
            <>
              <span className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-body text-muted">กำลังเข้าสู่ระบบ…</p>
            </>
          )}
        </div>
      </Card>
    </AuthLayout>
  )
}
