// Pure geometry for the inline drawing layer (ADR 0005). No DOM / React here so it
// stays trivially unit-testable and reusable by both the live overlay and any future
// server-side rasterizer.
//
// A stroke is a polyline: an ordered list of points in the page's drawing coordinate
// space (the A4 viewBox). The **circular eraser** (SPEC งานที่ 2) removes only the part
// of a stroke that falls under the eraser disc, splitting one stroke into several when
// the disc cuts through the middle — unlike the legacy modal eraser, which deleted the
// whole stroke on any hit.

export interface Point {
  x: number
  y: number
}

/** Squared distance — avoids sqrt in hot loops where we only compare to r². */
function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/**
 * Shortest squared distance from point (px,py) to the segment a→b. Returns the distance
 * to whichever is closest: endpoint a, endpoint b, or the perpendicular foot on the
 * segment. Used so the eraser also cuts a segment that passes *through* the disc even
 * when neither endpoint is inside it.
 */
export function pointToSegmentDist2(px: number, py: number, a: Point, b: Point): number {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const len2 = vx * vx + vy * vy
  if (len2 === 0) return dist2(px, py, a.x, a.y) // degenerate segment (a === b)
  // Project (p - a) onto (b - a), clamped to [0,1] so the foot stays on the segment.
  let t = ((px - a.x) * vx + (py - a.y) * vy) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return dist2(px, py, a.x + t * vx, a.y + t * vy)
}

/**
 * Erase a circular disc (centre c, radius r) from one polyline.
 *
 * Returns the surviving pieces as separate polylines (each with ≥ 2 points). A piece is
 * a maximal run of consecutive points that are outside the disc AND whose connecting
 * segments never enter the disc. Points inside the disc are dropped; a segment that
 * enters the disc ends the current piece and starts a fresh one after it — that is what
 * produces the "cut in the middle" behaviour.
 *
 * Single-point survivors are discarded: a lone point isn't a visible stroke and would
 * only add noise to the document / CRDT.
 */
export function eraseStroke(points: Point[], cx: number, cy: number, r: number): Point[][] {
  if (points.length === 0) return []
  const r2 = r * r
  const pieces: Point[][] = []
  let run: Point[] = []

  const flush = () => {
    if (run.length >= 2) pieces.push(run)
    run = []
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const inside = dist2(cx, cy, p.x, p.y) <= r2
    if (inside) {
      flush() // this point vanishes under the eraser
      continue
    }
    if (run.length > 0) {
      // Both this point and the previous kept point are outside the disc, but the
      // segment between them might still cross it — if so, cut here.
      const prev = run[run.length - 1]
      if (pointToSegmentDist2(cx, cy, prev, p) <= r2) flush()
    }
    run.push(p)
  }
  flush()
  return pieces
}

/** True when the disc touches any part of the polyline (cheap hit-test for hover/UI). */
export function strokeIntersectsDisc(points: Point[], cx: number, cy: number, r: number): boolean {
  const r2 = r * r
  if (points.length === 1) return dist2(cx, cy, points[0].x, points[0].y) <= r2
  for (let i = 0; i < points.length - 1; i++) {
    if (pointToSegmentDist2(cx, cy, points[i], points[i + 1]) <= r2) return true
  }
  return false
}

/** Polyline → SVG path data ("M x y L x y …"). One decimal keeps CRDT payloads small. */
export function pointsToPath(points: Point[]): string {
  if (points.length === 0) return ''
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
}

/** Inverse of pointsToPath — tolerant of M/L commands and arbitrary whitespace. */
export function pathToPoints(d: string): Point[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  const points: Point[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] })
  return points
}
