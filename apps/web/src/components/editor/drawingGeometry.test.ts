import { describe, it, expect } from 'vitest'
import { eraseStroke, pointToSegmentDist2, strokeIntersectsDisc, pointsToPath, pathToPoints, type Point } from './drawingGeometry'

// A straight horizontal line y=0 from x=0..10, sampled every 1 unit.
const line: Point[] = Array.from({ length: 11 }, (_, x) => ({ x, y: 0 }))

describe('pointToSegmentDist2', () => {
  it('measures perpendicular distance to the segment body', () => {
    expect(pointToSegmentDist2(5, 3, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(9) // 3²
  })
  it('clamps to the nearest endpoint past the segment ends', () => {
    expect(pointToSegmentDist2(-4, 0, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(16) // 4²
  })
  it('handles a degenerate zero-length segment', () => {
    expect(pointToSegmentDist2(3, 4, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(25) // 3²+4²
  })
})

describe('eraseStroke — segment-level circular eraser', () => {
  it('splits a stroke into two pieces when the disc cuts the middle', () => {
    const pieces = eraseStroke(line, 5, 0, 1.5)
    expect(pieces.length).toBe(2)
    // Left piece keeps x=0..3, right piece keeps x=7..10 (x=4,5,6 fall under r=1.5).
    expect(pieces[0].every((p) => p.x < 5)).toBe(true)
    expect(pieces[1].every((p) => p.x > 5)).toBe(true)
  })

  it('trims from an endpoint without splitting', () => {
    const pieces = eraseStroke(line, 0, 0, 2.5)
    expect(pieces.length).toBe(1)
    expect(Math.min(...pieces[0].map((p) => p.x))).toBeGreaterThan(2)
  })

  it('erases the whole stroke when the disc covers it', () => {
    expect(eraseStroke(line, 5, 0, 20)).toEqual([])
  })

  it('leaves a stroke untouched when the disc misses it', () => {
    const pieces = eraseStroke(line, 5, 50, 1.5)
    expect(pieces).toEqual([line])
  })

  it('cuts a segment that passes through the disc even with both endpoints outside', () => {
    // Two points 10 apart, both far from centre, but the segment runs through origin.
    const sparse: Point[] = [{ x: -10, y: 0 }, { x: 10, y: 0 }]
    expect(eraseStroke(sparse, 0, 0, 1)).toEqual([]) // segment cut → no ≥2-pt survivor
  })

  it('discards single-point survivors (not a visible stroke)', () => {
    // Erasing around x=1 leaves only x=0 on the left — a lone point, dropped.
    const short: Point[] = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }]
    const pieces = eraseStroke(short, 2, 0, 2.5) // covers x=0,2,4 within r? dist(2±2)=2<2.5
    expect(pieces).toEqual([])
  })
})

describe('strokeIntersectsDisc', () => {
  it('detects a hover hit on the line body', () => {
    expect(strokeIntersectsDisc(line, 5, 0.5, 1)).toBe(true)
  })
  it('returns false when clearly outside', () => {
    expect(strokeIntersectsDisc(line, 5, 10, 1)).toBe(false)
  })
})

describe('pointsToPath / pathToPoints round-trip', () => {
  it('serializes and parses back to the same points', () => {
    const pts: Point[] = [{ x: 1.2, y: 3.4 }, { x: 5.6, y: 7.8 }]
    expect(pointsToPath(pts)).toBe('M 1.2 3.4 L 5.6 7.8')
    expect(pathToPoints('M 1.2 3.4 L 5.6 7.8')).toEqual(pts)
  })
  it('empty points → empty path', () => {
    expect(pointsToPath([])).toBe('')
  })
})
