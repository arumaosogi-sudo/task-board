import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '../i18n' // initialise i18next so useTranslation resolves the real (Thai) catalog
import { ProjectActivityDrawer } from './ProjectActivityDrawer'
import { useProjectChanges } from '../lib/updates'

// RevisionDiffDrawer is a leaf we don't exercise here; render its target's title so
// we can assert that clicking a row opens the diff for the right revision.
vi.mock('./RevisionDiffDrawer', () => ({
  RevisionDiffDrawer: ({ target }: { target: { title: string } | null }) =>
    target ? <div data-testid="diff-open">{target.title}</div> : null,
}))
// The feed hook is the seam we assert on (bound projectId + `enabled` gating).
vi.mock('../lib/updates', () => ({
  useProjectChanges: vi.fn(),
}))

/** Minimal React-Query result shape the component reads. */
const q = (over: Record<string, unknown> = {}) =>
  ({ data: undefined, isLoading: false, isError: false, ...over })

const changeItem = {
  id: 'a1', projectId: 'p1', projectName: 'Proj One', fileId: 'f1', fileName: 'doc.md',
  authorId: 'u2', authorName: 'Alice', label: 'their label', createdAt: '2026-07-01T10:00:00.000Z',
}

function renderDrawer(open = true) {
  return render(
    <ProjectActivityDrawer projectId="p1" projectName="Proj One" open={open} onClose={() => {}} />,
  )
}

beforeEach(() => {
  vi.mocked(useProjectChanges).mockReturnValue(q() as never)
})

describe('<ProjectActivityDrawer /> feed binding', () => {
  it('binds the current projectId, no author filter, and enables only when open', () => {
    renderDrawer(true)
    const call = vi.mocked(useProjectChanges).mock.calls.at(-1)
    // useProjectChanges(range, projectId, authorId, enabled)
    expect(call?.[1]).toBe('p1')   // bound to this project
    expect(call?.[2]).toBeNull()   // no author filter (unlike the central page)
    expect(call?.[3]).toBe(true)   // enabled because open
  })

  it('does not fetch while closed', () => {
    renderDrawer(false)
    expect(vi.mocked(useProjectChanges).mock.calls.at(-1)?.[3]).toBe(false)
  })
})

describe('<ProjectActivityDrawer /> rendering', () => {
  it('renders a row with file, author and label, then opens the diff on click', () => {
    vi.mocked(useProjectChanges).mockReturnValue(q({ data: [changeItem] }) as never)
    renderDrawer()
    expect(screen.getByText('doc.md')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('their label')).toBeInTheDocument()
    expect(screen.queryByTestId('diff-open')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /doc\.md/ }))
    expect(screen.getByTestId('diff-open')).toHaveTextContent('Proj One · doc.md')
  })

  it('shows the project-scoped empty state when there is no activity', () => {
    renderDrawer()
    expect(screen.getByText('ยังไม่มีความเคลื่อนไหว')).toBeInTheDocument()
  })

  it('shows an error banner when the feed fails', () => {
    vi.mocked(useProjectChanges).mockReturnValue(q({ isError: true }) as never)
    renderDrawer()
    expect(screen.getByText(/โหลดข้อมูลไม่สำเร็จ/)).toBeInTheDocument()
  })

  it('shows skeleton placeholders while loading', () => {
    vi.mocked(useProjectChanges).mockReturnValue(q({ isLoading: true }) as never)
    const { container } = renderDrawer()
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
  })
})
