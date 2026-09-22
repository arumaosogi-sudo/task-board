// Sprint 4 — Comment anchoring helpers.
//
// Two layers live here:
//  1. Yjs RelativePosition <-> absolute ProseMirror position conversion + comment-mark
//     manipulation (needs a live Editor bound to Yjs via the Collaboration extension).
//  2. Pure list logic (filter / count / range validity) — no Editor, no DOM — so it is
//     unit-testable in isolation (see commentAnchor.test.ts).
//
// Why RelativePosition: an absolute offset breaks the instant a peer edits text before the
// anchored range. A Yjs RelativePosition survives concurrent edits (SRS §4 Realtime), which
// is the durable record persisted on the server. Day-to-day the *mark* in the doc is the live
// highlight; the RelativePosition is the creation record + the resolver used when a mark is
// gone (e.g. after a revision restore) to decide "orphaned".
import type { Editor } from '@tiptap/core'
import type { Mark } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from 'y-prosemirror'
import * as Y from 'yjs'

/* ─────────────────────────── pure list logic ─────────────────────────── */

export type CommentFilter = 'all' | 'open' | 'resolved'

/** Minimal shape the pure helpers need — keeps them decoupled from CommentDto. */
type ResolvableThread = { resolved: boolean }

/** Filter root threads by resolution status. */
export function filterComments<T extends ResolvableThread>(threads: T[], filter: CommentFilter): T[] {
  if (filter === 'open') return threads.filter((c) => !c.resolved)
  if (filter === 'resolved') return threads.filter((c) => c.resolved)
  return threads
}

/** Counts for the segmented filter labels + header badge. */
export function countComments<T extends ResolvableThread>(threads: T[]): {
  all: number
  open: number
  resolved: number
} {
  let resolved = 0
  for (const c of threads) if (c.resolved) resolved++
  return { all: threads.length, open: threads.length - resolved, resolved }
}

/**
 * Is [from, to) a usable, non-empty highlight range inside a document of `docSize`?
 * A resolved anchor that collapses (from === to) or falls outside the doc means the
 * highlighted text is gone → the comment is orphaned.
 */
export function isValidRange(from: number, to: number, docSize: number): boolean {
  return (
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    from >= 0 &&
    to <= docSize &&
    from < to
  )
}

/* ──────────────────── Yjs <-> ProseMirror position glue ──────────────────── */

// y-prosemirror ships JSDoc types with no importable name for the ProseMirror<->Yjs mapping,
// so we derive it from the conversion function's own signature.
type ProsemirrorMapping = Parameters<typeof absolutePositionToRelativePosition>[2]

interface YSync {
  type: Y.XmlFragment
  binding: { mapping: ProsemirrorMapping }
  ydoc: Y.Doc
}

/** The Collaboration binding — null until the first sync wires it up (or the fragment
 *  isn't attached to a Y.Doc yet, in which case a position would be meaningless). */
function getYSync(editor: Editor): YSync | null {
  const state = ySyncPluginKey.getState(editor.state) as
    | { type?: Y.XmlFragment; binding?: { mapping: ProsemirrorMapping } }
    | undefined
  if (!state?.type || !state.binding) return null
  const ydoc = state.type.doc
  if (!ydoc) return null
  return { type: state.type, binding: state.binding, ydoc }
}

/**
 * Can stored anchors be resolved yet? False while the Collaboration binding is still
 * being wired up — during which a failed {@link resolveAnchor} means "too early", NOT
 * "orphaned", so callers must wait rather than declare a thread lost.
 */
export function isAnchorResolverReady(editor: Editor): boolean {
  return getYSync(editor) !== null
}

/** Serialized (JSON-safe) Yjs RelativePosition — matches the backend `@IsObject` DTO field. */
export type SerializedRelPos = Record<string, unknown>

export interface Anchor {
  anchorFrom: SerializedRelPos
  anchorTo: SerializedRelPos
  anchorText: string
}

/**
 * Convert an absolute ProseMirror range to a serialized Yjs anchor for persistence.
 * Returns null when the Yjs binding isn't ready or the range is empty.
 */
export function rangeToAnchor(editor: Editor, from: number, to: number): Anchor | null {
  const y = getYSync(editor)
  if (!y || from >= to) return null
  const relFrom = absolutePositionToRelativePosition(from, y.type, y.binding.mapping)
  const relTo = absolutePositionToRelativePosition(to, y.type, y.binding.mapping)
  return {
    anchorFrom: Y.relativePositionToJSON(relFrom) as SerializedRelPos,
    anchorTo: Y.relativePositionToJSON(relTo) as SerializedRelPos,
    // `'\n'` block separator so a multi-block selection keeps readable text in the fallback.
    anchorText: editor.state.doc.textBetween(from, to, '\n', ' ').slice(0, 10_000),
  }
}

/**
 * Resolve a stored anchor back to an absolute range in the current document.
 * Returns null when it no longer resolves to a valid, non-empty range (→ orphaned).
 * Check {@link isAnchorResolverReady} first: before the binding exists this also
 * returns null, which is "ask again later", not "orphaned".
 */
export function resolveAnchor(
  editor: Editor,
  anchorFrom: unknown,
  anchorTo: unknown,
): { from: number; to: number } | null {
  const y = getYSync(editor)
  if (!y || !anchorFrom || !anchorTo) return null
  try {
    const relFrom = Y.createRelativePositionFromJSON(anchorFrom)
    const relTo = Y.createRelativePositionFromJSON(anchorTo)
    const from = relativePositionToAbsolutePosition(y.ydoc, y.type, relFrom, y.binding.mapping)
    const to = relativePositionToAbsolutePosition(y.ydoc, y.type, relTo, y.binding.mapping)
    if (from == null || to == null) return null
    if (!isValidRange(from, to, editor.state.doc.content.size)) return null
    return { from, to }
  } catch {
    return null
  }
}

