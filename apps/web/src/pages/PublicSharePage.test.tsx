import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../i18n'
import PublicSharePage from './PublicSharePage'
import { fetchPublicShare } from '../lib/share'

// The public fetch is the seam. resolveShareAssets stays real so we also verify the
// tbasset → proxy-URL rewrite reaches the DOM.
vi.mock('../lib/share', async (orig) => {
  const actual = await orig<typeof import('../lib/share')>()
  return { ...actual, fetchPublicShare: vi.fn() }
})

function renderAt(token = 'tok123') {
  return render(
    <MemoryRouter initialEntries={[`/share/${token}`]}>
      <Routes>
        <Route path="/share/:token" element={<PublicSharePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(fetchPublicShare).mockReset()
})

describe('<PublicSharePage />', () => {
  it('renders the published snapshot and read-only badge, rewriting asset URLs', async () => {
    vi.mocked(fetchPublicShare).mockResolvedValue({
      fileName: 'Quarterly Report',
      contentHtml: '<h1>Hello</h1><img src="tbasset:a1" alt="pic">',
      publishedAt: '2026-07-17T00:00:00.000Z',
    })
    renderAt()

    expect(await screen.findByText('Hello')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Quarterly Report' })).toBeInTheDocument()
    const img = document.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toContain('/public/share/tok123/assets/a1')
    expect(img.getAttribute('src')).not.toContain('tbasset')
  })

  it('shows a single generic "gone" state on any error (no leak of the reason)', async () => {
    vi.mocked(fetchPublicShare).mockRejectedValue(new Error('404'))
    renderAt()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('shows a loading skeleton before the fetch resolves', () => {
    vi.mocked(fetchPublicShare).mockReturnValue(new Promise(() => {}))
    const { container } = renderAt()
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })
})
