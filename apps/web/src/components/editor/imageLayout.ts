// SPEC — Google-Docs-inspired image layout system (pure, framework-free core).
//
// This module owns the *data model* and *math* for image positioning so both the
// editor node view (ResizableImageView) and the export pipelines (Word/PDF) share one
// source of truth. It has zero React / ProseMirror / DOM dependencies, so it is unit
// tested directly (imageLayout.test.ts).
//
// ProseMirror uses a document flow model — there is NO absolute free placement. Every
// layout below maps to something the flow model renders natively: normal inline flow,
// a block on its own line (margins), or a CSS float with text wrapping. We deliberately
// do NOT fake drag-to-reposition.

/** How an image sits in the document flow. `inline` is the historical default. */
export type ImageLayout =
  | 'inline' // flows inline with text (legacy behavior; default for existing docs)
  | 'block-left' // own line, hugged left
  | 'block-center' // own line, centered via auto margins
  | 'block-right' // own line, hugged right
  | 'wrap-left' // floats left, text wraps down its right side
  | 'wrap-right' // floats right, text wraps down its left side

export const IMAGE_LAYOUTS: readonly ImageLayout[] = [
  'inline',
  'block-left',
  'block-center',
  'block-right',
  'wrap-left',
  'wrap-right',
]

/** Existing docs have no `layout` attr → they must keep rendering exactly as before. */
export const DEFAULT_IMAGE_LAYOUT: ImageLayout = 'inline'

/** Text-facing gap injected around wrapped images so text never kisses the edge.
 *  Mirrors the `--tb-img-gap` CSS token (12px). Kept here as a number so the export
 *  pipelines (which don't read CSS) can reuse the exact same value. */
export const IMAGE_TEXT_GAP_PX = 12

export function isImageLayout(v: unknown): v is ImageLayout {
  return typeof v === 'string' && (IMAGE_LAYOUTS as readonly string[]).includes(v)
}

/** True for the two float-with-wrap modes (they carry collision margins). */
export function isWrapLayout(layout: ImageLayout): layout is 'wrap-left' | 'wrap-right' {
  return layout === 'wrap-left' || layout === 'wrap-right'
}

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
