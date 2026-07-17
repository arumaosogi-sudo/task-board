// Word (.docx) export — lazily imported from WorkPage so the converter (and its ~hundreds
// of KB of deps) never lands in the main bundle; the chunk is fetched only on first export.
//
// Library choice: the ADR (docs/decisions/0003-tech-stack-sprint4.md #6) named `html-to-docx`.
// That package is unmaintained (last publish 2023) and ships no TypeScript types. We use its
// maintained, drop-in successor `@turbodocx/html-to-docx` instead — same default-export API,
// bundled `.d.ts`, actively released. Documented as a deliberate deviation in the handoff.
import HTMLtoDOCX from '@turbodocx/html-to-docx'
import { parseHtml, serialize, rasterizeSvgImages } from './prepare'
import { sanitizeFileName, triggerDownload } from './download'
import { normalizeDocxHtml } from './docxHtml'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * Convert the given document HTML to a .docx Blob and trigger a download.
 * `html` is the editor's HTML mirror; `docName` seeds the filename.
 */
export async function exportWord(html: string, docName: string): Promise<void> {
  const doc = parseHtml(html)
  await rasterizeSvgImages(doc) // freehand SVG drawings → PNG (Word can't embed SVG data-URLs)
  const normalized = normalizeDocxHtml(serialize(doc))

  const result = (await HTMLtoDOCX(normalized, null, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
    // Skip html-minifier-terser (a Node-oriented dependency) at runtime — the HTML we pass
    // is already clean, and the minifier adds no value client-side.
    preprocessing: { skipHTMLMinify: true },
  })) as Blob | ArrayBuffer

  // In the browser the converter resolves to a Blob; normalize an ArrayBuffer just in case.
  const blob = result instanceof Blob ? result : new Blob([result], { type: DOCX_MIME })

  triggerDownload(blob, `${sanitizeFileName(docName)}.docx`)
}
