// Phase 4.4 — "Box" callout as a first-class TipTap/ProseMirror node.
//
// A block container (`content: block+`) rendered as <div class="tb-box">. Being a real
// node means it round-trips cleanly through Yjs collaboration, getHTML(), and the PDF
// export — and its parseHTML rule also rehydrates legacy Phase-3 boxes (which were raw
// <div class="tb-box"> HTML) that StarterKit would otherwise flatten to plain text.
import { Node, mergeAttributes } from '@tiptap/core'

export const Box = Node.create({
  name: 'box',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div.tb-box' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'tb-box' }), 0]
  },
})
