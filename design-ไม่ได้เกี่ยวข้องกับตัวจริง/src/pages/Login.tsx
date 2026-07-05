// PAGE 1 — Login. States: default + error (wrong password / no account).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Card, Button, Input, PasswordInput, Field, Toggle, Banner } from '../components/ui'
import { StateTabs } from './_StateTabs'

export default function Login() {
  const [state, setState] = useState<'default' | 'error' | 'loading'>('default')
  const [remember, setRemember] = useState(true)
  const error = state === 'error'

  return (
    <AuthLayout>
      <StateTabs value={state} onChange={setState}
        options={[{ value: 'default', label: 'Default' }, { value: 'error', label: 'Error' }, { value: 'loading', label: 'Loading' }]} />
      <Card className="p-6 sm:p-7">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 size-12 rounded-full bg-primary-soft" />
          <h1 className="font-heading text-[22px] font-semibold">Sign in to Task Board</h1>
          <p className="mt-1 text-sm text-muted">ยินดีต้อนรับกลับมา</p>
        </div>

        {error && <div className="mb-4"><Banner>อีเมลหรือรหัสผ่านไม่ถูกต้อง ลองใหม่อีกครั้ง หรือ <Link to="/signup" className="underline">สมัครสมาชิก</Link></Banner></div>}

        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Field label="Username หรือ Email" htmlFor="id">
            <Input id="id" placeholder="you@example.com" state={error ? 'error' : 'default'} defaultValue={error ? 'me@taskboard' : ''} />
          </Field>
          <Field label="Password" htmlFor="pw"
            error={error ? 'รหัสผ่านไม่ถูกต้อง' : undefined}>
            <PasswordInput id="pw" placeholder="••••••••" state={error ? 'error' : 'default'} defaultValue={error ? 'wrong' : ''} />
          </Field>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2.5 text-[13px] text-ink">
              <Toggle checked={remember} onChange={setRemember} label="จดจำการเข้าสู่ระบบ" />
              จดจำฉันไว้ (30 วัน)
            </label>
            <Link to="#" className="text-[13px] font-medium text-primary hover:underline">ลืมรหัสผ่าน?</Link>
          </div>

          <Button full size="lg" loading={state === 'loading'} onClick={() => setState('loading')}>Sign in</Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[12px] text-subtle">
          <span className="h-px flex-1 bg-line" /> หรือ <span className="h-px flex-1 bg-line" />
        </div>
        <Button variant="google" full size="lg">Continue with Google</Button>

        <p className="mt-6 text-center text-sm text-muted">
          New to Task Board? <Link to="/signup" className="font-medium text-primary hover:underline">Sign up</Link>
        </p>
      </Card>
    </AuthLayout>
  )
}