/* ──────────────────────── comment-mark manipulation ──────────────────────── */

/**
 * Locate the highlight for `commentId`: the union range of every text node carrying it plus a
 * representative mark instance. The range spans first-match..last-match so a highlight split
 * across text nodes (by an overlapping bold/italic/other-comment mark) is handled whole.
 */
function scanCommentMark(
  editor: Editor,
  commentId: string,
): { from: number; to: number; mark: Mark } | null {
  const type = editor.schema.marks.commentHighlight
  if (!type) return null
  let from = -1
  let to = -1
  let mark: Mark | null = null
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    const m = node.marks.find((x) => x.type === type && x.attrs.commentId === commentId)
    if (m) {
      if (from === -1) from = pos
      to = pos + node.nodeSize
      mark = m
    }
  })
  return from === -1 || !mark ? null : { from, to, mark }
}

/** Range carrying `commentHighlight` for this id, or null (used for scroll + anchored test). */
function findCommentMarkRange(
  editor: Editor,
  commentId: string,
): { from: number; to: number } | null {
  const found = scanCommentMark(editor, commentId)
  return found ? { from: found.from, to: found.to } : null
}

/** True when a live highlight for this comment still exists in the document. */
export function hasCommentMark(editor: Editor, commentId: string): boolean {
  return scanCommentMark(editor, commentId) !== null
}

/** Apply the highlight to a range without disturbing the user's caret/selection. */
export function applyCommentMark(
  editor: Editor,
  from: number,
  to: number,
  commentId: string,
  resolved = false,
): void {
  const type = editor.schema.marks.commentHighlight
  if (!type) return
  editor
    .chain()
    .command(({ tr }) => {
      tr.addMark(from, to, type.create({ commentId, resolved }))
      return true
    })
    .run()
}

/**
 * Re-attach a highlight that is missing from the document but whose stored anchor still
 * resolves — the case a revision restore creates, since restoring replaces the document
 * body (and every mark in it) while the comment rows, and their RelativePositions,
 * survive untouched.
 *
 * Returns the thread's live state:
 *   'live'      — the mark was already there, nothing written
 *   'recovered' — resolved from the stored anchor and re-applied
 *   'orphaned'  — the anchored text is genuinely gone
 *   'pending'   — the Yjs binding isn't ready; ask again, don't show "orphaned" yet
 *
 * Writes to the shared document, so only callers with edit rights may invoke it.
 */
export function recoverCommentMark(
  editor: Editor,
  commentId: string,
  anchorFrom: unknown,
  anchorTo: unknown,
  resolved: boolean,
): 'live' | 'recovered' | 'orphaned' | 'pending' {
  if (hasCommentMark(editor, commentId)) return 'live'
  if (!isAnchorResolverReady(editor)) return 'pending'
  const range = resolveAnchor(editor, anchorFrom, anchorTo)
  if (!range) return 'orphaned'
  applyCommentMark(editor, range.from, range.to, commentId, resolved)
  return 'recovered'
}

/**
 * Re-stamp the highlight's `resolved` attr so the in-document dimming tracks the thread.
 * Removes the *exact* old mark instance first (excludes: '' lets same-type marks coexist, so a
 * plain addMark would duplicate) — overlapping other-id highlights are equality-distinct and
 * survive.
 */
export function setCommentMarkResolved(editor: Editor, commentId: string, resolved: boolean): void {
  const found = scanCommentMark(editor, commentId)
  const type = editor.schema.marks.commentHighlight
  if (!found || !type) return
  editor
    .chain()
    .command(({ tr }) => {
      tr.removeMark(found.from, found.to, found.mark)
      tr.addMark(found.from, found.to, type.create({ commentId, resolved }))
      return true
    })
    .run()
}

/** Remove the highlight entirely (thread deleted). Only this id's mark is stripped. */
export function removeCommentMark(editor: Editor, commentId: string): void {
  const found = scanCommentMark(editor, commentId)
  if (!found) return
  editor
    .chain()
    .command(({ tr }) => {
      tr.removeMark(found.from, found.to, found.mark)
      return true
    })
    .run()
}

/** Comment ids whose highlight covers `pos` — drives click-to-open (incl. overlaps).
 *  Takes the EditorState (not the Editor) so a ProseMirror `handleClick` can call it. */
export function commentIdsAt(state: EditorState, pos: number): string[] {
  const type = state.schema.marks.commentHighlight
  if (!type) return []
  const $pos = state.doc.resolve(pos)
  const ids = $pos
    .marks()
    .filter((m) => m.type === type && m.attrs.commentId)
    .map((m) => m.attrs.commentId as string)
  return [...new Set(ids)]
}

/**
 * Scroll the highlight for `commentId` into view and flash it. Returns false when no live
 * highlight exists (orphaned) so callers can skip the jump affordance.
 */
export function scrollToComment(editor: Editor, commentId: string): boolean {
  const range = findCommentMarkRange(editor, commentId)
  if (!range) return false
  editor.chain().setTextSelection(range.from).scrollIntoView().run()
  const root = editor.view.dom as HTMLElement
  const safeId =
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(commentId) : commentId.replace(/"/g, '\\"')
  root.querySelectorAll<HTMLElement>(`[data-comment-id="${safeId}"]`).forEach((el) => {
    el.classList.remove('tb-comment--flash')
    void el.offsetWidth // restart the animation if it's already mid-flash
    el.classList.add('tb-comment--flash')
    window.setTimeout(() => el.classList.remove('tb-comment--flash'), 1200)
  })
  return true
}
