import { describe, it, expect } from 'vitest'
import { sanitizeFileName } from './download'
import { htmlToMarkdown } from './markdown'
import { normalizeDocxHtml } from './docxHtml'

describe('sanitizeFileName', () => {
  it('keeps spaces, hyphens and unicode (Thai)', () => {
    expect(sanitizeFileName('รายงาน ความคืบหน้า-2026')).toBe('รายงาน ความคืบหน้า-2026')
  })
  it('strips filesystem-illegal characters', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
  })
  it('collapses whitespace and trims trailing dots', () => {
    expect(sanitizeFileName('  my   report...  ')).toBe('my report')
  })
  it('falls back to "document" when empty after cleaning', () => {
    expect(sanitizeFileName('***')).toBe('document')
    expect(sanitizeFileName('   ')).toBe('document')
  })
})

describe('htmlToMarkdown', () => {
  it('converts headings and paragraphs', () => {
    const md = htmlToMarkdown('<h1>Title</h1><h2>Sub</h2><p>Body text</p>')
    expect(md).toContain('# Title')
    expect(md).toContain('## Sub')
    expect(md).toContain('Body text')
  })

  it('converts a task list to GFM checkbox syntax', () => {
    const html =
      '<ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Done item</p></div></li>' +
      '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Todo item</p></div></li>' +
      '</ul>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('- [x] Done item')
    expect(md).toContain('- [ ] Todo item')
  })

  it('converts a Box callout to a blockquote', () => {
    const md = htmlToMarkdown('<div class="tb-box"><p>Note inside box</p></div>')
    expect(md).toContain('> Note inside box')
  })

  it('converts a table via the GFM plugin', () => {
    const html =
      '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
      '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('| A | B |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| 1 | 2 |')
  })

  it('keeps @mention text', () => {
    const md = htmlToMarkdown('<p>hi <span class="tb-mention" data-mention="alice">@alice</span></p>')
    expect(md).toContain('@alice')
  })

  it('emits Markdown image syntax for embedded images', () => {
    const md = htmlToMarkdown('<p><img src="data:image/png;base64,AAAA" alt="pic"></p>')
    expect(md).toContain('![pic](data:image/png;base64,AAAA)')
  })
})

describe('normalizeDocxHtml', () => {
  it('rewrites .tb-box to a blockquote', () => {
    const out = normalizeDocxHtml('<div class="tb-box"><p>callout</p></div>')
    expect(out).toContain('<blockquote>')
    expect(out).toContain('callout')
    expect(out).not.toContain('tb-box')
  })

  it('flattens a task list to a bullet list with checkbox glyphs', () => {
    const html =
      '<ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Shipped</p></div></li>' +
      '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Pending</p></div></li>' +
      '</ul>'
    const out = normalizeDocxHtml(html)
    expect(out).not.toContain('data-type')
    expect(out).not.toContain('<input')
    expect(out).toContain('☑ Shipped')
    expect(out).toContain('☐ Pending')
  })

  it('preserves @mention text', () => {
    const out = normalizeDocxHtml('<p><span class="tb-mention">@bob</span></p>')
    expect(out).toContain('@bob')
  })

  it('leaves plain content untouched', () => {
    const out = normalizeDocxHtml('<h1>Report</h1><p>Body</p>')
    expect(out).toContain('<h1>Report</h1>')
    expect(out).toContain('<p>Body</p>')
  })
})
