// Phase 3 — freehand drawing with stylus pressure support, dependency-free.
// Captures pointer strokes (pen pressure → stroke width) and serializes to an inline
// <svg> string that gets embedded into the document content (renders + exports to PDF).
import { useRef, useState } from 'react'
import { Button, Modal } from './ui'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'

const W = 720
const H = 460
const COLORS = ['#1d2333', '#e5484d', '#0ea5e9', '#16a34a', '#f59e0b', '#7c5cff']
const SIZES = [2, 4, 7]

interface Stroke {
  color: string
  width: number
  d: string // SVG path data
}

export function DrawingCanvas({
  open, onClose, onInsert,
}: {
  open: boolean
  onClose: () => void
  onInsert: (svg: string) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [current, setCurrent] = useState<Stroke | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(SIZES[1])
  const drawing = useRef(false)

  function pointFromEvent(e: React.PointerEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect()
    // Map screen → viewBox coordinates (the SVG scales responsively).
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    svgRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    const { x, y } = pointFromEvent(e)
    // Pen reports real 0..1 pressure; mouse reports 0.5 → scale width accordingly.
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5
    setCurrent({ color, width: +(size * (0.6 + pressure)).toFixed(2), d: `M ${x.toFixed(1)} ${y.toFixed(1)}` })
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current || !current) return
    const { x, y } = pointFromEvent(e)
    setCurrent({ ...current, d: `${current.d} L ${x.toFixed(1)} ${y.toFixed(1)}` })
  }

  function onPointerUp() {
    if (current && current.d.includes('L')) setStrokes((s) => [...s, current])
    setCurrent(null)
    drawing.current = false
  }

  function clear() { setStrokes([]); setCurrent(null) }
  function undo() { setStrokes((s) => s.slice(0, -1)) }

  function buildSvg(): string {
    const paths = strokes
      .map((s) => `<path d="${s.d}" stroke="${s.color}" stroke-width="${s.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
      .join('')
    return `<svg class="tb-drawing" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px;height:auto;border:1px solid #e5e7eb;border-radius:12px;background:#fff">${paths}</svg>`
  }

  function insert() {
    if (strokes.length === 0) { onClose(); return }
    onInsert(buildSvg())
    clear()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={() => { clear(); onClose() }}
      title="วาดภาพ"
      width="max-w-[780px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => { clear(); onClose() }}>ยกเลิก</Button>
          <Button onClick={insert} disabled={strokes.length === 0}>แทรกลงเอกสาร</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={`สี ${c}`}
                className={cn('size-6 rounded-full ring-offset-2 ring-offset-card', color === c && 'ring-2 ring-primary')}
                style={{ background: c }} />
            ))}
          </div>
          <span className="h-5 w-px bg-line" />
          <div className="flex items-center gap-1.5">
            {SIZES.map((s) => (
              <button key={s} onClick={() => setSize(s)}
                className={cn('grid size-8 place-items-center rounded-lg hover:bg-ink/5', size === s && 'bg-primary-soft')}>
                <span className="rounded-full bg-ink" style={{ width: s + 2, height: s + 2 }} />
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={undo} disabled={!strokes.length} title="ย้อนเส้นล่าสุด"
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5 disabled:opacity-40"><Icon.undo width={16} height={16} /></button>
            <button onClick={clear} disabled={!strokes.length} title="ล้างทั้งหมด"
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5 disabled:opacity-40"><Icon.trash width={16} height={16} /></button>
          </div>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none rounded-xl border border-line bg-white"
          style={{ aspectRatio: `${W} / ${H}`, cursor: 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {strokes.map((s, i) => (
            <path key={i} d={s.d} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {current && (
            <path d={current.d} stroke={current.color} strokeWidth={current.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
        <p className="text-[12px] text-muted">รองรับปากกา/stylus (ปรับความหนาตามแรงกด) · เมาส์/นิ้วก็วาดได้</p>
      </div>
    </Modal>
  )
}
