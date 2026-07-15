// Inline drawing layer (ADR 0005) — a GoodNotes-style ink surface that sits *over* the
// A4 page (`tb-page`) instead of a modal. Strokes live in a `Y.Array` in the same Y.Doc
// as the text, so they sync to peers and persist to `File.ydoc` with no backend change.
//
// Coordinate space = the page's own CSS pixels. The <svg> fills `tb-page` (absolute
// inset-0, 100%×100%, no viewBox) so one SVG user-unit == one page pixel; pointer offset
// maps 1:1 with no scaling math. `tb-page` has a fixed width but grows in height with
// content, so a fixed A4 viewBox would distort — page-pixel coords avoid that.
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { cn } from '../../lib/cn'
import type { Point } from './drawingGeometry'
import {
  DRAW_ORIGIN, PAGE_W, eraserRadius, strokesToSvg, uid, flatToPoints, pointsToFlat,
  eraseStroke, strokeIntersectsDisc, pointsToPath,
  type DrawTool, type StoredStroke,
} from './drawingModel'

interface DrawingOverlayProps {
  ydoc: Y.Doc
  /** Draw mode active AND the user can edit → capture pointer input. */
  active: boolean
  readOnly?: boolean
  orientation?: 'portrait' | 'landscape'
  tool: DrawTool
  color: string
  size: number
  /** Emits the serialized <svg> whenever strokes change — WorkPage injects it into the PDF. */
  onStrokesChange?: (svg: string) => void
}

export function DrawingOverlay({
  ydoc, active, readOnly, orientation = 'portrait', tool, color, size, onStrokesChange,
}: DrawingOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const yArrayRef = useRef<Y.Array<Y.Map<unknown>>>(ydoc.getArray('drawings'))
  const [strokes, setStrokes] = useState<StoredStroke[]>([])
  const [current, setCurrent] = useState<StoredStroke | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const drawing = useRef(false)
  const erasing = useRef(false)

  // Mirror the Y.Array → React state. observeDeep also catches a peer erasing (which
  // rewrites Y.Maps in place), not just add/remove.
  useEffect(() => {
    const arr = yArrayRef.current
    const read = () => {
      const list = arr.toArray().map((m) => ({
        id: (m.get('id') as string) ?? uid(),
        tool: (m.get('tool') as 'pen' | 'highlighter') ?? 'pen',
        color: (m.get('color') as string) ?? '#1d2333',
        width: (m.get('width') as number) ?? 2,
        opacity: (m.get('opacity') as number) ?? 1,
        points: (m.get('points') as number[]) ?? [],
      }))
      setStrokes(list)
      onStrokesChange?.(strokesToSvg(list, PAGE_W[orientation]))
    }
    read()
    arr.observeDeep(read)
    return () => arr.unobserveDeep(read)
  }, [ydoc, orientation, onStrokesChange])

  const pointFromEvent = useCallback((e: React.PointerEvent): Point => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const commitStroke = useCallback((s: StoredStroke) => {
    ydoc.transact(() => {
      const m = new Y.Map<unknown>()
      m.set('id', s.id)
      m.set('tool', s.tool)
      m.set('color', s.color)
      m.set('width', s.width)
      m.set('opacity', s.opacity)
      m.set('points', s.points)
      yArrayRef.current.push([m])
    }, DRAW_ORIGIN)
  }, [ydoc])

  const eraseAt = useCallback((cx: number, cy: number) => {
    const r = eraserRadius(size)
    const arr = yArrayRef.current
    ydoc.transact(() => {
      // Walk high→low so delete/insert never invalidates an index we still visit.
      for (let i = arr.length - 1; i >= 0; i--) {
        const m = arr.get(i)
        const pts = flatToPoints((m.get('points') as number[]) ?? [])
        if (!strokeIntersectsDisc(pts, cx, cy, r)) continue
        const pieces = eraseStroke(pts, cx, cy, r)
        arr.delete(i, 1)
        if (pieces.length > 0) {
          const rebuilt = pieces.map((piece) => {
            const nm = new Y.Map<unknown>()
            nm.set('id', uid())
            nm.set('tool', m.get('tool'))
            nm.set('color', m.get('color'))
            nm.set('width', m.get('width'))
            nm.set('opacity', m.get('opacity'))
            nm.set('points', pointsToFlat(piece))
            return nm
          })
          arr.insert(i, rebuilt)
        }
      }
    }, DRAW_ORIGIN)
  }, [ydoc, size])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!active || readOnly) return
    e.preventDefault()
    svgRef.current?.setPointerCapture(e.pointerId)
    const { x, y } = pointFromEvent(e)
    if (tool === 'eraser') {
      erasing.current = true
      eraseAt(x, y)
      return
    }
    drawing.current = true
    // Pen reports real 0..1 pressure; mouse reports 0.5. Highlighter ignores pressure and
    // runs wide + translucent so it reads as a marker rather than ink (same as legacy).
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5
    const width = tool === 'highlighter' ? size * 2.5 : size * (0.6 + pressure)
    setCurrent({
      id: uid(),
      tool,
      color,
      width: +width.toFixed(2),
      opacity: tool === 'highlighter' ? 0.4 : 1,
      points: [Math.round(x * 10) / 10, Math.round(y * 10) / 10],
    })
  }, [active, readOnly, tool, color, size, pointFromEvent, eraseAt])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!active || readOnly) return
    const { x, y } = pointFromEvent(e)
    if (tool === 'eraser') setCursor({ x, y })
    if (erasing.current) { eraseAt(x, y); return }
    if (!drawing.current) return
    setCurrent((c) => (c ? { ...c, points: [...c.points, Math.round(x * 10) / 10, Math.round(y * 10) / 10] } : c))
  }, [active, readOnly, tool, pointFromEvent, eraseAt])

  const onPointerUp = useCallback(() => {
    if (drawing.current && current && current.points.length >= 4) commitStroke(current)
    drawing.current = false
    erasing.current = false
    setCurrent(null)
  }, [current, commitStroke])

  const renderPath = (s: StoredStroke, key: string) => (
    <path
      key={key}
      d={pointsToPath(flatToPoints(s.points))}
      stroke={s.color}
      strokeWidth={s.width}
      strokeOpacity={s.opacity}
      fill="none"
      strokeLinecap={s.tool === 'highlighter' ? 'butt' : 'round'}
      strokeLinejoin="round"
    />
  )

  return (
    <svg
      ref={svgRef}
      className={cn('absolute inset-0 z-10 h-full w-full', active ? '' : 'pointer-events-none')}
      style={{
        pointerEvents: active ? 'auto' : 'none',
        touchAction: active ? 'none' : undefined,
        cursor: active ? (tool === 'eraser' ? 'none' : 'crosshair') : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      aria-hidden={!active}
    >
      {strokes.map((s) => renderPath(s, s.id))}
      {current && renderPath(current, 'current')}
      {active && tool === 'eraser' && cursor && (
        <circle
          cx={cursor.x}
          cy={cursor.y}
          r={eraserRadius(size)}
          fill="rgba(0,0,0,0.04)"
          stroke="#64748b"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}
    </svg>
  )
}
