import { describe, it, expect } from 'vitest'
import {
  isImageLayout,
  isWrapLayout,
  snapWidth,
  fractionLabel,
  IMAGE_LAYOUTS,
  SNAP_TOLERANCE_PX,
  MIN_IMAGE_WIDTH_PX,
} from './imageLayout'

describe('imageLayout — layout type guards', () => {
  it('accepts every known layout and rejects junk', () => {
    IMAGE_LAYOUTS.forEach((l) => expect(isImageLayout(l)).toBe(true))
    expect(isImageLayout('center')).toBe(false)
    expect(isImageLayout('')).toBe(false)
    expect(isImageLayout(null)).toBe(false)
    expect(isImageLayout(undefined)).toBe(false)
    expect(isImageLayout(42)).toBe(false)
  })

  it('isWrapLayout is true only for the two float modes', () => {
    expect(isWrapLayout('wrap-left')).toBe(true)
    expect(isWrapLayout('wrap-right')).toBe(true)
    expect(isWrapLayout('block-center')).toBe(false)
    expect(isWrapLayout('inline')).toBe(false)
  })
})

describe('imageLayout — snapWidth', () => {
  const CONTENT = 600 // 25%=150, 33.3%=200, 50%=300, 66.6%=400, 75%=450, 100%=600

  it('snaps to the nearest fraction target when within tolerance', () => {
    // 305 is 5px from the 50% target (300) → snaps.
    expect(snapWidth(305, CONTENT)).toEqual({ width: 300, fraction: 0.5 })
    // 148 is 2px from the 25% target (150) → snaps.
    expect(snapWidth(148, CONTENT)).toEqual({ width: 150, fraction: 0.25 })
    // 596 → 100% (600).
    expect(snapWidth(596, CONTENT)).toEqual({ width: 600, fraction: 1 })
  })

  it('snaps 1/3 and 2/3 targets (rounded)', () => {
    expect(snapWidth(201, CONTENT)).toEqual({ width: 200, fraction: 1 / 3 })
    expect(snapWidth(399, CONTENT)).toEqual({ width: 400, fraction: 2 / 3 })
  })

  it('leaves the raw width untouched when outside every tolerance band', () => {
    // 260 is >8px from 300 (50%) and from 200 (33%) → no snap.
    expect(snapWidth(260, CONTENT)).toEqual({ width: 260, fraction: null })
  })

  it('picks the closest target when two are near', () => {
    // Exactly on 300 → snaps to 50%, not 33/66.
    expect(snapWidth(300, CONTENT)).toEqual({ width: 300, fraction: 0.5 })
  })

  it('respects the tolerance boundary exactly', () => {
    // 300 - 8 = 292 is on the edge → still snaps.
    expect(snapWidth(300 - SNAP_TOLERANCE_PX, CONTENT).fraction).toBe(0.5)
    // 291 is 9px away → no snap.
    expect(snapWidth(291, CONTENT).fraction).toBeNull()
  })

  it('floors to the minimum image width', () => {
    expect(snapWidth(10, CONTENT).width).toBe(MIN_IMAGE_WIDTH_PX)
  })

  it('degrades gracefully when content width is unknown', () => {
    expect(snapWidth(250, 0)).toEqual({ width: 250, fraction: null })
    expect(snapWidth(250, Number.NaN)).toEqual({ width: 250, fraction: null })
  })
})

describe('imageLayout — fractionLabel', () => {
  it('formats fractions as rounded percents', () => {
    expect(fractionLabel(0.25)).toBe('25%')
    expect(fractionLabel(1 / 3)).toBe('33%')
    expect(fractionLabel(2 / 3)).toBe('67%')
    expect(fractionLabel(1)).toBe('100%')
  })
})
