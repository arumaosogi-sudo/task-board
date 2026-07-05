// Index of every deliverable screen — entry point for reviewers.
import { Link } from 'react-router-dom'
import { Icon } from '../lib/icons'
import { Card } from '../components/ui'
import { ThemeSwitcher } from '../components/ThemeSwitcher'

const screens = [
  { to: '/design-system', n: 'DS', name: 'Design System', desc: 'Tokens · components · 6 colors × light/dark' },
  { to: '/responsive', n: '📱', name: 'Responsive — มือถือ & iPad', desc: 'พรีวิวทุกจอในกรอบเครื่องจริง' },
  { to: '/', n: '1', name: 'Login', desc: 'default / error / loading' },
  { to: '/signup', n: '2', name: 'Sign up', desc: 'username check · terms · email verify' },
  { to: '/home', n: '3', name: 'Home — all projects', desc: 'default / loading / empty / error · FAB' },
  { to: '/my-projects', n: '4', name: 'My Projects', desc: 'shared component, owner filter' },
  { to: '/my-updates', n: '5', name: 'My Updates', desc: 'list → diff view' },
  { to: '/project-changes', n: '6', name: 'Project Changes', desc: 'BY: person · filter by person' },
  { to: '/settings', n: '7', name: 'Settings', desc: '2-column · theme · danger zone' },
  { to: '/work', n: '8', name: 'Work Page', desc: 'file tree · A4 thumbnails · + new' },
  { to: '/editor', n: '9', name: 'Editor', desc: 'tools · format bar · presence · history' },
]

export default function Gallery() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="flex h-16 items-center gap-3 border-b border-line bg-card px-6">
        <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-primary-fg font-heading font-bold">T</span>
        <h1 className="font-heading text-[15px] font-semibold">Task Board — Screens</h1>
        <div className="ml-auto"><ThemeSwitcher inline /></div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h2 className="font-heading text-2xl font-semibold">หน้าจอทั้งหมด</h2>
        <p className="mb-6 text-sm text-muted">9 หน้า + Design System · desktop &amp; mobile · ทุก state · เปลี่ยนธีมได้</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {screens.map((s) => (
            <Link key={s.to} to={s.to}>
              <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-pop">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft font-heading text-sm font-bold text-primary">{s.n}</span>
                <div className="min-w-0 flex-1"><p className="font-medium text-ink">{s.name}</p><p className="truncate text-[12px] text-muted">{s.desc}</p></div>
                <Icon.chevronR className="text-subtle" />
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
