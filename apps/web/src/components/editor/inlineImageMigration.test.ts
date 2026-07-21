// Data-safety tests for the inline-image migration.
//
// These deliberately do NOT use generateJSON / setContent (the HTML-parse path). A real
// stored document is NOT re-parsed from HTML on open — CollabEditor binds straight from
// the Yjs `ydoc`, and only HTML-seeds `File.content` when the fragment is EMPTY. So the
// backward-compat case that actually breaks is a ydoc authored under the OLD block-image
// model (an `image` element sitting outside any textblock), bound through y-prosemirror.
// We reproduce that exact path here: build the fragment element-by-element the way
// y-prosemirror serializes a doc, then bind it with `yXmlFragmentToProseMirrorRootNode`
// against the app's real (inline-image) schema — the same call the live ySyncPlugin makes.
import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import type { Node as PMNode } from '@tiptap/pm/model'
import { ResizableImage } from './ResizableImage'
import { Box } from './Box'
import { migrateInlineImages } from './inlineImageMigration'

// The exact schema the live editor binds to — mirror CollabEditor's inline config, plus a
// block container (Box) so the "image nested in a non-textblock" case is representable.
const schema = getSchema([StarterKit, ResizableImage.configure({ inline: true }), Box])
const SRC = 'https://cdn.example.com/x.png'

// Build fragment nodes the way y-prosemirror does: one Y.XmlElement per PM block node,
// nodeName === the node type name, PM attrs stored as XML attributes.
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
/** Seed a fresh ydoc's `default` fragment with the given top-level nodes. */
function ydocWith(...nodes: Y.XmlElement[]): Y.Doc {
  const ydoc = new Y.Doc()
  ydoc.getXmlFragment('default').insert(0, nodes)
  return ydoc
}
/** Bind through the SAME path the app's ySyncPlugin uses (create(), not createChecked()). */
function bind(ydoc: Y.Doc): PMNode {
  return yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment('default'), schema)
}
function imageNodes(doc: PMNode): PMNode[] {
  const out: PMNode[] = []
  doc.descendants((n) => { if (n.type.name === 'image') out.push(n) })
  return out
}
/** An image is a DIRECT child of the doc root — the illegal old-block-layout position. */
function hasTopLevelImage(doc: PMNode): boolean {
  let bad = false
  doc.forEach((child) => { if (child.type.name === 'image') bad = true })
  return bad
}
/** Every image sits inside a textblock (paragraph/heading) ⇒ valid, editable inline content. */
function everyImageInTextblock(doc: PMNode): boolean {
  let ok = true
  doc.descendants((n, _pos, parent) => {
    if (n.type.name === 'image') ok = ok && !!parent && parent.isTextblock
  })
  return ok
}

describe('inlineImageMigration — pre-inline-image ydocs bind safely', () => {
  it('reproduces the bug: an old top-level block image binds to a schema-INVALID doc', () => {
    // How an OLD block-model editor wrote it: image as a direct child of the fragment root.
    const ydoc = ydocWith(paragraph(new Y.XmlText('report')), image({ src: SRC, width: '320' }))
    const doc = bind(ydoc)
    // y-prosemirror uses create() (not createChecked()), so binding does NOT throw…
    expect(hasTopLevelImage(doc)).toBe(true)
    // …but the produced doc is schema-invalid — this is what crashes on the next edit.
    expect(() => doc.check()).toThrow()
  })

  it('repairs a top-level block image → bound doc is valid, image intact and inline', () => {
    const ydoc = ydocWith(paragraph(new Y.XmlText('report')), image({ src: SRC, width: '320' }))
    expect(migrateInlineImages(ydoc)).toBe(1)

    const doc = bind(ydoc)
    expect(() => doc.check()).not.toThrow()      // now schema-valid
    expect(hasTopLevelImage(doc)).toBe(false)    // no longer a direct doc child
    expect(everyImageInTextblock(doc)).toBe(true) // wrapped in a paragraph ⇒ editable inline

    const imgs = imageNodes(doc)
    expect(imgs).toHaveLength(1)                  // still present (not dropped)
    expect(imgs[0].attrs.src).toBe(SRC)           // src preserved through the wrap
    expect(String(imgs[0].attrs.width)).toBe('320') // width preserved
  })

  it('repairs a block image stored directly inside a container (box)', () => {
    const box = new Y.XmlElement('box')
    box.insert(0, [paragraph(new Y.XmlText('caption')), image()]) // stray image inside the box
    const ydoc = ydocWith(box)

    expect(() => bind(ydoc).check()).toThrow()    // invalid before
    expect(migrateInlineImages(ydoc)).toBe(1)

    const doc = bind(ydoc)
    expect(() => doc.check()).not.toThrow()
    expect(everyImageInTextblock(doc)).toBe(true)
    expect(imageNodes(doc)).toHaveLength(1)
  })

  it('is a no-op on an already-valid document (image already inside a paragraph)', () => {
    const ydoc = ydocWith(paragraph(new Y.XmlText('a'), image(), new Y.XmlText('b')))
    expect(migrateInlineImages(ydoc)).toBe(0)     // nothing to fix
    expect(() => bind(ydoc).check()).not.toThrow()
    expect(imageNodes(bind(ydoc))).toHaveLength(1)
  })

  it('is idempotent — a second run finds nothing to repair', () => {
    const ydoc = ydocWith(image({ src: SRC }))
    expect(migrateInlineImages(ydoc)).toBe(1)
    expect(migrateInlineImages(ydoc)).toBe(0)
    expect(() => bind(ydoc).check()).not.toThrow()
  })
})
