// Phase 4.4 — "Box" callout as a first-class TipTap/ProseMirror node.
//
// A block container (`content: block+`) rendered as <div class="tb-box">. Being a real
// node means it round-trips cleanly through Yjs collaboration, getHTML(), and the PDF
// export — and its parseHTML rule also rehydrates legacy Phase-3 boxes (which were raw
// <div class="tb-box"> HTML) that StarterKit would otherwise flatten to plain text.
//
// SPEC B — the box is draggable (reorder within document flow) and width-resizable via
// a React node view (BoxView). `width` round-trips through the HTML `style` so it
// survives File.content + PDF export. Reposition is a PM position move (Yjs-safe).
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { BoxView } from './BoxView'

export const Box = Node.create({
  name: 'box',
  group: 'block',
  content: 'block+',
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      width: {
        default: null,
        // Parse `width:<n>px` back out of the inline style on legacy/exported HTML.
        parseHTML: (el) => {
          const m = (el as HTMLElement).style?.width?.match(/^(\d+(?:\.\d+)?)px$/)
          return m ? Math.round(parseFloat(m[1])) : null
        },
        renderHTML: (attrs) => (attrs.width ? { style: `width:${attrs.width}px` } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div.tb-box' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'tb-box' }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(BoxView)
  },
})
