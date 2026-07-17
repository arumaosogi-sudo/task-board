// Shared HTML pre-processing for Word / Markdown export.
//
// The document body we export is the same HTML mirror the PDF export uses
// (`editor.getHTML()`), so every custom node already round-trips as plain HTML:
//   - Box callout        → <div class="tb-box">…</div>
//   - Image / drawing     → <img src="data:…">  (drawings are inline SVG data-URLs)
//   - Task/checklist       → <ul data-type="taskList"><li data-type="taskItem" data-checked>…
//   - @mention            → <span class="tb-mention">@username</span>
//
// The one thing neither DOCX nor Markdown handle well is an inline **SVG** image, so we
// rasterize freehand drawings to PNG data-URLs before handing the HTML to either exporter.

const SVG_DATA_URL_PREFIX = 'data:image/svg+xml'
// Sensible fallbacks when an SVG lacks intrinsic dimensions (older/legacy drawings).
const FALLBACK_W = 800
const FALLBACK_H = 600
// Render at 2x so rasterized freehand strokes stay crisp in Word / Markdown viewers.
const RASTER_SCALE = 2

/** Parse an HTML fragment string into a detached Document we can safely mutate. */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

/** Serialize a mutated Document back to an HTML fragment string (body contents only). */
export function serialize(doc: Document): string {
  return doc.body.innerHTML
}

/**
 * Rasterize a single SVG data-URL to a PNG data-URL via an offscreen canvas.
 * Rejects if the browser can't load/paint the SVG so the caller can fall back.
 */
function svgDataUrlToPng(src: string, hintW?: number, hintH?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const w = image.naturalWidth || hintW || FALLBACK_W
      const h = image.naturalHeight || hintH || FALLBACK_H
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(w * RASTER_SCALE))
      canvas.height = Math.max(1, Math.round(h * RASTER_SCALE))
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas 2d context unavailable'))
      ctx.scale(RASTER_SCALE, RASTER_SCALE)
      ctx.drawImage(image, 0, 0, w, h)
      try {
        resolve(canvas.toDataURL('image/png'))
      } catch (err) {
        reject(err instanceof Error ? err : new Error('toDataURL failed'))
      }
    }
    image.onerror = () => reject(new Error('SVG image failed to load'))
    image.src = src
  })
}

/**
 * Replace every inline-SVG <img> in `doc` with a rasterized PNG, and set an explicit
 * width/height so downstream exporters size it correctly. Mutates `doc` in place.
 * A failed conversion leaves the original SVG src untouched (best-effort, never throws).
 */
export async function rasterizeSvgImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.querySelectorAll('img')).filter((img) =>
    (img.getAttribute('src') ?? '').startsWith(SVG_DATA_URL_PREFIX),
  )
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src')
      if (!src) return
      const hintW = Number(img.getAttribute('width')) || undefined
      const hintH = Number(img.getAttribute('height')) || undefined
      try {
        img.setAttribute('src', await svgDataUrlToPng(src, hintW, hintH))
      } catch {
        // Keep the original SVG src as a fallback rather than dropping the drawing.
      }
    }),
  )
}
