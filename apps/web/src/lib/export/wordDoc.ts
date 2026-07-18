// Professional A4 Word (.docx) generator — the pure, testable core of the Word export.
//
// Input:  the editor's HTML mirror (`editor.getHTML()`), already SVG-rasterized and with
//         remote images inlined as data-URLs by the browser shell (`word.ts`).
// Output: a `docx` `Document` (→ `renderDocxXml` / `buildWordBlob` for the zip).
//
// This module owns ALL styling decisions (ADR 0008): page geometry, Thai-first typography,
// heading styles with keepNext, widow control, brand table shading, callouts, page numbers.
// It imports only `docx` + `./prepare` (DOM helpers), so it is exercised end-to-end in
// jsdom by `word.test.ts` (which unzips the produced .docx and asserts on the real XML).
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  ExternalHyperlink,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
  LineRuleType,
  BorderStyle,
  WidthType,
  ShadingType,
  VerticalAlign,
  PageNumber,
  Header,
  Footer,
  Table,
  TableRow,
  TableCell,
  type IParagraphOptions,
  type IRunOptions,
  type ISectionOptions,
  type FileChild,
} from 'docx'
import { parseHtml } from './prepare'

/* ── Theme (ADR 0008) ─────────────────────────────────────────────────────────
   One brand color (dark navy) used consistently for H1, table header shading and the
   callout accent. Colors are OOXML hex (no leading '#'). */
export const BRAND = '1F3864' // dark navy — H1 + table header + callout border
const BRAND_TINT = 'EAEEF6' // light navy wash for callout background
const TABLE_BORDER = 'D9D9D9' // thin light-gray table borders (~0.5pt)
const HEADER_GRAY = 'A6A6A6' // running-header text (light gray)
const FOOTER_GRAY = '808080' // page-number text (dark gray)
const HYPERLINK_BLUE = '0563C1'
const CODE_SHADE = 'F2F2F2'

// Single font family, Thai-first. OOXML w:rFonts takes ONE name per script slot — a
// CSS-style fallback chain isn't expressible, so Word's font substitution covers a missing
// family at render time (ADR 0008 limitation #1). We set ascii/hAnsi/cs to the same name.
export const FONT = 'TH Sarabun New'

// A4 portrait in twips (1 mm = 56.6929 twips): 210×297 mm.
export const PAGE_W = 11906
export const PAGE_H = 16838
// Margins (twips): 2.54 cm = 1440; left 3.17 cm = 1797 (binding allowance).
export const MARGIN = { top: 1440, right: 1440, bottom: 1440, left: 1797 }

// Body 16pt (docx sizes are half-points). Headings per spec.
const SZ = { body: 32, h1: 48, h2: 36, h3: 28, small: 24, page: 28 }
// Spacing in twips (1 pt = 20 twips).
const PT = (pt: number) => pt * 20
// Line spacing 1.15 for 16pt body: 240 × 1.15 = 276 (lineRule auto).
const BODY_LINE = 276

// Usable text width = page − left − right margins (twips). Images must not exceed it.
export const CONTENT_WIDTH_TWIPS = PAGE_W - MARGIN.left - MARGIN.right // 8669
// …expressed in px at 96 dpi (1 in = 1440 twips = 96 px) for ImageRun sizing.
const CONTENT_WIDTH_PX = Math.floor((CONTENT_WIDTH_TWIPS / 1440) * 96) // ~578

const OL_REF = 'tb-ol' // ordered-list numbering instance id

/* ── Inline formatting context, threaded through the recursive walk ─────────── */
interface Fmt {
  bold?: boolean
  italics?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  font?: string
  size?: number // half-points
  code?: boolean
}

const isEl = (n: Node): n is HTMLElement => n.nodeType === 1
const tag = (n: Node) => (isEl(n) ? n.tagName.toLowerCase() : '')

/** CSS `text-align` on a block element → docx AlignmentType. */
function alignOf(el: HTMLElement): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  const a = el.style.textAlign || el.getAttribute('align') || ''
  if (a === 'center') return AlignmentType.CENTER
  if (a === 'right') return AlignmentType.RIGHT
  if (a === 'justify') return AlignmentType.JUSTIFIED
  if (a === 'left') return AlignmentType.LEFT
  return undefined
}

