// Phase 4.4 — freehand drawings in the collaborative editor.
//
// A drawing is captured by DrawingCanvas as an <svg> string and stored as an inline
// SVG data-URL <img>. Reusing the Image node (instead of a bespoke SVG NodeView) means
// the drawing round-trips identically through the editor, Yjs sync, getHTML(), and the
// print-to-PDF window — a custom NodeView's innerHTML would not survive getHTML().

/** Serialize an <svg> markup string to an inline data-URL usable as an <img> src. */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Rasterize an <svg> string to a PNG Blob at `w`×`h` device pixels (scaled by `scale`
 * for crispness). Drawings are uploaded as PNG — the storage whitelist is raster-only
 * (no SVG on the server → no SVG-in-<img> XSS surface), and a flattened drawing keeps
 * its A4 aspect. White background is painted first so transparent PNGs don't render
 * black on dark canvases. Rejects if the browser can't decode the SVG.
 */
export function svgToPngBlob(svg: string, w: number, h: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = svgToDataUrl(svg)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas-unsupported'))
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob-failed'))), 'image/png')
    }
    img.onerror = () => reject(new Error('svg-decode-failed'))
    img.src = url
  })
}

/**
 * Rehydrate legacy Phase-3 documents: their freehand drawings were inlined as
 * <svg class="tb-drawing">, which the ProseMirror schema would drop on paste/seed.
 * Convert each to an equivalent data-URL <img> so old drawings survive the migration.
 */
export function migrateLegacyDrawings(html: string): string {
  if (!html || !html.includes('tb-drawing')) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('svg.tb-drawing').forEach((svg) => {
    const img = doc.createElement('img')
    img.src = svgToDataUrl(svg.outerHTML)
    img.setAttribute('alt', 'drawing')
    svg.replaceWith(img)
  })
  return doc.body.innerHTML
}
