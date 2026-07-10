import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import { AppShell } from './AppShell'

// AppShell owns global chrome (auth, search, notifications, theme persistence). We
// stub the IO-bearing collaborators so the test can focus on the navigation rail:
// which items render and which one is marked active for a given route.
vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: { username: 'Nina', email: 'nina@example.com' }, logout: vi.fn() }),
}))
vi.mock('../lib/account', () => ({
  useUpdateSetting: () => ({ mutate: vi.fn() }),
}))
vi.mock('./NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('./SearchOverlay', () => ({ SearchOverlay: () => null }))
vi.mock('./ThemeSwitcher', () => ({ ThemeSwitcher: () => null }))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell>
        <div>page content</div>
      </AppShell>
    </MemoryRouter>,
  )
}

// The rail is rendered twice (desktop rail + mobile drawer share SidebarBody), so
// each nav item appears as two links — assertions use getAllByRole accordingly.
const NAV_KEYS = ['allProjects', 'myProjects', 'activity', 'trash', 'settings'] as const

describe('<AppShell /> navigation', () => {
  it('renders all five primary nav items', () => {
    renderAt('/activity')
    for (const key of NAV_KEYS) {
      expect(screen.getAllByRole('link', { name: i18n.t(`nav.${key}`) }).length).toBeGreaterThan(0)
    }
  })

  it('marks the Activity item as the current page on /activity', () => {
    renderAt('/activity')
    const links = screen.getAllByRole('link', { name: i18n.t('nav.activity') })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('does not mark unrelated nav items active on /activity', () => {
    renderAt('/activity')
    for (const link of screen.getAllByRole('link', { name: i18n.t('nav.trash') })) {
      expect(link).not.toHaveAttribute('aria-current')
    }
    for (const link of screen.getAllByRole('link', { name: i18n.t('nav.allProjects') })) {
      expect(link).not.toHaveAttribute('aria-current')
    }
  })

  it('renders the page content passed via children', () => {
    renderAt('/activity')
    expect(screen.getByText('page content')).toBeInTheDocument()
  })
})
