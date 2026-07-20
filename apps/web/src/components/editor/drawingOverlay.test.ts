import { describe, it, expect } from 'vitest'
import { strokesToSvg, eraserRadius, clampPointToPage } from './drawingModel'

// Pure serialization/util helpers of the inline drawing layer (ADR 0005). The stateful
// pointer/Yjs behaviour is exercised in the browser (2-tab) per DoD; these lock down the
// PDF-export markup and eraser sizing that must stay deterministic.

const stroke = (points: number[], over: Partial<{ tool: 'pen' | 'highlighter'; color: string; width: number; opacity: number }> = {}) => ({
  id: 'x', tool: 'pen' as const, color: '#1d2333', width: 2, opacity: 1, points, ...over,
})

describe('eraserRadius', () => {
  it('scales with brush size and stays comfortably larger than the pen', () => {
    expect(eraserRadius(1)).toBe(8)
    expect(eraserRadius(8)).toBe(22)
    expect(eraserRadius(1)).toBeGreaterThan(1)
  })
})

describe('clampPointToPage', () => {
  const W = 794
  const H = 1123

  it('leaves an in-bounds point untouched', () => {
    expect(clampPointToPage(100, 200, W, H)).toEqual({ x: 100, y: 200 })
  })

  it('pins a point dragged above/left of the page (over toolbar/sidebar) to the top-left edge', () => {
    // e.g. stroke dragged up over the sticky toolbar → negative offsets
    expect(clampPointToPage(-40, -12, W, H)).toEqual({ x: 0, y: 0 })
  })

  it('pins a point dragged past the right/bottom edge to that edge', () => {
    expect(clampPointToPage(900, 1300, W, H)).toEqual({ x: W, y: H })
  })

  it('clamps each axis independently', () => {
    expect(clampPointToPage(-5, 500, W, H)).toEqual({ x: 0, y: 500 })
    expect(clampPointToPage(400, 5000, W, H)).toEqual({ x: 400, y: H })
  })

  it('keeps points exactly on the boundary', () => {
    expect(clampPointToPage(0, 0, W, H)).toEqual({ x: 0, y: 0 })
    expect(clampPointToPage(W, H, W, H)).toEqual({ x: W, y: H })
  })
})

describe('strokesToSvg', () => {
  it('returns empty string when there are no strokes', () => {
    expect(strokesToSvg([], 794)).toBe('')
  })

  it('emits a viewBox at the page width and a path per stroke', () => {
    const svg = strokesToSvg([stroke([0, 0, 10, 20]), stroke([5, 5, 15, 15], { tool: 'highlighter', opacity: 0.4 })], 794)
    expect(svg).toContain('viewBox="0 0 794 ')
    expect(svg.match(/<path /g)?.length).toBe(2)
    expect(svg).toContain('stroke-linecap="round"') // pen
    expect(svg).toContain('stroke-linecap="butt"') // highlighter
    expect(svg).toContain('pointer-events:none')
  })

  it('sizes the height to the lowest point (+margin)', () => {
    const svg = strokesToSvg([stroke([0, 0, 10, 100])], 794)
    // maxY = 100 → height = ceil(100 + 20) = 120
    expect(svg).toContain('height="120"')
  })
})
