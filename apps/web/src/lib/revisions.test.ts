import { describe, it, expect } from 'vitest'
import { normalizeCommitLabel, REVISION_LABEL_MAX } from './revisions'

// Sprint 4 — manual "Commit" label normalization (mirrors CreateRevisionDto @MaxLength(120)).
describe('normalizeCommitLabel', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeCommitLabel('  fixed the summary  ')).toBe('fixed the summary')
  })
  it('collapses empty / whitespace-only input to undefined (labelless snapshot)', () => {
    expect(normalizeCommitLabel('')).toBeUndefined()
    expect(normalizeCommitLabel('   ')).toBeUndefined()
    expect(normalizeCommitLabel(null)).toBeUndefined()
    expect(normalizeCommitLabel(undefined)).toBeUndefined()
  })
  it('caps at the server limit', () => {
    const long = 'x'.repeat(200)
    expect(normalizeCommitLabel(long)).toHaveLength(REVISION_LABEL_MAX)
  })
  it('keeps a label already within the limit unchanged', () => {
    expect(normalizeCommitLabel('v1.0')).toBe('v1.0')
  })
})
