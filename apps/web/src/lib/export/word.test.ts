// Word (.docx) export — OOXML-level verification (ADR 0008).
//
// These tests exercise the *pure* generator core (`wordDoc.ts`) end-to-end: build a real
// .docx buffer, unzip it with jszip, and assert on the ACTUAL XML — page geometry, margins,
// heading styles + keepNext, widow control, titlePg, the PAGE-field footer, table border
// color + brand header shading, and the callout border. Runs headless in jsdom (Vitest);
// no browser-only API is touched because `word.ts` (rasterize/inline/download) is separate.
import { describe, it, expect, beforeAll } from 'vitest'
import JSZip from 'jszip'
import {
  buildWordBuffer,
  cssColorToHex,
  intrinsicSize,
  htmlToBlocks,
  BRAND,
  PAGE_W,
  PAGE_H,
  MARGIN,
  CONTENT_WIDTH_TWIPS,
} from './wordDoc'

/** Unzip a produced .docx into a map of entry-path → UTF-8 XML string. */
async function unzip(html: string, name = 'Report'): Promise<Record<string, string>> {
  const buf = await buildWordBuffer(html, name)
  const zip = await JSZip.loadAsync(buf)
  const out: Record<string, string> = {}
  await Promise.all(
    Object.keys(zip.files).map(async (path) => {
      if (path.endsWith('.xml')) out[path] = await zip.files[path].async('string')
    }),
  )
  return out
}

/** Concatenate every header*.xml / footer*.xml part (part numbering is not stable). */
const joinParts = (files: Record<string, string>, kind: 'header' | 'footer') =>
  Object.keys(files)
    .filter((p) => p.startsWith(`word/${kind}`))
    .map((p) => files[p])
    .join('\n')

describe('wordDoc — page geometry & section (SPEC 1, 4)', () => {
  let doc: string
  beforeAll(async () => {
    doc = (await unzip('<h1>A</h1><p>body</p>'))['word/document.xml']
  })

  it('sets A4 page size (w:pgSz 11906 × 16838 twips)', () => {
    expect(PAGE_W).toBe(11906)
    expect(PAGE_H).toBe(16838)
    expect(doc).toMatch(/<w:pgSz[^>]*\bw:w="11906"/)
    expect(doc).toMatch(/<w:pgSz[^>]*\bw:h="16838"/)
  })

  it('sets margins 1440/1440/1440/1797 twips (left = 3.17cm binding allowance)', () => {
    expect(MARGIN).toEqual({ top: 1440, right: 1440, bottom: 1440, left: 1797 })
    expect(doc).toMatch(/<w:pgMar[^>]*\bw:top="1440"/)
    expect(doc).toMatch(/<w:pgMar[^>]*\bw:bottom="1440"/)
    expect(doc).toMatch(/<w:pgMar[^>]*\bw:right="1440"/)
    expect(doc).toMatch(/<w:pgMar[^>]*\bw:left="1797"/)
  })

  it('enables Different First Page (titlePg) in the section', () => {
    expect(doc).toMatch(/<w:titlePg\s*\/>/)
  })

  it('content width is page minus L/R margins (8669 twips)', () => {
    expect(CONTENT_WIDTH_TWIPS).toBe(11906 - 1797 - 1440)
  })
})

