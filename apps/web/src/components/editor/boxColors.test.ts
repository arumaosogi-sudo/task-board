import { describe, it, expect } from 'vitest'
import {
  BOX_COLORS, normalizeHex, validBoxBg, validBoxBorder, boxColorIdFromBg,
} from './boxColors'

// Sprint 4 — Box color preset validation. These are the pure guards that keep box tints
// inside the design palette regardless of what HTML reaches parseHTML (File.content /
// pasted / hand-crafted), and that map DOM-serialized rgb() back to the stored hex.

describe('normalizeHex', () => {
  it('passes through a 6-digit hex, lowercased', () => {
    expect(normalizeHex('#EFEAFE')).toBe('#efeafe')
  })
  it('expands 3-digit shorthand hex', () => {
    expect(normalizeHex('#fff')).toBe('#ffffff')
  })
  it('converts rgb()/rgba() (the form the DOM returns for inline styles) to hex', () => {
    expect(normalizeHex('rgb(124, 92, 255)')).toBe('#7c5cff')
    expect(normalizeHex('rgba(124, 92, 255, 0.5)')).toBe('#7c5cff')
  })
  it('returns null for empty / non-color input', () => {
    expect(normalizeHex('')).toBeNull()
    expect(normalizeHex(null)).toBeNull()
    expect(normalizeHex(undefined)).toBeNull()
    expect(normalizeHex('inherit')).toBeNull()
  })
})

describe('validBoxBg / validBoxBorder', () => {
  it('accepts every preset background and border (both hex and rgb forms)', () => {
    for (const c of BOX_COLORS) {
      if (c.bg) {
        expect(validBoxBg(c.bg)).toBe(c.bg)
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.bg!.slice(i, i + 2), 16))
        expect(validBoxBg(`rgb(${r}, ${g}, ${b})`)).toBe(c.bg)
      }
      if (c.border) expect(validBoxBorder(c.border)).toBe(c.border)
    }
  })
  it('rejects arbitrary/off-palette colors → null (falls back to themed default)', () => {
    expect(validBoxBg('#123456')).toBeNull()
    expect(validBoxBg('rgb(0, 0, 0)')).toBeNull()
    expect(validBoxBg('red')).toBeNull()
    expect(validBoxBorder('#000000')).toBeNull()
  })
  it('treats null background as the default (no tint)', () => {
    expect(validBoxBg(null)).toBeNull()
  })
})

describe('boxColorIdFromBg', () => {
  it('resolves a stored background to its preset id', () => {
    expect(boxColorIdFromBg('#efeafe')).toBe('violet')
    expect(boxColorIdFromBg('rgb(239, 234, 254)')).toBe('violet')
  })
  it('resolves null / unknown background to the default preset', () => {
    expect(boxColorIdFromBg(null)).toBe('default')
    expect(boxColorIdFromBg('#123456')).toBe('default')
  })
})