/** Merge a span's inline style (color / font-family / font-size) into the format context. */
function applySpanStyle(el: HTMLElement, ctx: Fmt): Fmt {
  const next = { ...ctx }
  const color = el.style.color
  if (color) {
    const hex = cssColorToHex(color)
    if (hex) next.color = hex
  }
  const family = el.style.fontFamily
  if (family) next.font = family.split(',')[0].replace(/['"]/g, '').trim() || next.font
  const fs = el.style.fontSize
  const m = fs && fs.match(/^(\d+(?:\.\d+)?)px$/)
  if (m) next.size = Math.round(parseFloat(m[1]) * 1.5) // px → half-points (px×0.75 pt ×2)
  return next
}

/** Normalize `#rgb` / `#rrggbb` / `rgb(...)` to OOXML `RRGGBB`, else null. */
export function cssColorToHex(input: string | null | undefined): string | null {
  if (!input) return null
  const c = input.trim().toLowerCase()
  let m = c.match(/^#([0-9a-f]{6})$/)
  if (m) return m[1].toUpperCase()
  m = c.match(/^#([0-9a-f]{3})$/)
  if (m) return m[1].split('').map((x) => x + x).join('').toUpperCase()
  m = c.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/)
  if (m) {
    const h = (n: string) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0')
    return `${h(m[1])}${h(m[2])}${h(m[3])}`.toUpperCase()
  }
  return null
}

/* ── Image decoding (browser-independent, so jsdom tests cover it) ──────────── */
type DocxImgType = 'png' | 'jpg' | 'gif' | 'bmp'

/** Decode a base64 string to bytes (browser + jsdom both provide `atob`). */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Intrinsic pixel size from raw image bytes — PNG (IHDR), GIF (header), JPEG (SOF). */
export function intrinsicSize(bytes: Uint8Array, type: DocxImgType): { w: number; h: number } | null {
  try {
    if (type === 'png' && bytes.length >= 24) {
      const dv = new DataView(bytes.buffer, bytes.byteOffset)
      return { w: dv.getUint32(16), h: dv.getUint32(20) }
    }
    if (type === 'gif' && bytes.length >= 10) {
      const dv = new DataView(bytes.buffer, bytes.byteOffset)
      return { w: dv.getUint16(6, true), h: dv.getUint16(8, true) }
    }
    if (type === 'jpg') {
      const dv = new DataView(bytes.buffer, bytes.byteOffset)
      let off = 2
      while (off + 9 < bytes.length) {
        if (dv.getUint8(off) !== 0xff) { off++; continue }
        const marker = dv.getUint8(off + 1)
        // SOF0..SOF15 except DHT(c4)/DNL(c8)/DRI(cc) carry frame height/width.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { h: dv.getUint16(off + 5), w: dv.getUint16(off + 7) }
        }
        off += 2 + dv.getUint16(off + 2)
      }
    }
  } catch {
    /* fall through */
  }
  return null
}

/** Build an ImageRun from an `<img data:...>` element, capped to the content width. */
function imageRun(el: HTMLElement): ImageRun | null {
  const src = el.getAttribute('src') || ''
  const m = src.match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i)
  if (!m) return null // remote/unsupported images are inlined→dropped by the shell (word.ts)
  const type: DocxImgType = m[1].toLowerCase() === 'png' ? 'png'
    : m[1].toLowerCase() === 'gif' ? 'gif'
    : m[1].toLowerCase() === 'bmp' ? 'bmp' : 'jpg'
  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(m[2])
  } catch {
    return null
  }
  const intrinsic = intrinsicSize(bytes, type)
  const attrW = Number(el.getAttribute('width')) || intrinsic?.w || CONTENT_WIDTH_PX
  const aspect = intrinsic && intrinsic.w ? intrinsic.h / intrinsic.w : 0.75
  let width = attrW
  let height = Math.round(attrW * aspect)
  if (width > CONTENT_WIDTH_PX) {
    width = CONTENT_WIDTH_PX
    height = Math.round(CONTENT_WIDTH_PX * aspect)
  }
  return new ImageRun({ data: bytes, type, transformation: { width, height } })
}

/* ── Inline walk: DOM inline content → docx runs ───────────────────────────── */
type InlineChild = TextRun | ImageRun | ExternalHyperlink

function runOpts(text: string, ctx: Fmt): IRunOptions {
  return {
    text,
    font: ctx.code ? 'Consolas' : ctx.font ?? FONT,
    ...(ctx.bold ? { bold: true } : {}),
    ...(ctx.italics ? { italics: true } : {}),
    ...(ctx.underline ? { underline: {} } : {}),
    ...(ctx.strike ? { strike: true } : {}),
    ...(ctx.color ? { color: ctx.color } : {}),
    ...(ctx.size ? { size: ctx.size } : {}),
    ...(ctx.code ? { shading: { type: ShadingType.CLEAR, fill: CODE_SHADE } } : {}),
  }
}

