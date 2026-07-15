// SPEC 5 — GoodNotes-like drawing surface, dependency-free.
// Captures pointer strokes (pen pressure → width) and serializes to an inline <svg>
// string embedded into the document (renders in-app + in the PDF export).
//
// Tooling: pen / highlighter (wide, translucent, butt caps) / eraser (stroke-level hit
// test). Undo/redo/eraser all operate on a full-snapshot history so any edit is reversible
// without tracking per-op deltas — cheap here because a drawing is a bounded set of paths.
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Modal } from './ui'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'

const W = 720
const H = 460
// 12 presets + a free color picker.
const COLORS = [
  '#1d2333', '#e5484d', '#0ea5e9', '#16a34a', '#f59e0b', '#7c5cff',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b', '#ffffff',
]
const SIZES = [1, 2, 3, 5, 8, 12, 20]

type Tool = 'pen' | 'highlighter' | 'eraser'

interface Stroke {
  tool: 'pen' | 'highlighter'
  color: string
  width: number
  opacity: number
  d: string // SVG path data
}

const TOOLS: { key: Tool; title: string; icon: keyof typeof Icon }[] = [
  { key: 'pen', title: 'ปากกา', icon: 'pencil' },
  { key: 'highlighter', title: 'ปากกาเน้นข้อความ', icon: 'highlighter' },
  { key: 'eraser', title: 'ยางลบ', icon: 'eraser' },
]

