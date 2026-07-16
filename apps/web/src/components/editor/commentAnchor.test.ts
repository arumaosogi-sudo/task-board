import { describe, it, expect } from 'vitest'
import { filterComments, countComments, isValidRange, type CommentFilter } from './commentAnchor'

// Root threads only carry what the pure helpers read.
const threads = [
  { id: 'a', resolved: false },
  { id: 'b', resolved: true },
  { id: 'c', resolved: false },
  { id: 'd', resolved: true },
]

describe('filterComments', () => {
  it('returns every thread for "all"', () => {
    expect(filterComments(threads, 'all')).toHaveLength(4)
  })
  it('keeps only unresolved for "open"', () => {
    expect(filterComments(threads, 'open').map((c) => c.id)).toEqual(['a', 'c'])
  })
  it('keeps only resolved for "resolved"', () => {
    expect(filterComments(threads, 'resolved').map((c) => c.id)).toEqual(['b', 'd'])
  })
  it('does not mutate the input array', () => {
    const copy = [...threads]
    filterComments(threads, 'open')
    expect(threads).toEqual(copy)
  })
  it('handles an empty list for any filter', () => {
    for (const f of ['all', 'open', 'resolved'] as CommentFilter[]) {
      expect(filterComments([], f)).toEqual([])
    }
  })
})

describe('countComments', () => {
  it('splits totals by resolution status', () => {
    expect(countComments(threads)).toEqual({ all: 4, open: 2, resolved: 2 })
  })
  it('zeroes out an empty list', () => {
    expect(countComments([])).toEqual({ all: 0, open: 0, resolved: 0 })
  })
  it('counts an all-open list', () => {
    expect(countComments([{ resolved: false }, { resolved: false }])).toEqual({
      all: 2,
      open: 2,
      resolved: 0,
    })
  })
})

describe('isValidRange — orphan detection for a resolved anchor', () => {
  const docSize = 100
  it('accepts a normal non-empty range inside the doc', () => {
    expect(isValidRange(10, 20, docSize)).toBe(true)
  })
  it('rejects a collapsed range (highlighted text deleted)', () => {
    expect(isValidRange(20, 20, docSize)).toBe(false)
  })
  it('rejects an inverted range', () => {
    expect(isValidRange(30, 20, docSize)).toBe(false)
  })
  it('rejects a range past the end of the document', () => {
    expect(isValidRange(90, 120, docSize)).toBe(false)
  })
  it('rejects a negative start', () => {
    expect(isValidRange(-1, 5, docSize)).toBe(false)
  })
  it('rejects non-finite positions (unresolvable anchor)', () => {
    expect(isValidRange(NaN, 10, docSize)).toBe(false)
    expect(isValidRange(5, Infinity, docSize)).toBe(false)
  })
  it('accepts a range that spans the whole document', () => {
    expect(isValidRange(0, docSize, docSize)).toBe(true)
  })
})
