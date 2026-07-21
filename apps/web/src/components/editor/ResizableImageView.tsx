// SPEC 3 — React node view for the inline ResizableImage.
//
// The image is "in line with text" (Word-style, `inline: true`): it sits in the text flow
// like a large character. Alignment (left/center/right) is NOT an image property — it comes
// from the paragraph's own alignment (TextAlign), so there is no floating image toolbar.
// The only image affordances are drag-to-reposition (ProseMirror-owned) and drag-to-resize.
//
// Yjs constraint (critical): width is committed to the CRDT exactly ONCE, on pointerup.
// During pointermove we only update local React state (`dragW`) so the image tracks the
// cursor — calling updateAttributes() on every move would flood the Yjs transaction log
// and thrash every connected peer.
import { useRef, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { snapWidth, fractionLabel } from './imageResize'

export function ResizableImageView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  // Transient width while dragging; null when idle (falls back to the committed attr).
  const [dragW, setDragW] = useState<number | null>(null)
  // Snap fraction (0..1) while dragging, for the % badge; null = free-resizing.
  const [snapFraction, setSnapFraction] = useState<number | null>(null)
  const editable = editor.isEditable

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

  const w = dragW ?? (node.attrs.width as number | null) ?? undefined
  // Badge shows the snap % when snapped, else the raw px — only while dragging.
  const badge = dragW != null ? (snapFraction != null ? fractionLabel(snapFraction) : `${dragW}px`) : null

  return (
    <NodeViewWrapper as="span" className="tb-img-wrap" data-selected={String(selected)}>
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
