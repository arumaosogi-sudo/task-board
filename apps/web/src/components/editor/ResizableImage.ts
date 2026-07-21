// SPEC 3 — Image node with a drag-to-resize handle.
// Extends the stock Image extension with a `width` attribute (serialized to the HTML
// `width` attribute so it round-trips through File.content + PDF export) and swaps in a
// React node view that renders the resize handle. The actual resize commit is Yjs-safe:
// see ResizableImageView (single updateAttributes on pointerup, never during move).
import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ResizableImageView } from './ResizableImageView'

// Configured `inline: true` in CollabEditor → the image is an inline node ("in line with
// text", Word-style): the cursor sits before/after it and text/spaces flow around it.
// There is no image `layout` attr anymore — left/center/right come from the paragraph's
// own alignment (TextAlign). Old documents may still carry a `data-layout` attribute on
// the stored <img>; parseHTML simply ignores it and the image opens as a plain inline
// image (backward compatible — see ResizableImage.test.ts).
export const ResizableImage = Image.extend({
  // Drag-to-reposition: let ProseMirror own the drag. With `draggable: true` on the node
  // spec + a `data-drag-handle` element in the node view, PM moves the node by rewriting
  // its *position* in the doc — it never touches node attributes, so this stays Yjs-safe
  // (no mid-drag width churn).
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute('width'),
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})