describe('wordDoc — typography styles (SPEC 2, 3)', () => {
  let styles: string
  beforeAll(async () => {
    styles = (await unzip('<h1>H</h1>'))['word/styles.xml']
  })

  it('default document run uses TH Sarabun New at 16pt (sz 32 half-points)', () => {
    expect(styles).toMatch(/<w:rFonts[^>]*\bw:ascii="TH Sarabun New"/)
    expect(styles).toMatch(/<w:rFonts[^>]*\bw:cs="TH Sarabun New"/)
    // docDefaults run size = 32 half-points = 16pt.
    expect(styles).toMatch(/<w:docDefaults>[\s\S]*<w:sz w:val="32"\/>/)
  })

  it('body paragraphs carry widow/orphan control and 1.15 line spacing', () => {
    expect(styles).toMatch(/<w:widowControl\b/)
    // line 276 twips (240 × 1.15), lineRule auto.
    expect(styles).toMatch(/<w:spacing[^>]*\bw:line="276"[^>]*\bw:lineRule="auto"/)
  })

  it('Heading 1 = 24pt bold, brand navy, keepNext', () => {
    const h1 = styles.match(/<w:style [^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/)?.[0] ?? ''
    expect(h1).toMatch(/<w:sz w:val="48"\/>/) // 24pt
    expect(h1).toMatch(/<w:b\/>/)
    expect(h1).toMatch(new RegExp(`<w:color w:val="${BRAND}"`))
    expect(h1).toMatch(/<w:keepNext\b/)
  })

  it('Heading 2 = 18pt bold with keepNext', () => {
    const h2 = styles.match(/<w:style [^>]*w:styleId="Heading2"[\s\S]*?<\/w:style>/)?.[0] ?? ''
    expect(h2).toMatch(/<w:sz w:val="36"\/>/) // 18pt
    expect(h2).toMatch(/<w:b\/>/)
    expect(h2).toMatch(/<w:keepNext\b/)
  })

  it('Heading 3 = 14pt bold-italic with keepNext', () => {
    const h3 = styles.match(/<w:style [^>]*w:styleId="Heading3"[\s\S]*?<\/w:style>/)?.[0] ?? ''
    expect(h3).toMatch(/<w:sz w:val="28"\/>/) // 14pt
    expect(h3).toMatch(/<w:b\/>/)
    expect(h3).toMatch(/<w:i\/>/)
    expect(h3).toMatch(/<w:keepNext\b/)
  })
})

describe('wordDoc — header, footer & page numbers (SPEC 4)', () => {
  it('footer contains a PAGE field (page number)', async () => {
    const files = await unzip('<p>x</p>')
    const footers = joinParts(files, 'footer')
    expect(footers).toMatch(/PAGE/)
  })

  it('running header carries the document name', async () => {
    const files = await unzip('<p>x</p>', 'Quarterly Report')
    const headers = joinParts(files, 'header')
    expect(headers).toContain('Quarterly Report')
  })

  it('first-page header/footer are blank (no page number on page 1)', async () => {
    // titlePg routes page 1 to the "first" header/footer, which we leave empty.
    const files = await unzip('<p>x</p>')
    // Exactly one footer part should contain PAGE; at least one is empty.
    const footerParts = Object.keys(files).filter((p) => p.startsWith('word/footer'))
    const withPage = footerParts.filter((p) => /PAGE/.test(files[p]))
    expect(footerParts.length).toBeGreaterThanOrEqual(2)
    expect(withPage.length).toBe(1)
  })
})

describe('wordDoc — page-break control (SPEC 3)', () => {
  it('first H1 has no page break; each subsequent H1 starts a new page', async () => {
    const doc = (await unzip('<h1>One</h1><p>a</p><h1>Two</h1><p>b</p>'))['word/document.xml']
    const breaks = doc.match(/<w:pageBreakBefore\b/g) ?? []
    expect(breaks.length).toBe(1) // only the 2nd H1
  })

  it('a single H1 document has no page break', async () => {
    const doc = (await unzip('<h1>Only</h1>'))['word/document.xml']
    expect(doc).not.toMatch(/<w:pageBreakBefore\b/)
  })
})

describe('wordDoc — tables (SPEC 5)', () => {
  let doc: string
  beforeAll(async () => {
    const html =
      '<table><tbody>' +
      '<tr><th>Name</th><th>Role</th></tr>' +
      '<tr><td>Alice</td><td>Owner</td></tr>' +
      '</tbody></table>'
    doc = (await unzip(html))['word/document.xml']
  })

  it('uses thin light-gray borders (#D9D9D9, 0.5pt) not thick black', () => {
    expect(doc).toMatch(/<w:tblBorders>/)
    expect(doc).toMatch(/w:color="D9D9D9"/)
    expect(doc).not.toMatch(/<w:tblBorders>[\s\S]*?w:sz="24"/) // no heavy border
  })

  it('shades the header row with the brand color', () => {
    expect(doc).toMatch(new RegExp(`<w:shd[^>]*w:fill="${BRAND}"`))
  })

  it('header cells render white bold text', () => {
    expect(doc).toMatch(/<w:color w:val="FFFFFF"/)
    expect(doc).toContain('Name')
    expect(doc).toContain('Role')
  })

  it('marks rows cantSplit so they do not break across pages', () => {
    expect(doc).toMatch(/<w:cantSplit\b/)
    expect(doc).toMatch(/<w:tblHeader\b/) // header row repeats
  })
})

describe('wordDoc — callouts (SPEC 6)', () => {
  it('renders a Box callout with a thick brand left border + tinted background', async () => {
    const doc = (await unzip('<div class="tb-box"><p>Heads up</p></div>'))['word/document.xml']
    expect(doc).toContain('Heads up')
    // Paragraph border on the left in the brand color.
    expect(doc).toMatch(/<w:pBdr>[\s\S]*?<w:left[^>]*w:color="1F3864"/)
    // Light navy shading fill.
    expect(doc).toMatch(/<w:shd[^>]*w:fill="EAEEF6"/)
  })

  it('renders a blockquote as the same callout style', async () => {
    const doc = (await unzip('<blockquote><p>Quote</p></blockquote>'))['word/document.xml']
    expect(doc).toMatch(/<w:pBdr>[\s\S]*?<w:left[^>]*w:color="1F3864"/)
  })
})

describe('wordDoc — custom nodes (task list, mention)', () => {
  it('renders task items with checkbox glyphs', async () => {
    const html =
      '<ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="true"><label><input type="checkbox"><span></span></label><div><p>Shipped</p></div></li>' +
      '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Pending</p></div></li>' +
      '</ul>'
    const doc = (await unzip(html))['word/document.xml']
    expect(doc).toContain('☑')
    expect(doc).toContain('Shipped')
    expect(doc).toContain('☐')
    expect(doc).toContain('Pending')
  })

  it('keeps literal @mention text', async () => {
    const doc = (await unzip('<p>cc <span class="tb-mention">@alice</span></p>'))['word/document.xml']
    expect(doc).toContain('@alice')
  })
})

describe('wordDoc — images (SPEC 7)', () => {
  // 1×1 transparent PNG.
  const PNG_1x1 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

  it('embeds a data-URL image as media and never exceeds the text width', async () => {
    // width attr far larger than the page → must be capped.
    const files = await unzip(`<p><img src="data:image/png;base64,${PNG_1x1}" width="5000"></p>`)
    const media = Object.keys(files) // media entries aren't .xml, check the raw zip instead
    // Re-open to inspect media + drawing extent.
    const buf = await buildWordBuffer(`<p><img src="data:image/png;base64,${PNG_1x1}" width="5000"></p>`, 'i')
    const zip = await JSZip.loadAsync(buf)
    const mediaFiles = Object.keys(zip.files).filter((p) => p.startsWith('word/media/') && !zip.files[p].dir)
    expect(mediaFiles.length).toBe(1)

    const docXml = files['word/document.xml']
    const cx = Number(docXml.match(/<wp:extent cx="(\d+)"/)?.[1])
    // Content width 8669 twips → EMU = twips × 635. Image must not exceed it.
    const maxEmu = CONTENT_WIDTH_TWIPS * 635
    expect(cx).toBeGreaterThan(0)
    expect(cx).toBeLessThanOrEqual(maxEmu)
    expect(media).toBeTruthy()
  })
})

describe('wordDoc — pure helpers', () => {
  it('cssColorToHex normalizes hex and rgb() to OOXML RRGGBB', () => {
    expect(cssColorToHex('#7C5CFF')).toBe('7C5CFF')
    expect(cssColorToHex('#abc')).toBe('AABBCC')
    expect(cssColorToHex('rgb(31, 56, 100)')).toBe('1F3864')
    expect(cssColorToHex('nonsense')).toBeNull()
    expect(cssColorToHex(null)).toBeNull()
  })

  it('intrinsicSize reads PNG IHDR width/height from raw bytes', () => {
    const bytes = new Uint8Array(24)
    const dv = new DataView(bytes.buffer)
    dv.setUint32(16, 640)
    dv.setUint32(20, 480)
    expect(intrinsicSize(bytes, 'png')).toEqual({ w: 640, h: 480 })
  })

  it('htmlToBlocks never returns an empty document', () => {
    expect(htmlToBlocks('').length).toBeGreaterThan(0)
    expect(htmlToBlocks('<p>x</p>').length).toBe(1)
  })
})
