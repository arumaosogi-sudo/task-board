// NEW SCREEN — Reset Password (/reset-password?token=xxx)
// States: default / loading / success
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Card, Button, Input, Field } from '../components/ui'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'

type Strength = 'none' | 'weak' | 'ok' | 'strong'

function getStrength(pw: string): Strength {
  if (!pw) return 'none'
  const hasLong = pw.length >= 15
  const hasMix = pw.length >= 8 && /[0-9]/.test(pw) && /[a-z]/.test(pw)
  const hasSpecial = /[^a-z0-9]/i.test(pw)
  if (hasLong || (hasMix && hasSpecial)) return 'strong'
  if (hasMix) return 'ok'
  return 'weak'
}

function StrengthBar({ strength }: { strength: Strength }) {
  const fill = { none: 0, weak: 1, ok: 2, strong: 3 }[strength]
  const color = strength === 'weak' ? 'bg-danger' : strength === 'ok' ? 'bg-warn' : 'bg-success'
  const label = { none: '', weak: 'อ่อน', ok: 'ปานกลาง', strong: 'แข็งแกร่ง' }[strength]
  const labelColor = { none: '', weak: 'text-danger', ok: 'text-warn', strong: 'text-success' }[strength]

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i < fill ? color : 'bg-line')} />
        ))}
      </div>
      {strength !== 'none' && <p className={cn('text-[11px] font-medium', labelColor)}>รหัสผ่าน: {label}</p>}
    </div>
  )
}

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [state, setState] = useState<'default' | 'loading' | 'success'>('default')
  const strength = getStrength(password)
  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit = strength !== 'none' && strength !== 'weak' && password === confirm

  if (state === 'success') {
    return (
      <AuthLayout>
        <Card className="p-6 sm:p-7">
          <div className="flex flex-col items-center gap-5 py-2 text-center">
            <div className="grid size-16 place-items-center rounded-2xl bg-success/10">
              <Icon.check width={28} height={28} className="text-success" />
            </div>
            <div className="space-y-1">
              <h1 className="font-heading text-xl font-semibold">รีเซ็ตรหัสผ่านสำเร็จ</h1>
              <p className="text-sm text-muted">รหัสผ่านใหม่ของคุณพร้อมใช้งานแล้ว</p>
            </div>
            <Link to="/" className="w-full">
              <Button className="w-full">กลับไป Sign in</Button>
            </Link>
          </div>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-7">
        <div className="mb-6 text-center">
          <h1 className="font-heading text-[22px] font-semibold">ตั้งรหัสผ่านใหม่</h1>
          <p className="mt-1 text-sm text-muted">ยาวอย่างน้อย 8 ตัว มีตัวเลขและตัวพิมพ์เล็ก</p>
        </div>
        <div className="space-y-4">
          <Field label="รหัสผ่านใหม่" htmlFor="pw">
            <div className="relative">
              <Input
                id="pw"
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-ink">
                {showPw ? <Icon.eyeOff width={16} height={16} /> : <Icon.eye width={16} height={16} />}
              </button>
            </div>
            <StrengthBar strength={strength} />
          </Field>

          <Field label="ยืนยันรหัสผ่าน" htmlFor="confirm">
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              state={mismatch ? 'error' : 'default'}
            />
            {mismatch && <p className="mt-1 text-[12px] text-danger">รหัสผ่านไม่ตรงกัน</p>}
          </Field>

          <Button
            className="w-full"
            disabled={!canSubmit || state === 'loading'}
            onClick={() => { setState('loading'); setTimeout(() => setState('success'), 1200) }}
          >
            {state === 'loading'
              ? <><span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> กำลังบันทึก…</>
              : 'บันทึกรหัสผ่านใหม่'
            }
          </Button>
        </div>
      </Card>
    </AuthLayout>
  )
}
