// AppShell — persistent left sidebar layout (desktop fixed rail, mobile drawer)
// + top bar (search / notifications / profile menu). Wraps page content via the
// `children` slot. Owns global Cmd/Ctrl+K search and theme persistence so pages
// that adopt the shell don't have to re-implement the chrome.
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Menu, MenuItem } from './ui'
import { Icon } from '../lib/icons'
import { ThemeSwitcher } from './ThemeSwitcher'
import { SearchOverlay } from './SearchOverlay'
import { NotificationBell } from './NotificationBell'
import { useAuth } from '../lib/auth'
import { useUpdateSetting } from '../lib/account'
import { cn } from '../lib/cn'
import type { Mode, ThemeId } from '../lib/cn'

const SIDEBAR_W = 'w-[220px]'

interface NavEntry {
  key: string
  to: string
  icon: (typeof Icon)[keyof typeof Icon]
  active: boolean
}

/** Shared sidebar body — rendered in both the desktop rail and the mobile drawer. */
function SidebarBody({ items, onNavigate }: { items: NavEntry[]; onNavigate?: () => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <Link
        to="/home"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-4 py-4 focus-visible:outline-none"
      >
        <span className="grid size-8 place-items-center rounded-[10px] bg-primary font-heading font-bold text-primary-fg">T</span>
        <span className="font-heading text-[15px] font-semibold text-nav-fg">Task Board</span>
      </Link>

      {/* Primary navigation */}
      <nav className="flex-1 space-y-0.5 px-2.5 py-2">
        {items.map(({ key, to, icon: ItemIcon, active }) => (
          <Link
            key={key}
            to={to}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
              active
                ? 'bg-primary text-primary-fg shadow-soft'
                : 'text-nav-fg/70 hover:bg-white/10 hover:text-nav-fg',
            )}
          >
            <ItemIcon width={18} height={18} />
            {t(`nav.${key}`)}
          </Link>
        ))}
      </nav>

      {/* Identity footer */}
      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar initial={user?.username?.charAt(0).toUpperCase() ?? '?'} size={34} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-semibold text-nav-fg">
              {user?.username ?? t('shell.userFallback')}
            </p>
            <p className="truncate text-[11px] text-nav-fg/60">{user?.email}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const updateSetting = useUpdateSetting()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Derive active nav state from the current path + `?filter=mine` query param.
  const filterMine = new URLSearchParams(location.search).get('filter') === 'mine'
  const onHome = location.pathname === '/home'
  const items: NavEntry[] = [
    { key: 'allProjects', to: '/home', icon: Icon.folder, active: onHome && !filterMine },
    { key: 'myProjects', to: '/home?filter=mine', icon: Icon.star, active: onHome && filterMine },
    { key: 'activity', to: '/activity', icon: Icon.clock, active: location.pathname.startsWith('/activity') },
    { key: 'trash', to: '/trash', icon: Icon.trash, active: location.pathname.startsWith('/trash') },
    { key: 'settings', to: '/settings', icon: Icon.gear, active: location.pathname.startsWith('/settings') },
  ]

  // Global Cmd/Ctrl+K opens the search overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setSidebarOpen(false) }, [location.pathname, location.search])

  // Persist the color + mode chosen from the profile switcher to the server.
  function persistTheme(theme: ThemeId, mode: Mode) {
    updateSetting.mutate({ themeColor: theme, themeMode: mode })
  }

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Desktop rail — fixed, always visible ≥768px. */}
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 bg-nav md:block', SIDEBAR_W)}>
        <SidebarBody items={items} />
      </aside>

      {/* Mobile drawer + overlay. Drawer stays mounted for slide animation. */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px] transition-opacity md:hidden',
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 h-screen bg-nav shadow-pop transition-transform duration-200 md:hidden',
          SIDEBAR_W,
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
      >
        <SidebarBody items={items} onNavigate={() => setSidebarOpen(false)} />
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-paper/90 px-4 backdrop-blur sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="grid size-10 place-items-center rounded-xl text-muted hover:bg-ink/5 md:hidden"
            aria-label={t('shell.openMenu')}
          >
            <Icon.menu width={20} height={20} />
          </button>

          {/* Spacer keeps the action cluster right-aligned on desktop. */}
          <div className="hidden md:block" />

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSearchOpen(true)}
              className="grid size-10 place-items-center rounded-xl text-muted hover:bg-ink/5"
              title={t('common.search')}
              aria-label={t('common.search')}
            >
              <Icon.search width={18} height={18} />
            </button>
            <NotificationBell />
            <Menu align="right" trigger={
              <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-ink/5" aria-label={t('home.userMenu')}>
                <Avatar initial={user?.username?.charAt(0).toUpperCase() ?? '?'} size={28} />
                <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">{user?.username}</span>
                <Icon.chevronD width={14} height={14} className="hidden text-muted sm:block" />
              </button>
            }>
              <div className="w-[17rem] max-w-[calc(100vw-2rem)]">
                <div className="flex items-center gap-3 px-2 py-1.5">
                  <Avatar initial={user?.username?.charAt(0).toUpperCase() ?? '?'} size={40} />
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-sm font-semibold text-ink">{user?.username}</p>
                    <p className="truncate text-[12px] text-muted">{user?.email}</p>
                  </div>
                </div>

                <div className="my-1.5 h-px bg-line" />

                {/* Stop click bubbling so changing theme/mode keeps the menu open. */}
                <div className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                  <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    {t('settings.sectionAppearance')}
                  </p>
                  <ThemeSwitcher onChange={persistTheme} />
                </div>

                <div className="my-1.5 h-px bg-line" />

                <MenuItem icon={<Icon.logout width={16} height={16} />} danger onClick={handleLogout}>
                  {t('common.logout')}
                </MenuItem>
              </div>
            </Menu>
          </div>
        </header>

        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
