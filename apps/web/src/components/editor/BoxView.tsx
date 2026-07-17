// SPEC B — React node view for the Box callout: drag-to-reorder + resize width + tint.
//
// Mirrors ResizableImageView's Yjs-safe contract: mutating attributes is committed to the
// CRDT exactly ONCE per interaction (resize on pointerup; a color pick is a single click →
// single updateAttributes). Reposition is delegated to ProseMirror via `data-drag-handle`:
// PM moves the node by its *position* in the doc (not by attributes), so drag-to-reorder
// stays Yjs-safe and is a document-flow move, not free x/y positioning (SRS scope).
//
// SELECTION: a box has editable `content: block+`, so — unlike the atom ResizableImage —
// clicking it only ever yields a TextSelection (a caret inside), never a NodeSelection.
// Its controls are gated on `selected` (= NodeSelection of THIS node), so without an
// explicit hook they were unreachable by a normal click (latent bug from an earlier sprint).
// Fix: (1) clicking the box's own padding (target === the wrapper, not inner text) selects
// the node, and (2) a persistent top-right affordance (always visible while editing) makes
// the controls discoverable instead of hidden behind a selection the user can't produce.
import { useRef, useState } from 'react'
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { Icon } from '../../lib/icons'
import { BOX_COLORS, boxColorIdFromBg } from './boxColors'

export function BoxView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const { t } = useTranslation()
  const wrapRef = useRef<HTMLDivElement>(null)
  // Transient width while dragging the resize handle; null when idle.
  const [dragW, setDragW] = useState<number | null>(null)
  const editable = editor.isEditable

  const bgColor = (node.attrs.bgColor as string | null) ?? null
  const borderColor = (node.attrs.borderColor as string | null) ?? null
  const activeColorId = boxColorIdFromBg(bgColor)

  // Promote the current selection to a NodeSelection of THIS box, so its controls appear.
  function selectSelf() {
    if (typeof getPos !== 'function') return
    const pos = getPos()
    if (typeof pos === 'number') editor.commands.setNodeSelection(pos)
  }

  // Clicking the box's own chrome (padding / left bar) — not the text inside — selects it.
  function onWrapperMouseDown(e: React.MouseEvent) {
    if (e.target === wrapRef.current) {
      e.preventDefault()
      selectSelf()
    }
  }

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
      onMouseDown={editable ? onWrapperMouseDown : undefined}
      // `data-tinted` (not a fragile [style*=] selector) drives the pinned-dark-text rule so
      // a custom pastel stays AA-readable in dark mode. Viewers get the color but no controls.
      data-tinted={bgColor ? 'true' : undefined}
      style={{
        width: w ? `${w}px` : undefined,
        position: 'relative',
        backgroundColor: bgColor ?? undefined,
        borderColor: borderColor ?? undefined,
      }}
    >
      {editable && !selected && (
        // Persistent, discoverable affordance: a normal click can't NodeSelect a content box,
        // so surface an explicit "select to customize" control that's always visible while
        // editing. Clicking it promotes to a NodeSelection → the full toolbar below appears.
        <button
          type="button"
          className="tb-box-tune"
          contentEditable={false}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); selectSelf() }}
          aria-label={t('editor.boxCustomize')}
          title={t('editor.boxCustomize')}
        >
          <Icon.sliders width={13} height={13} />
        </button>
      )}

      {editable && selected && (
        // Drag handle (top-left). `data-drag-handle` makes PM start a node drag from here;
        // contentEditable=false keeps the caret out of the handle.
        <span
          className="tb-box-drag"
          contentEditable={false}
          data-drag-handle
          draggable
          role="button"
          aria-label={t('editor.boxDrag')}
          title={t('editor.boxDrag')}
        >
          ⠿
        </span>
      )}

      {editable && selected && (
        // Color presets — appear once the box is selected (alongside the drag/resize handles).
        // Editor-only: viewers never mount this, so they see the color but can't change it.
        <div className="tb-box-colors" contentEditable={false} role="group" aria-label={t('editor.boxColor')}>
          {BOX_COLORS.map((c) => {
            const active = c.id === activeColorId
            return (
              <button
                key={c.id}
                type="button"
                // Keep the ProseMirror node selection (don't blur/reselect on mousedown).
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ bgColor: c.bg, borderColor: c.border })}
                aria-label={t(c.labelKey)}
                aria-pressed={active}
                title={t(c.labelKey)}
                className={cn('tb-box-swatch', active && 'tb-box-swatch-active')}
                data-default={c.id === 'default' ? 'true' : undefined}
                style={{ background: c.bg ?? undefined }}
              />
            )
          })}
        </div>
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