function walkInline(node: Node, ctx: Fmt, out: InlineChild[]): void {
  if (node.nodeType === 3) {
    const text = node.textContent ?? ''
    if (text) out.push(new TextRun(runOpts(text, ctx)))
    return
  }
  if (!isEl(node)) return
  const el = node
  const t = tag(el)

  switch (t) {
    case 'br':
      out.push(new TextRun({ break: 1 }))
      return
    case 'img': {
      const run = imageRun(el)
      if (run) out.push(run)
      return
    }
    case 'a': {
      const href = el.getAttribute('href')
      const inner: InlineChild[] = []
      const linkCtx = { ...ctx, color: HYPERLINK_BLUE, underline: true }
      el.childNodes.forEach((c) => walkInline(c, linkCtx, inner))
      if (href) out.push(new ExternalHyperlink({ link: href, children: inner as (TextRun | ImageRun)[] }))
      else inner.forEach((c) => out.push(c))
      return
    }
  }

  // Mention chip → keep literal "@username", tint it navy semibold so it reads as a chip.
  if (el.classList.contains('tb-mention')) {
    const text = el.textContent ?? ''
    if (text) out.push(new TextRun(runOpts(text, { ...ctx, bold: true, color: BRAND })))
    return
  }

  const next = { ...ctx }
  if (t === 'strong' || t === 'b') next.bold = true
  else if (t === 'em' || t === 'i') next.italics = true
  else if (t === 'u') next.underline = true
  else if (t === 's' || t === 'strike' || t === 'del') next.strike = true
  else if (t === 'code') next.code = true
  else if (t === 'span') Object.assign(next, applySpanStyle(el, ctx))
  // sup/sub/mark/other inline wrappers: just recurse with current context.

  el.childNodes.forEach((c) => walkInline(c, next, out))
}

function inlineChildren(el: HTMLElement, ctx: Fmt = {}): InlineChild[] {
  const out: InlineChild[] = []
  el.childNodes.forEach((c) => walkInline(c, ctx, out))
  return out
}

/* ── Callout (blockquote / Box) paragraph decoration ───────────────────────── */
const CALLOUT_PROPS: Partial<IParagraphOptions> = {
  border: {
    left: { style: BorderStyle.SINGLE, size: 24, space: 8, color: BRAND }, // ~3pt bar
  },
  shading: { type: ShadingType.CLEAR, fill: BRAND_TINT },
  indent: { left: 300 },
}

/* ── Block walk: DOM block content → docx paragraphs / tables ───────────────── */
interface BlockCtx {
  callout?: boolean
  listLevel?: number
  bullet?: boolean // true=unordered, false=ordered (when listLevel defined)
}

let h1Seen = false // module-scoped guard reset at the start of every build (htmlToBlocks)

function paragraph(el: HTMLElement, opts: Partial<IParagraphOptions>, ctx: BlockCtx): Paragraph {
  const base: IParagraphOptions = {
    children: inlineChildren(el),
    alignment: alignOf(el),
    ...opts,
  }
  if (ctx.callout) Object.assign(base, CALLOUT_PROPS, { alignment: base.alignment })
  return new Paragraph(base)
}

function headingParagraph(el: HTMLElement, level: 1 | 2 | 3): Paragraph {
  const heading =
    level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3
  // Each top-level H1 starts a new page — except the very first (no leading blank page).
  const pageBreakBefore = level === 1 && h1Seen
  if (level === 1) h1Seen = true
  return new Paragraph({
    heading,
    alignment: alignOf(el),
    pageBreakBefore,
    children: inlineChildren(el),
  })
}

function listParagraphs(list: HTMLElement, ordered: boolean, level: number): Paragraph[] {
  const out: Paragraph[] = []
  Array.from(list.children).forEach((li) => {
    if (tag(li) !== 'li') return
    const liEl = li as HTMLElement
    // Split each <li> into its inline lead + nested block children (nested lists / paras).
    const leadRuns: InlineChild[] = []
    const nested: HTMLElement[] = []
    liEl.childNodes.forEach((c) => {
      const ct = tag(c)
      if (ct === 'ul' || ct === 'ol') nested.push(c as HTMLElement)
      else if (ct === 'p') walkInline(c, {}, leadRuns)
      else walkInline(c, {}, leadRuns)
    })
    out.push(
      new Paragraph({
        children: leadRuns,
        ...(ordered
          // numbering() only defines ilvl 0-3, but nesting recurses unbounded — clamp
          // so a deeper level still renders (against ilvl 3) instead of losing its number.
          ? { numbering: { reference: OL_REF, level: Math.min(level, 3) } }
          : { bullet: { level } }),
      }),
    )
    nested.forEach((n) => out.push(...listParagraphs(n, tag(n) === 'ol', level + 1)))
  })
  return out
}

