// SPEC 3 — Image node with a drag-to-resize handle.
// Extends the stock Image extension with a `width` attribute (serialized to the HTML
// `width` attribute so it round-trips through File.content + PDF export) and swaps in a
// React node view that renders the resize handle. The actual resize commit is Yjs-safe:
// see ResizableImageView (single updateAttributes on pointerup, never during move).
import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ResizableImageView } from './ResizableImageView'
import { isImageLayout, DEFAULT_IMAGE_LAYOUT } from './imageLayout'

export const ResizableImage = Image.extend({
  // Google Docs-style inline reposition: let ProseMirror own the drag. With
  // `draggable: true` on the node spec + a `data-drag-handle` element in the node
  // view, PM moves the node by rewriting its *position* in the doc — it never
  // touches node attributes, so this stays Yjs-safe (no mid-drag width churn).
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute('width'),
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
      // Google-Docs-style positioning. Serialized to `data-layout` so it round-trips
      // through File.content mirror + getHTML() + Word/PDF export. Absent attr → inline,
      // which keeps every existing document byte-identical (backward compatible). The
      // value rides the node attrs, so Yjs syncs it to every collab peer for free.
      layout: {
        default: DEFAULT_IMAGE_LAYOUT,
        parseHTML: (el) => {
          const v = el.getAttribute('data-layout')
          return isImageLayout(v) ? v : DEFAULT_IMAGE_LAYOUT
        },
        // Only emit the attr for non-default layouts — inline images stay clean HTML.
        renderHTML: (attrs) =>
          attrs.layout && attrs.layout !== DEFAULT_IMAGE_LAYOUT
            ? { 'data-layout': attrs.layout }
            : {},
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})
