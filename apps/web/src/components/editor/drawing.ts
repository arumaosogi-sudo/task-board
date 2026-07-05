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