/** Task list (`ul[data-type=taskList]`) → body paragraphs with a checkbox glyph. */
function taskListParagraphs(list: HTMLElement): Paragraph[] {
  const out: Paragraph[] = []
  Array.from(list.children).forEach((li) => {
    if (tag(li) !== 'li') return
    const liEl = li as HTMLElement
    const checked = liEl.getAttribute('data-checked') === 'true'
    const runs: InlineChild[] = [new TextRun(runOpts(checked ? '☑ ' : '☐ ', {}))]
    // Content lives in a <div><p>…</p></div> wrapper; walk its inline content, skip the label.
    liEl.querySelectorAll(':scope > label').forEach((l) => l.remove())
    const contentHost = liEl.querySelector(':scope > div') ?? liEl
    contentHost.childNodes.forEach((c) => walkInline(c, {}, runs))
    out.push(new Paragraph({ children: runs, spacing: { after: PT(4) } }))
  })
  return out
}

function tableCellParagraphs(cell: HTMLElement, header: boolean): Paragraph[] {
  const runsCtx: Fmt = header ? { bold: true, color: 'FFFFFF' } : {}
  // A cell may hold multiple <p>; render each, else the cell's own inline content.
  const paras = Array.from(cell.querySelectorAll(':scope > p')) as HTMLElement[]
  const build = (host: HTMLElement) =>
    new Paragraph({ children: inlineChildren(host, runsCtx), alignment: alignOf(host) })
  if (paras.length) return paras.map(build)
  return [build(cell)]
}

function buildTable(tableEl: HTMLElement): Table {
  const rows: TableRow[] = []
  const trs = Array.from(tableEl.querySelectorAll('tr'))
  trs.forEach((tr, rowIndex) => {
    const cells = Array.from(tr.children).filter((c) => tag(c) === 'td' || tag(c) === 'th') as HTMLElement[]
    const isHeaderRow = rowIndex === 0 && cells.some((c) => tag(c) === 'th')
    const tableCells = cells.map((cell) => {
      const header = tag(cell) === 'th' || isHeaderRow
      const colSpan = Number(cell.getAttribute('colspan')) || 1
      const rowSpan = Number(cell.getAttribute('rowspan')) || 1
      return new TableCell({
        children: tableCellParagraphs(cell, header),
        shading: header ? { type: ShadingType.CLEAR, fill: BRAND, color: 'auto' } : undefined,
        columnSpan: colSpan > 1 ? colSpan : undefined,
        rowSpan: rowSpan > 1 ? rowSpan : undefined,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 40, bottom: 40, left: 100, right: 100 },
      })
    })
    rows.push(new TableRow({ children: tableCells, tableHeader: isHeaderRow, cantSplit: true }))
  })
  const thin = { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER } // 0.5pt
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin },
  })
}

/** One block-level DOM node → zero or more docx block children. */
function walkBlock(node: Node, ctx: BlockCtx, out: FileChild[]): void {
  if (node.nodeType === 3) {
    const text = node.textContent ?? ''
    if (text.trim()) out.push(new Paragraph({ children: [new TextRun(runOpts(text, {}))] }))
    return
  }
  if (!isEl(node)) return
  const el = node
  const t = tag(el)

  switch (t) {
    case 'h1': out.push(headingParagraph(el, 1)); return
    case 'h2': out.push(headingParagraph(el, 2)); return
    case 'h3': out.push(headingParagraph(el, 3)); return
    case 'h4': case 'h5': case 'h6': out.push(headingParagraph(el, 3)); return
    case 'p': out.push(paragraph(el, {}, ctx)); return
    case 'ul':
      if (el.getAttribute('data-type') === 'taskList') out.push(...taskListParagraphs(el))
      else out.push(...listParagraphs(el, false, 0))
      return
    case 'ol': out.push(...listParagraphs(el, true, 0)); return
    case 'table': out.push(buildTable(el)); return
    case 'hr':
      out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TABLE_BORDER, space: 1 } } }))
      return
    case 'img': {
      // Bare, block-level <img> (the editor's Image node is inline:false, so
      // editor.getHTML() emits a top-level <img>; rasterized drawings hit here too).
      // Must build the ImageRun directly — routing through paragraph() would read the
      // element's CHILDREN, and <img> is void (zero children) → the image is dropped.
      const run = imageRun(el)
      if (run) out.push(new Paragraph({ children: [run], alignment: alignOf(el) }))
      return
    }
    case 'script':
    case 'style':
      return // never emit the raw text content of script/style elements
    case 'pre': {
      const text = el.textContent ?? ''
      out.push(new Paragraph({ children: [new TextRun(runOpts(text, { code: true }))], shading: { type: ShadingType.CLEAR, fill: CODE_SHADE } }))
      return
    }
    case 'blockquote': {
      // Callout: recurse inner blocks with the callout flag set.
      const inner: FileChild[] = []
      el.childNodes.forEach((c) => walkBlock(c, { ...ctx, callout: true }, inner))
      if (inner.length === 0) inner.push(paragraph(el, {}, { ...ctx, callout: true }))
      out.push(...inner)
      return
    }
    case 'div':
      if (el.classList.contains('tb-box')) {
        const inner: FileChild[] = []
        el.childNodes.forEach((c) => walkBlock(c, { ...ctx, callout: true }, inner))
        if (inner.length === 0) inner.push(paragraph(el, {}, { ...ctx, callout: true }))
        out.push(...inner)
        return
      }
      // Generic div wrapper: descend into its children.
      el.childNodes.forEach((c) => walkBlock(c, ctx, out))
      return
    default:
      // Unknown/inline-at-block-level: wrap its inline content in a paragraph if non-empty.
      if ((el.textContent ?? '').trim() || el.querySelector('img')) out.push(paragraph(el, {}, ctx))
  }
}

