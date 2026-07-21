// SPEC 3 — resize-snap math for the inline image node (pure, framework-free core).
//
// Images are "in line with text" (Word-style): the node is inline and alignment comes
// from the paragraph's own alignment (TextAlign), so there is NO image layout/position
// model here anymore — only the drag-to-resize snapping stays. This module has zero
// React / ProseMirror / DOM dependencies, so it is unit tested directly (imageResize.test.ts).

/* ── Resize snapping ───────────────────────────────────────────────────────────
   While the user drags the resize handle, width snaps to a small set of "nice"
   fractions of the editor's content width (like Google Docs' 25/50/75/100% guides),
   but only when the raw width lands within a tolerance band — otherwise free resize
   is preserved. Pure math, so it's the easy part to test exhaustively. */

/** Snap targets as fractions of the editor content width. 1/3 and 2/3 included so
 *  three- and two-column-ish layouts land cleanly. Kept sorted ascending. */
export const SNAP_FRACTIONS: readonly number[] = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1]

/** How close (px) the raw width must be to a target before it snaps. */
export const SNAP_TOLERANCE_PX = 8

/** Minimum rendered width — matches the resize handle's floor. */
export const MIN_IMAGE_WIDTH_PX = 48

export interface SnapResult {
  /** The width to apply (px), already floored to MIN_IMAGE_WIDTH_PX. */
  width: number
  /** The fraction it snapped to (for the % badge), or null when free-resizing. */
  fraction: number | null
}

/**
 * Snap a raw dragged width to the nearest fraction-of-content-width target when within
 * tolerance; otherwise return the raw width unchanged. `contentWidthPx` is the editor's
 * usable content-box width (ProseMirror `view.dom.clientWidth`).
 */
export function snapWidth(
  rawPx: number,
  contentWidthPx: number,
  tolerancePx: number = SNAP_TOLERANCE_PX,
): SnapResult {
  const raw = Math.max(MIN_IMAGE_WIDTH_PX, rawPx)
  if (!Number.isFinite(contentWidthPx) || contentWidthPx <= 0) {
    return { width: Math.round(raw), fraction: null }
  }
  let best: { target: number; fraction: number; dist: number } | null = null
  for (const fraction of SNAP_FRACTIONS) {
    const target = fraction * contentWidthPx
    const dist = Math.abs(raw - target)
    if (dist <= tolerancePx && (best === null || dist < best.dist)) {
      best = { target, fraction, dist }
    }
  }
  if (best) {
    return { width: Math.max(MIN_IMAGE_WIDTH_PX, Math.round(best.target)), fraction: best.fraction }
  }
  return { width: Math.round(raw), fraction: null }
}

/** Format a snap fraction as a compact percent label for the resize badge (e.g. "33%"). */
export function fractionLabel(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}
