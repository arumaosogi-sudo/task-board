import { describe, it, expect } from 'vitest'
import { htmlToLines, diffHtml } from './htmlDiff'

// Smoke test #1 (web): pure diff logic that runs on top of jsdom's DOMParser.
// Proves the Vitest + jsdom toolchain works (htmlToLines parses real HTML).
describe('htmlToLines', () => {
  it('flattens block elements to display lines with markdown-ish prefixes', () => {
    const html = '<h1>Title</h1><p>Body text</p><ul><li>Item</li></ul>'
    expect(htmlToLines(html)).toEqual(['# Title', 'Body text', '• Item'])
  })

  it('numbers ordered-list items and collapses whitespace', () => {
    const html = '<ol><li>First   step</li></ol>'
    expect(htmlToLines(html)).toEqual(['1. First step'])
  })

  it('replaces image blocks with a placeholder and drops empty blocks', () => {
    const html = '<p><img src="x.png" /></p><p>   </p><p>Real</p>'
    expect(htmlToLines(html)).toEqual(['[รูปภาพ]', 'Real'])
  })

  it('returns an empty array for empty input', () => {
    expect(htmlToLines('')).toEqual([])
  })
})

describe('diffHtml', () => {
  it('reports no hunks when documents are identical', () => {
    const html = '<p>same</p>'
    const res = diffHtml(html, html)
    expect(res).toEqual({ hunks: [], added: 0, removed: 0 })
  })

  it('counts added and removed lines', () => {
    const res = diffHtml('<p>keep</p><p>old</p>', '<p>keep</p><p>new</p>')
    expect(res.added).toBe(1)
    expect(res.removed).toBe(1)
    const types = res.hunks.flatMap((h) => h.lines.map((l) => l.type))
    expect(types).toContain('add')
    expect(types).toContain('del')
    expect(types).toContain('ctx')
  })

  it('emits a unified-diff hunk header', () => {
    const res = diffHtml('<p>a</p>', '<p>a</p><p>b</p>')
    expect(res.added).toBe(1)
    expect(res.hunks[0].header).toMatch(/^@@ -\d+ \+\d+ @@$/)
  })
})
