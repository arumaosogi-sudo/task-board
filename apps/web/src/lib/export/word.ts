// Word (.docx) export — browser shell. Lazily imported from WorkPage so `docx` (and the
// converter's deps) never land in the main bundle; the chunk is fetched only on first export.
//
// Library choice (ADR 0008): we generate OOXML programmatically with the `docx` library
// instead of the old `@turbodocx/html-to-docx` HTML converter, because the owner's A4 spec
// (heading keepNext, widow control, brand table shading, callouts, titlePg, PAGE-field
// footer) is not reachable through an HTML-string converter's options. The pure, testable
// core lives in `wordDoc.ts`; this shell owns the browser-only I/O: SVG rasterization,
// remote-image inlining, and the download.
import { parseHtml, serialize, rasterizeSvgImages } from './prepare'
import { sanitizeFileName, triggerDownload } from './download'
import { buildWordBlob } from './wordDoc'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
// docx's ImageRun embeds raster BYTES, so every image must be a supported raster data-URL
// before the core runs. Uploaded images are stored as remote URLs (Supabase) and may be
// webp; we fetch + (if needed) transcode them to PNG here. Drawings are already handled by
// rasterizeSvgImages. On any failure we drop the <img> rather than fail the whole export.
const RASTER_OK = /^data:image\/(png|jpe?g|gif|bmp);base64,/i

/** Load an <img> src (remote URL or data-URL) into an HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // Supabase public objects send permissive CORS headers
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

/** Draw an image onto a canvas and read it back as a PNG data-URL (transcodes webp/remote). */
async function toPngDataUrl(src: string): Promise<string> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, img.naturalWidth || 1)
  canvas.height = Math.max(1, img.naturalHeight || 1)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png') // throws if the canvas is CORS-tainted
}

/**
 * Ensure every <img> carries a raster data-URL the docx core can embed. Remote URLs and
 * non-raster/webp data-URLs are transcoded to PNG via canvas; an <img> we cannot inline is
 * removed so it never becomes a broken reference in the document. Mutates `doc` in place.
 */
async function inlineImagesForDocx(doc: Document): Promise<void> {
  const imgs = Array.from(doc.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') ?? ''
      if (RASTER_OK.test(src)) return // already an embeddable raster data-URL
      try {
        img.setAttribute('src', await toPngDataUrl(src))
      } catch {
        img.remove() // best-effort: drop images we can't embed rather than break the export
      }
    }),
  )
}

/**
 * Convert the given document HTML to a professional A4 .docx Blob and trigger a download.
 * `html` is the editor's HTML mirror; `docName` seeds the filename and the running header.
 */
export async function exportWord(html: string, docName: string): Promise<void> {
  const doc = parseHtml(html)
  await rasterizeSvgImages(doc) // freehand SVG drawings → PNG data-URLs
  await inlineImagesForDocx(doc) // remote/webp images → embeddable PNG data-URLs
  const blob = await buildWordBlob(serialize(doc), docName)
  const out = blob instanceof Blob ? blob : new Blob([blob], { type: DOCX_MIME })
  triggerDownload(out, `${sanitizeFileName(docName)}.docx`)
}
