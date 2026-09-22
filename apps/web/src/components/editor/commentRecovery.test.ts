// recoverCommentMark's decision table. The real function needs a live TipTap editor bound
// to Yjs, so y-prosemirror is mocked: the tests drive the two inputs that actually decide
// the outcome — whether the Collaboration binding exists, and whether the stored
// RelativePosition still resolves to a usable range.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const ySyncState = vi.hoisted(() => ({ current: undefined as unknown }))
const resolved = vi.hoisted(() => ({ from: null as number | null, to: null as number | null }))

vi.mock('y-prosemirror', () => ({
  ySyncPluginKey: { getState: () => ySyncState.current },
  absolutePositionToRelativePosition: () => ({}),
  relativePositionToAbsolutePosition: (_d: unknown, _t: unknown, rel: { end?: boolean }) =>
    (rel.end ? resolved.to : resolved.from),
}))

vi.mock('yjs', () => ({
  createRelativePositionFromJSON: (json: { end?: boolean }) => json,
  relativePositionToJSON: (r: unknown) => r,
}))

const { recoverCommentMark, isAnchorResolverReady } = await import('./commentAnchor')

/** A live Yjs binding, as ySyncPluginKey would report it once connected. */
const BOUND = { type: { doc: { id: 'ydoc' } }, binding: { mapping: new Map() } }

const ANCHOR_FROM = { end: false }
const ANCHOR_TO = { end: true }

type AppliedMark = { from: number; to: number; attrs: Record<string, unknown> }
type Tr = { addMark: (from: number, to: number, mark: { attrs: Record<string, unknown> }) => void }

/**
 * Editor stub. `marks` is the set of commentIds already carrying a highlight in the doc;
 * `applied` records every mark recoverCommentMark writes back.
 */
function makeEditor(markedIds: string[], docSize = 100) {
  const applied: AppliedMark[] = []
  const markType = {
    create: (attrs: Record<string, unknown>) => ({ type: markType, attrs }),
  }
  const editor = {
    schema: { marks: { commentHighlight: markType } },
    state: {
      doc: {
        content: { size: docSize },
        descendants: (fn: (node: unknown, pos: number) => void) => {
          markedIds.forEach((id, i) => {
            fn({ isText: true, nodeSize: 5, marks: [{ type: markType, attrs: { commentId: id } }] }, i * 5)
          })
        },
      },
    },
    chain: () => ({
      command: (fn: (arg: { tr: Tr }) => boolean) => {
        fn({ tr: { addMark: (from, to, mark) => { applied.push({ from, to, attrs: mark.attrs }) } } })
        return { run: () => undefined }
      },
    }),
  }
  return { editor: editor as never, applied }
}

beforeEach(() => {
  ySyncState.current = BOUND
  resolved.from = 10
  resolved.to = 20
})

describe('isAnchorResolverReady', () => {
  it('is false before the Collaboration binding exists', () => {
    ySyncState.current = undefined
    expect(isAnchorResolverReady(makeEditor([]).editor)).toBe(false)
  })

  it('is false while the fragment is not attached to a Y.Doc', () => {
    ySyncState.current = { type: { doc: null }, binding: { mapping: new Map() } }
    expect(isAnchorResolverReady(makeEditor([]).editor)).toBe(false)
  })

  it('is true once bound', () => {
    expect(isAnchorResolverReady(makeEditor([]).editor)).toBe(true)
  })
})

describe('recoverCommentMark', () => {
  it('reports "live" and writes nothing when the highlight is still in the document', () => {
    const { editor, applied } = makeEditor(['c1'])
    expect(recoverCommentMark(editor, 'c1', ANCHOR_FROM, ANCHOR_TO, false)).toBe('live')
    expect(applied).toEqual([])
  })

  it('reports "pending" — not "orphaned" — before the binding is ready', () => {
    ySyncState.current = undefined
    const { editor, applied } = makeEditor([])
    expect(recoverCommentMark(editor, 'c1', ANCHOR_FROM, ANCHOR_TO, false)).toBe('pending')
    expect(applied).toEqual([])
  })

  it('re-applies the highlight when the stored anchor still resolves', () => {
    const { editor, applied } = makeEditor([])
    expect(recoverCommentMark(editor, 'c1', ANCHOR_FROM, ANCHOR_TO, false)).toBe('recovered')
    expect(applied).toEqual([{ from: 10, to: 20, attrs: { commentId: 'c1', resolved: false } }])
  })

  it('keeps a resolved thread dimmed when it recovers', () => {
    const { editor, applied } = makeEditor([])
    expect(recoverCommentMark(editor, 'c1', ANCHOR_FROM, ANCHOR_TO, true)).toBe('recovered')
    expect(applied[0].attrs).toEqual({ commentId: 'c1', resolved: true })
  })

  it('reports "orphaned" when the anchored text collapsed to nothing', () => {
    resolved.from = 20
    resolved.to = 20
    const { editor, applied } = makeEditor([])
    expect(recoverCommentMark(editor, 'c1', ANCHOR_FROM, ANCHOR_TO, false)).toBe('orphaned')
    expect(applied).toEqual([])
  })

  it('reports "orphaned" when a position no longer resolves at all', () => {
    resolved.to = null
    const { editor } = makeEditor([])
    expect(recoverCommentMark(editor, 'c1', ANCHOR_FROM, ANCHOR_TO, false)).toBe('orphaned')
  })

  it('reports "orphaned" when the range now falls outside the document', () => {
    resolved.from = 90
    resolved.to = 130
    const { editor } = makeEditor([], 100)
    expect(recoverCommentMark(editor, 'c1', ANCHOR_FROM, ANCHOR_TO, false)).toBe('orphaned')
  })

  it('reports "orphaned" for a thread that never stored an anchor', () => {
    const { editor } = makeEditor([])
    expect(recoverCommentMark(editor, 'c1', null, null, false)).toBe('orphaned')
  })

  it('leaves other threads’ highlights alone when healing one', () => {
    const { editor, applied } = makeEditor(['other'])
    expect(recoverCommentMark(editor, 'c1', ANCHOR_FROM, ANCHOR_TO, false)).toBe('recovered')
    expect(applied.map((a) => a.attrs.commentId)).toEqual(['c1'])
  })
})
