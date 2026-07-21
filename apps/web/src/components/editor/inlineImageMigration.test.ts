// Data-safety tests for the inline-image migration.
//
// Two things are proven here, and it matters which is which:
//
//  1. THE REAL BUG (silent data loss) lives in the *wiring order*, not in this module.
//     The live editor binds the ydoc through y-prosemirror's ySyncPlugin. If content
//     carrying an old-model image nested in a block container (box / cell / list-item /
//     blockquote) lands while the ySyncPlugin is already bound, `createNodeFromYElement`'s
//     error-recovery deletes the WHOLE container from the CRDT — a deletion that syncs to
//     the server and every peer. It is NOT a `doc.check()` crash; the content just
//     vanishes. The first `describe` block reproduces that exact path with a real
//     ySyncPlugin + EditorView, and proves the fix is REPAIR-BEFORE-BIND: run
//     `migrateInlineImages` over the raw CRDT while nothing is bound, THEN bind. The
//     component that actually enforces this ordering is CollabEditor.tsx (it defers the
//     editor mount to the provider's first `synced`, running the migration first).
//
//  2. THE ALGORITHM (`migrateInlineImages`) is a pure CRDT transform, verified on its own
//     in the second block: every stray inline image, at any nesting, is wrapped in a
//     paragraph, nothing is dropped, and the repaired fragment maps to a schema-valid
//     ProseMirror doc. `yXmlFragmentToProseMirrorRootNode` is used here only as a
//     schema-validity oracle on the REPAIRED content — NOT as a claim to reproduce the
//     live loss (which, per (1), happens through ySyncPlugin's delete-on-recovery, not a
//     bind-time throw).
import { describe, it, expect, afterEach } from 'vitest'
import * as Y from 'yjs'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { EditorState } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { ySyncPlugin, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { ResizableImage } from './ResizableImage'
import { Box } from './Box'
import { migrateInlineImages } from './inlineImageMigration'

// The exact content model the live editor binds to: inline image + the block containers an
// old-model image could have been stored inside (box, list-item/blockquote via StarterKit,
// table cell via the Table stack). Node views are irrelevant to the schema's content rules,
// so we take the plain schema — the same one ySyncPlugin's createNodeFromYElement uses.
const schema = getSchema([
  StarterKit,
  ResizableImage.configure({ inline: true }),
  Box,
  Table,
  TableRow,
  TableHeader,
  TableCell,
])
const SRC = 'https://cdn.example.com/x.png'

// Build fragment nodes the way y-prosemirror serializes a PM doc: one Y.XmlElement per PM
// block node, nodeName === the node-type name, PM attrs stored as XML attributes.
function image(attrs: Record<string, string> = { src: SRC }): Y.XmlElement {
  const img = new Y.XmlElement('image')
  for (const [k, v] of Object.entries(attrs)) img.setAttribute(k, v)
  return img
}
function paragraph(...children: (Y.XmlElement | Y.XmlText)[]): Y.XmlElement {
  const p = new Y.XmlElement('paragraph')
  if (children.length) p.insert(0, children)
  return p
}
function el(name: string, ...children: (Y.XmlElement | Y.XmlText)[]): Y.XmlElement {
  const e = new Y.XmlElement(name)
  if (children.length) e.insert(0, children)
  return e
}
/** Seed a fresh ydoc's `default` fragment with the given top-level nodes. */
function ydocWith(...nodes: Y.XmlElement[]): Y.Doc {
  const ydoc = new Y.Doc()
  ydoc.getXmlFragment('default').insert(0, nodes)
  return ydoc
}
/** An update carrying the given top-level nodes, as a remote peer / SyncStep2 delivers it. */
function remoteUpdate(...nodes: Y.XmlElement[]): Uint8Array {
  return Y.encodeStateAsUpdate(ydocWith(...nodes))
}
/** Validity oracle for REPAIRED content: does the fragment map to a schema-valid PM doc? */
function bindsValid(ydoc: Y.Doc): boolean {
  const doc = yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment('default'), schema)
  try {
    doc.check()
    return true
  } catch {
    return false
  }
}
function imageNodes(doc: PMNode): PMNode[] {
  const out: PMNode[] = []
  doc.descendants((n) => { if (n.type.name === 'image') out.push(n) })
  return out
}
/** Every image sits inside a textblock (paragraph/heading) ⇒ valid, editable inline content. */
function everyImageInTextblock(doc: PMNode): boolean {
  let ok = true
  doc.descendants((n, _pos, parent) => {
    if (n.type.name === 'image') ok = ok && !!parent && parent.isTextblock
  })
  return ok
}
function topLevelCount(ydoc: Y.Doc, nodeName: string): number {
  const frag = ydoc.getXmlFragment('default')
  let n = 0
  for (let i = 0; i < frag.length; i++) {
    const c = frag.get(i)
    if (c instanceof Y.XmlElement && c.nodeName === nodeName) n++
  }
  return n
}

