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
import { validBoxBg, validBoxBorder } from './boxColors'

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
      // Sprint 4 — box tint. Persisted as inline style (same contract as `width`) so it
      // round-trips through File.content + PDF export. parseHTML validates against the
      // preset palette (boxColors) — arbitrary/injected colors fall back to null (default).
      // mergeAttributes concatenates each fragment's `style`, so width + bg + border coexist.
      bgColor: {
        default: null,
        parseHTML: (el) => validBoxBg((el as HTMLElement).style?.backgroundColor),
        renderHTML: (attrs) => (attrs.bgColor ? { style: `background-color:${attrs.bgColor}` } : {}),
      },
      borderColor: {
        default: null,
        parseHTML: (el) => validBoxBorder((el as HTMLElement).style?.borderColor),
        renderHTML: (attrs) => (attrs.borderColor ? { style: `border-color:${attrs.borderColor}` } : {}),
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
