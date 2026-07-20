// Model + pure helpers for the inline drawing layer (ADR 0005). Kept in a plain .ts
// module (not the .tsx component) so React Fast Refresh stays happy and the serializers
// are unit-testable without importing React.
import { eraseStroke, strokeIntersectsDisc, pointsToPath, type Point } from './drawingGeometry'

/** Transaction origin for local ink edits — the drawings UndoManager tracks only this,
 *  so undo/redo never reverts a peer's strokes (SPEC งานที่ 2 จ). */
export const DRAW_ORIGIN = 'tb-draw'
export type DrawTool = 'pen' | 'highlighter' | 'eraser'

/** 12 ink presets + a free picker (drawing *content* colors, not UI chrome — hex is fine
 *  here, same as the legacy modal palette). */
export const DRAW_COLORS = [
  '#1d2333', '#e5484d', '#0ea5e9', '#16a34a', '#f59e0b', '#7c5cff',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b', '#ffffff',
]
export const DRAW_SIZES = [1, 2, 3, 5, 8, 12, 20]

/** Nominal page width per orientation (matches .tb-page CSS) — the export coordinate base. */
export const PAGE_W = { portrait: 794, landscape: 1123 } as const

export interface StoredStroke {
  id: string
  tool: 'pen' | 'highlighter'
  color: string
  width: number
  opacity: number
  points: number[] // flat [x0,y0,x1,y1,…] in page pixels — compact for the CRDT
}

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `s${Date.now()}${Math.random()}`

export const flatToPoints = (f: number[]): Point[] => {
  const p: Point[] = []
  for (let i = 0; i + 1 < f.length; i += 2) p.push({ x: f[i], y: f[i + 1] })
  return p
}
export const pointsToFlat = (pts: Point[]): number[] => {
  const f: number[] = []
  for (const p of pts) f.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10)
  return f
}

/** The eraser disc radius (page px) for a given brush size — comfortably bigger than the
 *  pen so it reads as a rubber, and scales with the size picker (SPEC: ขนาดเลือกได้). */
export const eraserRadius = (size: number) => size * 2 + 6

/** Data-level viewport clip: clamp a captured point into the page box [0,w]×[0,h].
 *  Pointer capture keeps firing while a stroke is dragged off-page (over the toolbar,
 *  sidebar, or below the page), which would otherwise store off-page coordinates in the
 *  CRDT and skew the exported SVG viewBox. Clamping pins the ink to the page edge —
 *  matching GoodNotes, and complementing the CSS overflow clip on the live overlay. */
export const clampPointToPage = (x: number, y: number, w: number, h: number): Point => ({
  x: x < 0 ? 0 : x > w ? w : x,
  y: y < 0 ? 0 : y > h ? h : y,
})

/** Re-export so the overlay/eraser code has a single import surface. */
export { eraseStroke, strokeIntersectsDisc, pointsToPath }

/** Serialize the committed strokes to a standalone <svg> for the PDF export (ADR D5). */
export function strokesToSvg(strokes: StoredStroke[], pageWidth: number): string {
  if (strokes.length === 0) return ''
  let maxY = 0
  const paths = strokes
    .map((s) => {
      const pts = flatToPoints(s.points)
      for (const p of pts) if (p.y > maxY) maxY = p.y
      return (
        `<path d="${pointsToPath(pts)}" stroke="${s.color}" stroke-width="${s.width}" ` +
        `stroke-opacity="${s.opacity}" fill="none" ` +
        `stroke-linecap="${s.tool === 'highlighter' ? 'butt' : 'round'}" stroke-linejoin="round"/>`
      )
    })
    .join('')
  const h = Math.ceil(maxY + 20)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWidth} ${h}" ` +
    `width="${pageWidth}" height="${h}" ` +
    `style="position:absolute;top:0;left:0;width:100%;height:auto;pointer-events:none">${paths}</svg>`
  )
}
