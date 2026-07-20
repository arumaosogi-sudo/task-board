// SPEC 3 + Image layout — React node view for ResizableImage.
//
// Two Yjs constraints (critical), both preserved from the original SPEC 3 design:
//  1. Width is committed to the CRDT exactly ONCE, on pointerup. During pointermove we
//     only update local React state (`dragW`) so the image tracks the cursor — calling
//     updateAttributes() on every move would flood the Yjs transaction log and thrash
//     every connected peer.
//  2. The `layout` attr is a single updateAttributes() per click. It's a plain node attr,
//     so Yjs syncs it to peers automatically (no bespoke sync code).
import { useRef, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../lib/icons'
import {
  snapWidth,
  fractionLabel,
  type ImageLayout,
  DEFAULT_IMAGE_LAYOUT,
  isImageLayout,
} from './imageLayout'

// Alignment control model: icon + i18n tooltip key per layout mode. Order matches the
// Google-Docs affordance (inline → block L/C/R → wrap L/R).
const LAYOUT_CONTROLS: { layout: ImageLayout; icon: keyof typeof Icon; tipKey: string }[] = [
  { layout: 'inline', icon: 'image', tipKey: 'editor.imageLayout.inline' },
  { layout: 'block-left', icon: 'alignLeft', tipKey: 'editor.imageLayout.blockLeft' },
  { layout: 'block-center', icon: 'alignCenter', tipKey: 'editor.imageLayout.blockCenter' },
  { layout: 'block-right', icon: 'alignRight', tipKey: 'editor.imageLayout.blockRight' },
  { layout: 'wrap-left', icon: 'wrapLeft', tipKey: 'editor.imageLayout.wrapLeft' },
  { layout: 'wrap-right', icon: 'wrapRight', tipKey: 'editor.imageLayout.wrapRight' },
]

export function ResizableImageView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const { t } = useTranslation()
  const imgRef = useRef<HTMLImageElement>(null)
  // Transient width while dragging; null when idle (falls back to the committed attr).
  const [dragW, setDragW] = useState<number | null>(null)
  // Snap fraction (0..1) while dragging, for the % badge; null = free-resizing.
  const [snapFraction, setSnapFraction] = useState<number | null>(null)
  const editable = editor.isEditable

  const rawLayout = node.attrs.layout as unknown
  const layout: ImageLayout = isImageLayout(rawLayout) ? rawLayout : DEFAULT_IMAGE_LAYOUT

  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = imgRef.current!.offsetWidth
    // Editor content-box width is the reference for percentage snapping (25/33/50/…%).
    const contentW = editor.view.dom.clientWidth
    const onMove = (ev: PointerEvent) => {
      const raw = startW + (ev.clientX - startX)
      const snapped = snapWidth(raw, contentW)
      setDragW(snapped.width)
      setSnapFraction(snapped.fraction)
    }
    const onUp = (ev: PointerEvent) => {
      const raw = startW + (ev.clientX - startX)
      const finalW = snapWidth(raw, contentW).width
      updateAttributes({ width: finalW }) // single Yjs transaction
      setDragW(null)
      setSnapFraction(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function setLayout(next: ImageLayout) {
    updateAttributes({ layout: next }) // single Yjs transaction; syncs to peers
  }

  const w = dragW ?? (node.attrs.width as number | null) ?? undefined
  // Badge shows the snap % when snapped, else the raw px — only while dragging.
  const badge = dragW != null ? (snapFraction != null ? fractionLabel(snapFraction) : `${dragW}px`) : null

  return (
    <NodeViewWrapper
      as="span"
      className="tb-img-wrap"
      data-layout={layout}
      data-selected={String(selected)}
    >
      <img
        ref={imgRef}
        src={node.attrs.src as string}
        alt={(node.attrs.alt as string) ?? ''}
        style={{ width: w ? `${w}px` : undefined, cursor: editable ? 'grab' : 'default' }}
        // `data-drag-handle` tells ProseMirror this element initiates a node drag.
        // PM moves the node by position (never by attribute), so drag-to-reposition
        // is Yjs-safe. Only draggable when editing so viewers can't drag the image.
        data-drag-handle={editable ? '' : undefined}
        draggable={editable}
      />

      {editable && selected && (
        <>
          {/* Floating alignment control — appears on selection, near the image top-left.
              Real <button>s + aria-labels + i18n tooltips (UI_GUIDELINES a11y rule). */}
          <span
            className="tb-img-toolbar"
            role="toolbar"
            aria-label={t('editor.imageLayout.label')}
            contentEditable={false}
          >
            {LAYOUT_CONTROLS.map(({ layout: l, icon, tipKey }) => {
              const IconCmp = Icon[icon]
              const active = l === layout
              return (
                <button
                  key={l}
                  type="button"
                  className="tb-img-toolbar__btn"
                  data-active={String(active)}
                  aria-pressed={active}
                  aria-label={t(tipKey)}
                  title={t(tipKey)}
                  // Keep focus in the editor; act on pointerdown so selection isn't lost.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setLayout(l)}
                >
                  <IconCmp width={15} height={15} />
                </button>
              )
            })}
          </span>

          <span className="tb-img-handle" onPointerDown={startResize} role="presentation" />
          {badge && (
            <span className="tb-img-badge" aria-hidden="true" data-snapped={String(snapFraction != null)}>
              {badge}
            </span>
          )}
        </>
      )}
    </NodeViewWrapper>
  )
}
