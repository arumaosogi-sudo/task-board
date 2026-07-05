// App shell: collapsible sidebar (4 nav items + settings) + top bar
// (search, notifications, profile). Shared by Home / My Projects / Updates /
// Changes / Settings. Responsive: sidebar becomes an off-canvas drawer on mobile.
import { type ReactNode, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { cn } from '../lib/cn'
import { Icon } from '../lib/icons'
import { Avatar, Menu, MenuItem } from './ui'
import { ThemeSwitcher } from './ThemeSwitcher'
import { notifications } from '../data/mock'

const nav = [
  { to: '/home', label: 'Project ทั้งหมด', en: 'All projects', icon: Icon.grid },
  { to: '/my-projects', label: 'Project ของฉัน', en: 'My projects', icon: Icon.folder },
  { to: '/my-updates', label: 'สิ่งที่ฉันแก้', en: 'My updates', icon: Icon.edit },
  { to: '/project-changes', label: 'ความเปลี่ยนแปลงใน project', en: 'Project changes', icon: Icon.clock },
]

function Logo() {
  return (
    <Link to="/home" className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-primary-fg font-heading font-bold">T</span>
      <span className="font-heading text-[15px] font-semibold text-nav-fg">Task Board</span>
    </Link>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 space-y-1 px-3 py-4">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} onClick={onNavigate}
            className={({ isActive }) => cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors',
              isActive
                ? 'bg-primary text-primary-fg font-semibold shadow-soft'
                : 'font-medium text-nav-fg/90 hover:bg-white/15 hover:text-nav-fg',
            )}>
            <n.icon width={18} height={18} />
            <span className="leading-tight">{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <NavLink to="/settings" onClick={onNavigate}
          className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors',
            isActive ? 'bg-primary/25 text-nav-fg font-semibold ring-1 ring-nav-fg/20' : 'text-nav-fg/90 hover:bg-white/15 hover:text-nav-fg')}>
          <Icon.gear width={18} height={18} /> ตั้งค่า
        </NavLink>
      </div>
    </div>
  )
}

export function Shell({ children, title }: { children: ReactNode; title?: string }) {
  const [drawer, setDrawer] = useState(false)
  const unread = notifications.filter((n) => n.unread).length
  return (
    <div className="min-h-screen bg-paper">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-card/85 px-4 backdrop-blur">
        <button className="grid size-11 place-items-center rounded-xl text-ink hover:bg-ink/5 lg:hidden" onClick={() => setDrawer(true)} aria-label="เปิดเมนู">
          <Icon.menu />
        </button>
        <div className="hidden lg:flex w-[228px] items-center"><span className="font-heading text-[15px] font-semibold">{title}</span></div>
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle"><Icon.search width={18} height={18} /></span>
          <input placeholder="ค้นหา project, ไฟล์ หรือเนื้อหา…"
            className="h-10 w-full rounded-xl border border-line bg-paper pl-10 pr-3 text-sm outline-none focus:border-primary" />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Menu align="right" trigger={
            <button className="relative grid size-11 place-items-center rounded-xl text-ink hover:bg-ink/5" aria-label="การแจ้งเตือน">
              <Icon.bell />
              {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-danger ring-2 ring-card" />}
            </button>
          }>
            <div className="px-2.5 py-2 text-[13px] font-semibold text-ink">การแจ้งเตือน</div>
            {notifications.map((n) => (
              <div key={n.id} className={cn('flex gap-2.5 rounded-lg px-2.5 py-2 hover:bg-ink/5', n.unread && 'bg-primary-soft/40')}>
                <Avatar initial={n.who[0]} ck={n.key} size={30} />
                <div className="min-w-0">
                  <p className="text-[13px] text-ink leading-snug"><b className="font-semibold">{n.who}</b> {n.text}</p>
                  <p className="text-[11px] text-subtle">{n.time}ที่แล้ว</p>
                </div>
              </div>
            ))}
          </Menu>
          <Menu align="right" trigger={
            <button className="grid size-11 place-items-center rounded-full" aria-label="โปรไฟล์"><Avatar initial="M" ck="E" size={36} /></button>
          }>
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <Avatar initial="M" ck="E" size={36} />
              <div><p className="text-[13px] font-semibold">Me</p><p className="text-[11px] text-subtle">me@taskboard.app</p></div>
            </div>
            <div className="my-1 h-px bg-line" />
            <MenuItem icon={<Icon.gear width={16} height={16} />}>โปรไฟล์ &amp; บัญชี</MenuItem>
            <ThemeSwitcher inline />
            <div className="my-1 h-px bg-line" />
            <MenuItem icon={<Icon.logout width={16} height={16} />} danger>ออกจากระบบ</MenuItem>
          </Menu>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[228px] shrink-0 bg-nav lg:block">
          <SidebarContent />
        </aside>

        {/* Mobile drawer */}
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
            <aside className="absolute left-0 top-0 h-full w-[260px] bg-nav animate-pop">
              <div className="flex h-16 items-center px-4"><Logo /></div>
              <SidebarContent onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
