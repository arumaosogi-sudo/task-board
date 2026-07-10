import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import '../i18n' // initialise i18next so useTranslation resolves the real (Thai) catalog
import Activity from './Activity'
import { useMyUpdates, useProjectChanges } from '../lib/updates'
import { useProjects } from '../lib/projects'

// Isolate the page-under-test: AppShell drags in auth/search/notification IO that
// is irrelevant to Activity's scope logic, and RevisionDiffDrawer is a leaf we
// don't exercise here. Both are stubbed so we test *only* Activity's behaviour.
vi.mock('../components/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('../components/RevisionDiffDrawer', () => ({
  RevisionDiffDrawer: () => null,
}))
// The two feed hooks are the seam we assert on: per ADR 0002 both are mounted but
// only the active scope's request fires (via `enabled`). Mocking them lets us both
// inspect the `enabled` flag and feed deterministic rows.
vi.mock('../lib/updates', () => ({
  useMyUpdates: vi.fn(),
  useProjectChanges: vi.fn(),
}))
vi.mock('../lib/projects', () => ({
  useProjects: vi.fn(),
}))

/** Minimal React-Query result shape the component reads (data/isLoading/isError). */
const q = (over: Record<string, unknown> = {}) =>
  ({ data: undefined, isLoading: false, isError: false, ...over })

const mineItem = {
  id: 'm1', projectId: 'p1', projectName: 'Proj One', fileId: 'f1', fileName: 'doc.md',
  scope: 'owner' as const, label: 'my label', createdAt: '2026-07-01T10:00:00.000Z',
}
const allItem = {
  id: 'a1', projectId: 'p1', projectName: 'Proj One', fileId: 'f1', fileName: 'doc.md',
  authorId: 'u2', authorName: 'Alice', label: 'their label', createdAt: '2026-07-01T10:00:00.000Z',
}

beforeEach(() => {
  vi.mocked(useProjects).mockReturnValue(q({ data: [] }) as never)
  vi.mocked(useMyUpdates).mockReturnValue(q() as never)
  vi.mocked(useProjectChanges).mockReturnValue(q() as never)
})

describe('<Activity /> scope gating', () => {
  it('mounts both feed hooks but enables only the active scope (all by default)', () => {
    render(<Activity />)
    // useProjectChanges(range, projectId, authorId, enabled) -> enabled at index 3
    expect(vi.mocked(useProjectChanges).mock.calls.at(-1)?.[3]).toBe(true)
    // useMyUpdates(range, projectId, enabled) -> enabled at index 2
    expect(vi.mocked(useMyUpdates).mock.calls.at(-1)?.[2]).toBe(false)
  })

  it('toggling to "mine" enables myUpdates and disables projectChanges', () => {
    render(<Activity />)
    fireEvent.click(screen.getByRole('button', { name: 'เฉพาะของฉัน' }))
    expect(vi.mocked(useMyUpdates).mock.calls.at(-1)?.[2]).toBe(true)
    expect(vi.mocked(useProjectChanges).mock.calls.at(-1)?.[3]).toBe(false)
  })
})

describe('<Activity /> row rendering', () => {
  it('renders an author avatar + "by" line in the all scope, without a role tag', () => {
    vi.mocked(useProjectChanges).mockReturnValue(q({ data: [allItem] }) as never)
    render(<Activity />)
    expect(screen.getByText('Proj One')).toBeInTheDocument()
    expect(screen.getByText('doc.md')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument() // author in the "โดย:" line
    expect(screen.getByText('A')).toBeInTheDocument() // avatar initial
    // owner/member tags belong to the "mine" scope only
    expect(screen.queryByText('เจ้าของ')).not.toBeInTheDocument()
  })

  it('renders a role tag and no author avatar in the mine scope', () => {
    vi.mocked(useMyUpdates).mockReturnValue(q({ data: [mineItem] }) as never)
    render(<Activity />)
    fireEvent.click(screen.getByRole('button', { name: 'เฉพาะของฉัน' }))
    expect(screen.getByText('เจ้าของ')).toBeInTheDocument() // scopeOwner tag
    expect(screen.getByText('doc.md')).toBeInTheDocument()
    // no author avatar: the single-letter initial should not be present
    expect(screen.queryByText('A')).not.toBeInTheDocument()
  })
})

describe('<Activity /> non-data states', () => {
  it('shows the all-scope empty state when there are no changes', () => {
    render(<Activity />)
    expect(screen.getByText('ยังไม่มีความเคลื่อนไหว')).toBeInTheDocument()
  })

  it('shows the mine-scope empty state after toggling with no updates', () => {
    render(<Activity />)
    fireEvent.click(screen.getByRole('button', { name: 'เฉพาะของฉัน' }))
    expect(screen.getByText('คุณยังไม่มีการแก้ไข')).toBeInTheDocument()
  })

  it('shows an error banner when the active feed fails', () => {
    vi.mocked(useProjectChanges).mockReturnValue(q({ isError: true }) as never)
    render(<Activity />)
    expect(screen.getByText(/โหลดข้อมูลไม่สำเร็จ/)).toBeInTheDocument()
  })

  it('shows skeleton placeholders while the active feed is loading', () => {
    vi.mocked(useProjectChanges).mockReturnValue(q({ isLoading: true }) as never)
    const { container } = render(<Activity />)
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
  })
})
