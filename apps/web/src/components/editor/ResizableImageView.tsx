// SPEC 3 — React node view for ResizableImage.
//
// Yjs constraint (critical): the width attribute is committed to the CRDT exactly ONCE,
// on pointerup. During pointermove we only update local React state (`dragW`) so the image
// tracks the cursor — calling updateAttributes() on every move would flood the Yjs
// transaction log and thrash every connected peer. See SPEC 3.
import { useRef, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'

export function ResizableImageView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  // Transient width while dragging; null when idle (falls back to the committed attr).
  const [dragW, setDragW] = useState<number | null>(null)
  const editable = editor.isEditable

  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = imgRef.current!.offsetWidth
    const onMove = (ev: PointerEvent) => setDragW(Math.max(48, startW + (ev.clientX - startX)))
    const onUp = (ev: PointerEvent) => {
      const finalW = Math.round(Math.max(48, startW + (ev.clientX - startX)))
      updateAttributes({ width: finalW }) // single Yjs transaction
      setDragW(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const w = dragW ?? (node.attrs.width as number | null) ?? undefined
  return (
    <NodeViewWrapper className="tb-img-wrap" data-selected={String(selected)}>
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
        <span className="tb-img-handle" onPointerDown={startResize} role="presentation" />
      )}
    </NodeViewWrapper>
  )
}
