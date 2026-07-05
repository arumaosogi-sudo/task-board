// NEW SCREEN — Email Verification Pending (/verify-email)
// Shown after Sign Up before the user verifies their email
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Card, Button } from '../components/ui'
import { Icon } from '../lib/icons'

const EMAIL = 'me@example.com'

export default function EmailVerify() {
  const [countdown, setCountdown] = useState(60)
  const [resent, setResent] = useState(false)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  function handleResend() {
    setResent(true)
    setCountdown(60)
    setTimeout(() => setResent(false), 3000)
  }

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-7">
        <div className="flex flex-col items-center gap-6 py-2 text-center">
          {/* icon */}
          <div className="relative">
            <div className="grid size-20 place-items-center rounded-3xl bg-primary-soft">
              <Icon.bell width={32} height={32} className="text-primary" />
            </div>
            <div className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-success ring-2 ring-card">
              <Icon.check width={12} height={12} className="text-white" />
            </div>
          </div>

          {/* title */}
          <div className="space-y-1">
            <h1 className="font-heading text-[22px] font-semibold">ตรวจสอบ Email ของคุณ</h1>
          </div>

          {/* message */}
          <div className="space-y-1.5">
            <p className="text-sm text-muted">เราส่ง Email ยืนยันไปที่</p>
            <p className="font-semibold text-ink">{EMAIL}</p>
            <p className="text-sm text-muted">คลิกลิงก์ใน Email เพื่อเริ่มใช้งาน Task Board</p>
          </div>

          {/* resent feedback */}
          {resent && (
            <div className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-2.5 text-[13px] text-success">
              <Icon.check width={14} height={14} /> ส่ง Email ใหม่แล้ว
            </div>
          )}

          {/* resend */}
          <div className="w-full space-y-2">
            <Button
              variant="secondary"
              className="w-full"
              disabled={countdown > 0}
              onClick={handleResend}
            >
              {countdown > 0 ? `ส่งอีกครั้งได้ใน ${countdown}s` : 'ส่ง Email ยืนยันอีกครั้ง'}
            </Button>
            <p className="text-[12px] text-muted">
              ใช้ Email ผิด?{' '}
              <Link to="/signup" className="font-medium text-primary hover:underline">เปลี่ยน Email</Link>
            </p>
          </div>

          {/* hint */}
          <div className="w-full rounded-xl bg-paper p-3.5 text-left text-[12px] text-muted">
            <p className="font-medium text-ink">ไม่ได้รับ Email?</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>ตรวจสอบโฟลเดอร์ Spam หรือ Junk</li>
              <li>ตรวจสอบว่า Email ถูกต้อง</li>
              <li>รอสักครู่แล้วกด &quot;ส่งอีกครั้ง&quot;</li>
            </ul>
          </div>

          <Link to="/" className="text-sm text-muted hover:text-ink">← กลับไปหน้า Sign in</Link>
        </div>
      </Card>
    </AuthLayout>
  )
}
