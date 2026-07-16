// Sprint 4 — `commentHighlight` TipTap mark.
//
// Ties a comment thread to the text range it was created on. The mark lives in the
// ProseMirror document, so it rides the Yjs CRDT (Collaboration extension): the highlight
// syncs to every peer and persists in File.ydoc automatically — no separate anchor store to
// keep in lock-step. The DB row keeps a serialized Yjs RelativePosition + anchorText snapshot
// as the durable record (and the orphan-detection fallback after a revision restore, when a
// setContent wipes these marks — see docs/decisions Open Decision #1, option a).
//
// `excludes: ''` lets two comment marks with different `commentId`s overlap on the same run
// (SRS §6 edge case: nested/overlapping comments allowed). `inclusive: false` keeps the
// highlight from bleeding onto text typed at either boundary.
import { Mark, mergeAttributes } from '@tiptap/core'

export interface CommentHighlightOptions {
  HTMLAttributes: Record<string, unknown>
}

export const CommentHighlight = Mark.create<CommentHighlightOptions>({
  name: 'commentHighlight',
  excludes: '',
  inclusive: false,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      commentId: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) =>
          attrs.commentId ? { 'data-comment-id': attrs.commentId } : {},
      },
      // Resolved threads render dimmer (data-resolved="true") — set when a thread is
      // resolved/reopened so the in-document highlight tracks the panel state.
      resolved: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-resolved') === 'true',
        renderHTML: (attrs) => ({ 'data-resolved': attrs.resolved ? 'true' : 'false' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ class: 'tb-comment' }, this.options.HTMLAttributes, HTMLAttributes),
      0,
    ]
  },
})