export function DrawingCanvas({
  open, onClose, onInsert,
}: {
  open: boolean
  onClose: () => void
  onInsert: (svg: string) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  // Full-snapshot undo/redo history. `strokes` is always the snapshot at `ptr`.
  const [history, setHistory] = useState<Stroke[][]>([[]])
  const [ptr, setPtr] = useState(0)
  const strokes = history[ptr]

  const [current, setCurrent] = useState<Stroke | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(SIZES[2])
  const drawing = useRef(false)

  // Push a new snapshot, discarding any redo tail. Every mutation (draw / erase / clear)
  // routes through here so undo/redo stay consistent.
  function commit(next: Stroke[]) {
    const h = history.slice(0, ptr + 1)
    setHistory([...h, next])
    setPtr(h.length)
  }
  function undo() { setPtr((p) => Math.max(0, p - 1)) }
  function redo() { setPtr((p) => Math.min(history.length - 1, p + 1)) }
  function clear() { commit([]) }
  // Full reset (on cancel/close): collapse history so reopening starts blank.
  function resetAll() { setHistory([[]]); setPtr(0); setCurrent(null); drawing.current = false }

  function pointFromEvent(e: React.PointerEvent): { x: number; y: number } {
    // Guard against a pointer event firing before the SVG mounts (edge case on touch
    // devices) — a non-null assertion here would crash unhandled. Origin is a safe no-op.
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    // Map screen → viewBox coordinates (the SVG scales responsively).
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    }
  }

  // Eraser: find the topmost stroke whose polyline passes within `threshold` of (x,y).
  function findStrokeNear(list: Stroke[], x: number, y: number, threshold: number): number {
    for (let i = list.length - 1; i >= 0; i--) {
      const pts = list[i].d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      for (let p = 0; p < pts.length - 1; p += 2) {
        if (Math.hypot(pts[p] - x, pts[p + 1] - y) <= threshold + list[i].width / 2) return i
      }
    }
    return -1
  }

  function eraseAt(x: number, y: number) {
    const hit = findStrokeNear(strokes, x, y, 8)
    if (hit < 0) return
    commit(strokes.filter((_, i) => i !== hit))
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    svgRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    const { x, y } = pointFromEvent(e)

    if (tool === 'eraser') {
      eraseAt(x, y)
      return
    }
    // Pen reports real 0..1 pressure; mouse reports 0.5. Highlighter ignores pressure and
    // runs wide + translucent so it reads as a marker rather than ink.
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5
    const baseWidth = tool === 'highlighter' ? size * 2.5 : size * (0.6 + pressure)
    setCurrent({
      tool,
      color,
      width: +baseWidth.toFixed(2),
      opacity: tool === 'highlighter' ? 0.4 : 1,
      d: `M ${x.toFixed(1)} ${y.toFixed(1)}`,
    })
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current) return
    const { x, y } = pointFromEvent(e)
    if (tool === 'eraser') { eraseAt(x, y); return }
    if (!current) return
    setCurrent({ ...current, d: `${current.d} L ${x.toFixed(1)} ${y.toFixed(1)}` })
  }

  function onPointerUp() {
    if (current && current.d.includes('L')) commit([...strokes, current])
    setCurrent(null)
    drawing.current = false
  }

  function buildSvg(): string {
    const paths = strokes
      .map((s) =>
        `<path d="${s.d}" stroke="${s.color}" stroke-width="${s.width}" ` +
        `stroke-opacity="${s.opacity}" fill="none" ` +
        `stroke-linecap="${s.tool === 'highlighter' ? 'butt' : 'round'}" stroke-linejoin="round"/>`,
      )
      .join('')
    return `<svg class="tb-drawing" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" ` +
      `style="width:100%;max-width:${W}px;height:auto;border:1px solid #e5e7eb;border-radius:12px;background:#fff">` +
      `${paths}</svg>`
  }

  function insert() {
    if (strokes.length === 0) { onClose(); return }
    onInsert(buildSvg())
    resetAll()
    onClose()
  }

  const canUndo = ptr > 0
  const canRedo = ptr < history.length - 1

  // Render the modal at document.body via a portal, escaping the CollabEditor / TipTap
  // DOM tree entirely. ProseMirror manages its own editor DOM imperatively; mounting the
  // Modal inside that subtree let React and ProseMirror hold stale sibling pointers,
  // triggering an "insertBefore ... not a child of this node" crash on open. The portal
  // moves the Modal out of that reconciliation path — the standard fix (Google Docs /
  // Notion / Figma use the same pattern for editor overlays).
  return createPortal(
    <Modal
      open={open}
      onClose={() => { resetAll(); onClose() }}
      title="วาดภาพ"
      width="max-w-[780px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => { resetAll(); onClose() }}>ยกเลิก</Button>
          <Button onClick={insert} disabled={strokes.length === 0}>แทรกลงเอกสาร</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Tool selector */}
          <div className="flex items-center gap-1">
            {TOOLS.map((tl) => {
              const IconCmp = Icon[tl.icon]
              const active = tool === tl.key
              return (
                <button key={tl.key} onClick={() => setTool(tl.key)} title={tl.title} aria-label={tl.title}
                  aria-pressed={active}
                  className={cn('grid size-8 place-items-center rounded-lg hover:bg-ink/5',
                    active ? 'bg-primary-soft text-primary' : 'text-muted')}>
                  <IconCmp width={16} height={16} />
                </button>
              )
            })}
          </div>
          <span className="h-5 w-px bg-line" />

          {/* Colors + free picker */}
          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={`สี ${c}`}
                className={cn('size-6 rounded-full ring-offset-2 ring-offset-card',
                  c === '#ffffff' && 'border border-line', color === c && 'ring-2 ring-primary')}
                style={{ background: c }} />
            ))}
            <label className="grid size-6 cursor-pointer place-items-center rounded-full border border-line"
              title="เลือกสีอื่น" style={{ background: color }}>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="size-0 opacity-0" aria-label="เลือกสีเอง" />
            </label>
          </div>
          <span className="h-5 w-px bg-line" />

          {/* Sizes */}
          <div className="flex items-center gap-1">
            {SIZES.map((s) => (
              <button key={s} onClick={() => setSize(s)} title={`ขนาด ${s}`}
                className={cn('grid size-8 place-items-center rounded-lg hover:bg-ink/5', size === s && 'bg-primary-soft')}>
                <span className="rounded-full bg-ink" style={{ width: Math.min(s + 2, 16), height: Math.min(s + 2, 16) }} />
              </button>
            ))}
          </div>

          {/* Undo / redo / clear */}
          <div className="ml-auto flex items-center gap-1">
            <button onClick={undo} disabled={!canUndo} title="ย้อนกลับ"
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5 disabled:opacity-40"><Icon.undo width={16} height={16} /></button>
            <button onClick={redo} disabled={!canRedo} title="ทำซ้ำ"
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5 disabled:opacity-40"><Icon.redo width={16} height={16} /></button>
            <button onClick={clear} disabled={strokes.length === 0} title="ล้างทั้งหมด"
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
            <path key={i} d={s.d} stroke={s.color} strokeWidth={s.width} strokeOpacity={s.opacity} fill="none"
              strokeLinecap={s.tool === 'highlighter' ? 'butt' : 'round'} strokeLinejoin="round" />
          ))}
          {current && (
            <path d={current.d} stroke={current.color} strokeWidth={current.width} strokeOpacity={current.opacity} fill="none"
              strokeLinecap={current.tool === 'highlighter' ? 'butt' : 'round'} strokeLinejoin="round" />
          )}
        </svg>
        <p className="text-[12px] text-muted">ปากกา · ปากกาเน้นข้อความ · ยางลบ — รองรับ stylus (ปรับความหนาตามแรงกด)</p>
      </div>
    </Modal>,
    document.body,
  )
}
