// NEW SCREENS GALLERY — /new-screens
// Review page for newly designed screens (for owner approval before Dev)
import { Link } from 'react-router-dom'
import { Icon } from '../lib/icons'
import { Card } from '../components/ui'
import { ThemeSwitcher } from '../components/ThemeSwitcher'

const newScreens = [
  {
    to: '/forgot-password',
    n: 'A',
    name: 'Forgot Password',
    desc: 'กรอก Email / loading / success + resend countdown',
    status: 'Auth flow',
  },
  {
    to: '/reset-password',
    n: 'B',
    name: 'Reset Password',
    desc: 'new password + confirm + strength bar (weak/ok/strong)',
    status: 'Auth flow',
  },
  {
    to: '/verify-email',
    n: 'C',
    name: 'Email Verification',
    desc: 'หลัง Sign Up — resend countdown 60s + hint',
    status: 'Auth flow',
  },
  {
    to: '/project-settings',
    n: 'D',
    name: 'Project Settings',
    desc: 'Members + roles + invite + Transfer/Leave/Delete modals',
    status: 'Project mgmt',
  },
  {
    to: '/search-demo',
    n: 'E',
    name: 'Search Overlay',
    desc: 'Cmd+K global search — grouped results + keyboard nav',
    status: 'Component',
  },
  {
    to: '/trash',
    n: 'F',
    name: 'Trash',
    desc: 'Soft-deleted projects + files — restore / delete permanently',
    status: 'Data mgmt',
  },
  {
    to: '/notifications',
    n: 'G',
    name: 'Notification Center',
    desc: 'Filter tabs + date groups + invite actions + mark read',
    status: 'Notifications',
  },
]

const fixes = [
  { label: 'Sunset/Amber contrast', detail: 'แก้ accent color ให้เข้มขึ้น — ผ่าน WCAG AA บน white', file: 'design-tokens.json' },
  { label: 'Settings active state', detail: 'เปลี่ยนจาก bg-white/15 (ซ้ำกับ hover) → bg-primary/25 + ring', file: 'Shell.tsx' },
  { label: 'Touch targets', detail: 'Hamburger/bell/avatar → size-11 (44px), FmtBtn + shrink-0', file: 'Shell.tsx + Editor.tsx' },
  { label: 'Mobile file tree', detail: 'เพิ่มปุ่ม folder → bottom sheet 70vh', file: 'WorkPage.tsx' },
  { label: 'Error states', detail: 'เพิ่ม error state ใน Updates + Work Page (warning + retry)', file: 'UpdatesView.tsx + WorkPage.tsx' },
]

export default function NewScreensGallery() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="flex h-16 items-center gap-3 border-b border-line bg-card px-6">
        <Link to="/gallery" className="grid size-9 place-items-center rounded-lg hover:bg-ink/5">
          <Icon.arrowLeft width={18} height={18} />
        </Link>
        <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-primary-fg font-heading font-bold text-sm">T</span>
        <h1 className="font-heading text-[15px] font-semibold">จอใหม่ + การแก้ไข — รอการอนุมัติ</h1>
        <div className="ml-auto"><ThemeSwitcher inline /></div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-10">
        {/* new screens */}
        <section>
          <h2 className="mb-1 font-heading text-xl font-semibold">จอที่ออกแบบใหม่ (7 จอ)</h2>
          <p className="mb-5 text-sm text-muted">คลิกเพื่อดูตัวอย่างแต่ละจอ — ทำงานกับ 12 ธีม + ทุก state</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {newScreens.map((s) => (
              <Link key={s.to} to={s.to}>
                <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-pop">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft font-heading text-sm font-bold text-primary">
                    {s.n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink">{s.name}</p>
                      <span className="rounded-md bg-line px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        {s.status}
                      </span>
                    </div>
                    <p className="truncate text-[12px] text-muted">{s.desc}</p>
                  </div>
                  <Icon.chevronR className="shrink-0 text-subtle" />
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* bug fixes */}
        <section>
          <h2 className="mb-1 font-heading text-xl font-semibold">การแก้ไข 5 ปัญหา</h2>
          <p className="mb-5 text-sm text-muted">แก้ไขในไฟล์ที่มีอยู่แล้ว — ตรวจสอบได้ใน gallery หลัก</p>
          <div className="space-y-2">
            {fixes.map((f) => (
              <Card key={f.label} className="flex items-start gap-3 p-4">
                <div className="grid size-6 shrink-0 place-items-center rounded-full bg-success/10 mt-0.5">
                  <Icon.check width={12} height={12} className="text-success" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{f.label}</p>
                  <p className="text-[12px] text-muted">{f.detail}</p>
                </div>
                <span className="shrink-0 rounded-md bg-line px-2 py-1 font-mono text-[11px] text-muted">
                  {f.file}
                </span>
              </Card>
            ))}
          </div>
        </section>

        {/* links */}
        <section>
          <h2 className="mb-3 font-heading text-xl font-semibold">ลิงก์ด่วน</h2>
          <div className="flex flex-wrap gap-2">
            <Link to="/gallery">
              <Card className="flex items-center gap-2 px-4 py-2.5 text-sm hover:shadow-pop">
                <Icon.grid width={16} height={16} className="text-primary" /> หน้าหลัก Gallery
              </Card>
            </Link>
            <Link to="/design-system">
              <Card className="flex items-center gap-2 px-4 py-2.5 text-sm hover:shadow-pop">
                <Icon.sliders width={16} height={16} className="text-primary" /> Design System
              </Card>
            </Link>
            <Link to="/responsive">
              <Card className="flex items-center gap-2 px-4 py-2.5 text-sm hover:shadow-pop">
                <Icon.image width={16} height={16} className="text-primary" /> Responsive Preview
              </Card>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