// ── (1) The real ySyncPlugin bind path: prove the loss, and prove repair-before-bind ──────
//
// A real EditorView with the ySyncPlugin bound to `ydoc.getXmlFragment('default')` — the
// same binding CollabEditor's Collaboration extension sets up under the hood.
const views: EditorView[] = []
afterEach(() => { while (views.length) views.pop()!.destroy() })

function bindView(ydoc: Y.Doc): EditorView {
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const state = EditorState.create({ schema, plugins: [ySyncPlugin(ydoc.getXmlFragment('default'))] })
  const view = new EditorView(mount, { state })
  views.push(view)
  return view
}

describe('inlineImageMigration — the loss is in the bind ORDER (real ySyncPlugin path)', () => {
  it('reproduces the bug: binding first, then receiving an old box→image, SILENTLY deletes the box', () => {
    const ydoc = new Y.Doc()
    bindView(ydoc) // ySyncPlugin bound to an empty fragment (mirrors CollabEditor mounting first)

    // The server's content (a box holding a stray inline image) lands as a remote update.
    const box = el('box', paragraph(new Y.XmlText('caption')), image())
    Y.applyUpdate(ydoc, remoteUpdate(box))

    // createNodeFromYElement's error-recovery ran el._item.delete() on the whole box:
    // the container + image are gone from the CRDT (which would sync to every peer).
    expect(topLevelCount(ydoc, 'box')).toBe(0)
    expect(imageNodes(yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment('default'), schema))).toHaveLength(0)
  })

  it('the fix: migrate BEFORE bind → the box + image survive and the bound doc is valid', () => {
    const ydoc = new Y.Doc()

    // Content lands while NOTHING is bound (CollabEditor holds the editor back until synced).
    const box = el('box', paragraph(new Y.XmlText('caption')), image({ src: SRC, width: '320' }))
    Y.applyUpdate(ydoc, remoteUpdate(box))

    // Repair over the raw CRDT, then bind — the order CollabEditor now enforces.
    expect(migrateInlineImages(ydoc)).toBe(1)
    const view = bindView(ydoc)

    expect(topLevelCount(ydoc, 'box')).toBe(1)       // container preserved (no silent delete)
    expect(() => view.state.doc.check()).not.toThrow() // live doc is schema-valid
    const imgs = imageNodes(view.state.doc)
    expect(imgs).toHaveLength(1)                      // image preserved
    expect(imgs[0].attrs.src).toBe(SRC)              // src survived the wrap
    expect(String(imgs[0].attrs.width)).toBe('320')  // width survived the wrap
    expect(everyImageInTextblock(view.state.doc)).toBe(true) // now legal inline content
  })
})

// ── (2) The pure-CRDT algorithm: correct at every nesting the old model allowed ───────────
describe('migrateInlineImages — wraps every stray inline image, losslessly, at any nesting', () => {
  it('wraps a top-level image (the fragment root is never a textblock)', () => {
    const ydoc = ydocWith(paragraph(new Y.XmlText('report')), image({ src: SRC, width: '320' }))
    expect(migrateInlineImages(ydoc)).toBe(1)
    expect(bindsValid(ydoc)).toBe(true)

    const doc = yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment('default'), schema)
    expect(everyImageInTextblock(doc)).toBe(true)
    const imgs = imageNodes(doc)
    expect(imgs).toHaveLength(1)
    expect(imgs[0].attrs.src).toBe(SRC)
    expect(String(imgs[0].attrs.width)).toBe('320')
  })

  // box / list-item / table-cell / blockquote: an image stored directly inside each of the
  // block containers the old block-image model allowed. Each must be repaired losslessly.
  const containers: { label: string; build: () => Y.XmlElement }[] = [
    { label: 'box', build: () => el('box', paragraph(new Y.XmlText('caption')), image()) },
    { label: 'list item', build: () => el('bulletList', el('listItem', image())) },
    { label: 'table cell', build: () => el('table', el('tableRow', el('tableCell', image()))) },
    { label: 'blockquote', build: () => el('blockquote', image()) },
  ]
  for (const { label, build } of containers) {
    it(`wraps an image stored directly inside a ${label}`, () => {
      const ydoc = ydocWith(build())
      expect(migrateInlineImages(ydoc)).toBe(1)
      expect(bindsValid(ydoc)).toBe(true)

      const doc = yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment('default'), schema)
      expect(everyImageInTextblock(doc)).toBe(true) // relocated into a paragraph
      expect(imageNodes(doc)).toHaveLength(1)        // never dropped
    })
  }

  it('is a no-op on an already-valid document (image already inside a paragraph)', () => {
    const ydoc = ydocWith(paragraph(new Y.XmlText('a'), image(), new Y.XmlText('b')))
    expect(migrateInlineImages(ydoc)).toBe(0)        // nothing to fix
    expect(bindsValid(ydoc)).toBe(true)
    expect(imageNodes(yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment('default'), schema))).toHaveLength(1)
  })

  it('is idempotent — a second run finds nothing to repair', () => {
    const ydoc = ydocWith(image({ src: SRC }))
    expect(migrateInlineImages(ydoc)).toBe(1)
    expect(migrateInlineImages(ydoc)).toBe(0)
    expect(bindsValid(ydoc)).toBe(true)
  })
})
