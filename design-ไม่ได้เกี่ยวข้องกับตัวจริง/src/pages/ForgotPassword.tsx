// NEW SCREEN — Forgot Password (/forgot-password)
// States: default (email input) / loading / success (resend countdown)
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Card, Button, Input, Field } from '../components/ui'
import { Icon } from '../lib/icons'

type State = 'default' | 'loading' | 'success'

export default function ForgotPassword() {
  const [state, setState] = useState<State>('default')
  const [email, setEmail] = useState('')
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')
    setTimeout(() => { setState('success'); setCountdown(60) }, 1200)
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
              <h1 className="font-heading text-xl font-semibold">ตรวจสอบ Email ของคุณ</h1>
              <p className="text-sm text-ink">เราส่งลิงก์รีเซ็ตรหัสผ่านไปที่</p>
              <p className="font-semibold text-ink">{email}</p>
              <p className="text-sm text-muted">ลิงก์หมดอายุใน 1 ชั่วโมง</p>
            </div>
            <div className="w-full rounded-xl bg-paper p-4 text-[13px] text-muted">
              ไม่ได้รับ Email? ตรวจสอบโฟลเดอร์ Spam หรือ{' '}
              {countdown > 0
                ? <span className="text-subtle">ส่งอีกครั้งใน {countdown}s</span>
                : <button onClick={() => setCountdown(60)} className="font-medium text-primary hover:underline">ส่งอีกครั้ง</button>
              }
            </div>
            <Link to="/" className="text-sm text-muted hover:text-ink">← กลับไปหน้า Sign in</Link>
          </div>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-7">
        <div className="mb-6 text-center">
          <h1 className="font-heading text-[22px] font-semibold">ลืมรหัสผ่าน?</h1>
          <p className="mt-1 text-sm text-muted">กรอก Email แล้วเราจะส่งลิงก์รีเซ็ตให้คุณ</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Button type="submit" className="w-full" disabled={state === 'loading'}>
            {state === 'loading'
              ? <><span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> กำลังส่ง…</>
              : 'ส่งลิงก์รีเซ็ตรหัสผ่าน'
            }
          </Button>
          <p className="text-center text-sm text-muted">
            จำรหัสผ่านได้แล้ว?{' '}
            <Link to="/" className="font-medium text-primary hover:underline">Sign in</Link>
          </p>
        </form>
      </Card>
    </AuthLayout>
  )
}
