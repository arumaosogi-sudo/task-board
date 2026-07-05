// PAGE 2 — Sign up. Email+password+confirm+username, password-rule hint,
// realtime username availability (idle/checking/available/taken), terms checkbox.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Card, Button, Input, PasswordInput, Field } from '../components/ui'
import { Icon } from '../lib/icons'

type Uname = 'idle' | 'checking' | 'available' | 'taken'

function UsernameStatus({ s }: { s: Uname }) {
  if (s === 'checking') return <span className="flex items-center gap-1 text-[12px] text-muted"><span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> กำลังตรวจสอบ…</span>
  if (s === 'available') return <span className="flex items-center gap-1 text-[12px] text-success"><Icon.check width={13} height={13} /> ใช้ได้</span>
  if (s === 'taken') return <span className="flex items-center gap-1 text-[12px] text-danger"><Icon.x width={13} height={13} /> ชื่อนี้ถูกใช้แล้ว</span>
  return null
}

export default function SignUp() {
  const [uname, setUname] = useState<Uname>('idle')
  const [agree, setAgree] = useState(false)
  const [val, setVal] = useState('')

  const onUname = (v: string) => {
    setVal(v)
    if (!v) return setUname('idle')
    setUname('checking')
    // simulate realtime availability check
    setTimeout(() => setUname(v.toLowerCase() === 'admin' ? 'taken' : 'available'), 700)
  }

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-7">
        <h1 className="text-center font-heading text-[22px] font-semibold">Create your account</h1>

        <Button variant="google" full size="lg" className="mt-6">Continue with Google</Button>
        <p className="mt-1.5 text-center text-[12px] text-subtle">เข้าผ่าน Google จะตั้งแค่ Username เท่านั้น</p>

        <div className="my-5 flex items-center gap-3 text-[12px] text-subtle">
          <span className="h-px flex-1 bg-line" /> หรือสมัครด้วยอีเมล <span className="h-px flex-1 bg-line" />
        </div>

        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Field label="Email" htmlFor="em" hint="เราจะส่งลิงก์ยืนยันอีเมลไปให้ — จำเป็นสำหรับการเชิญสมาชิก">
            <Input id="em" type="email" placeholder="you@example.com" />
          </Field>
          <Field label="Password" htmlFor="pw"
            hint="อย่างน้อย 15 ตัวอักษร หรือ อย่างน้อย 8 ตัวที่มีตัวเลขและตัวพิมพ์เล็ก">
            <PasswordInput id="pw" placeholder="สร้างรหัสผ่าน" />
          </Field>
          <Field label="Confirm password" htmlFor="pw2">
            <PasswordInput id="pw2" placeholder="พิมพ์รหัสผ่านอีกครั้ง" />
          </Field>
          <Field label="Username" htmlFor="un">
            <Input id="un" placeholder="เลือกชื่อผู้ใช้" value={val} onChange={(e) => onUname(e.target.value)}
              state={uname === 'taken' ? 'error' : uname === 'available' ? 'success' : 'default'}
              trailing={<span className="pr-2"><UsernameStatus s={uname} /></span>} />
          </Field>

          <label className="flex items-start gap-2.5 text-[13px] text-muted">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 size-4 rounded border-line text-primary focus:ring-primary" />
            <span>ฉันยอมรับ <Link to="#" className="text-primary hover:underline">เงื่อนไขการใช้งาน</Link> และ <Link to="#" className="text-primary hover:underline">นโยบายความเป็นส่วนตัว</Link></span>
          </label>

          <Button full size="lg" disabled={!agree || uname === 'taken'}>สร้างบัญชี</Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          มีบัญชีอยู่แล้ว? <Link to="/" className="font-medium text-primary hover:underline">เข้าสู่ระบบ</Link>
        </p>
      </Card>
    </AuthLayout>
  )
}
