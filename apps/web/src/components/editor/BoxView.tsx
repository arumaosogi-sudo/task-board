// SPEC B — React node view for the Box callout: drag-to-reorder + resize width.
//
// Mirrors ResizableImageView's Yjs-safe contract: the width attribute is committed to
// the CRDT exactly ONCE, on pointerup (never during move — that would flood the Yjs
// transaction log). Reposition is delegated to ProseMirror via `data-drag-handle`: PM
// moves the node by its *position* in the doc (not by attributes), so drag-to-reorder
// stays Yjs-safe and is a document-flow move, not free x/y positioning (SRS scope).
import { useRef, useState } from 'react'
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'

export function BoxView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  // Transient width while dragging the resize handle; null when idle.
  const [dragW, setDragW] = useState<number | null>(null)
  const editable = editor.isEditable

  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = wrapRef.current!.offsetWidth
    const onMove = (ev: PointerEvent) => setDragW(Math.max(120, startW + (ev.clientX - startX)))
    const onUp = (ev: PointerEvent) => {
      const finalW = Math.round(Math.max(120, startW + (ev.clientX - startX)))
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
    <NodeViewWrapper
      ref={wrapRef}
      className="tb-box"
      data-selected={String(selected)}
      style={{ width: w ? `${w}px` : undefined, position: 'relative' }}
    >
      {editable && selected && (
        // Drag handle (top-left). `data-drag-handle` makes PM start a node drag from here;
        // contentEditable=false keeps the caret out of the handle.
        <span
          className="tb-box-drag"
          contentEditable={false}
          data-drag-handle
          draggable
          role="button"
          aria-label="ลากเพื่อย้ายกล่อง"
          title="ลากเพื่อย้ายกล่อง"
        >
          ⠿
        </span>
      )}
      <NodeViewContent />
      {editable && selected && (
        <span
          className="tb-box-resize"
          contentEditable={false}
          onPointerDown={startResize}
          role="presentation"
        />
      )}
    </NodeViewWrapper>
  )
}