/* ── Document assembly ─────────────────────────────────────────────────────── */

/** Convert the (already image-inlined) editor HTML into docx block children. */
export function htmlToBlocks(html: string): FileChild[] {
  h1Seen = false
  const doc = parseHtml(html)
  const out: FileChild[] = []
  doc.body.childNodes.forEach((c) => walkBlock(c, {}, out))
  if (out.length === 0) out.push(new Paragraph({ children: [] }))
  return out
}

/**
 * Document styles. Built-in heading styles (Heading1..3) MUST be overridden through
 * `default.heading1..3` — the library ships its own Heading defaults, and a same-id entry
 * in `paragraphStyles` is dropped in their favor (verified against the produced styles.xml).
 * `keepNext` + `keepLines` implement SPEC 3 (headings don't strand from their body).
 */
function styles() {
  return {
    default: {
      document: {
        run: { font: FONT, size: SZ.body, color: '000000' },
        paragraph: {
          spacing: { line: BODY_LINE, lineRule: LineRuleType.AUTO, after: PT(6) },
          widowControl: true,
        },
      },
      heading1: {
        run: { font: FONT, size: SZ.h1, bold: true, color: BRAND },
        paragraph: { spacing: { before: PT(12), after: PT(6) }, keepNext: true, keepLines: true },
      },
      heading2: {
        run: { font: FONT, size: SZ.h2, bold: true },
        paragraph: { spacing: { before: PT(12), after: PT(4) }, keepNext: true, keepLines: true },
      },
      heading3: {
        run: { font: FONT, size: SZ.h3, bold: true, italics: true },
        paragraph: { spacing: { before: PT(6), after: PT(2) }, keepNext: true, keepLines: true },
      },
    },
  }
}

function numbering() {
  return {
    config: [
      {
        reference: OL_REF,
        levels: [0, 1, 2, 3].map((level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
      },
    ],
  }
}

function runningHeader(docName: string): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: docName, font: FONT, size: SZ.small, color: HEADER_GRAY })],
      }),
    ],
  })
}

function pageFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SZ.page, color: FOOTER_GRAY })],
      }),
    ],
  })
}

/** Assemble the full docx `Document` from editor HTML. Pure — no I/O. */
export function buildWordDocument(html: string, docName: string): Document {
  const section: ISectionOptions = {
    properties: {
      titlePage: true, // Different First Page — no page number on page 1
      page: {
        size: { width: PAGE_W, height: PAGE_H },
        margin: MARGIN,
      },
    },
    headers: { default: runningHeader(docName), first: new Header({ children: [new Paragraph({ children: [] })] }) },
    footers: { default: pageFooter(), first: new Footer({ children: [new Paragraph({ children: [] })] }) },
    children: htmlToBlocks(html),
  }
  return new Document({
    creator: 'Task Board',
    title: docName,
    styles: styles(),
    numbering: numbering(),
    sections: [section],
  })
}

/** Editor HTML → .docx Blob (browser via jszip). */
export function buildWordBlob(html: string, docName: string): Promise<Blob> {
  return Packer.toBlob(buildWordDocument(html, docName))
}

/** Editor HTML → raw .docx bytes (used by tests to unzip + assert on the XML). */
export function buildWordBuffer(html: string, docName: string): Promise<Buffer> {
  return Packer.toBuffer(buildWordDocument(html, docName))
}
