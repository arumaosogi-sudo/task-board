// Round-trip test for the ResizableImage `layout` attribute (Google-Docs positioning).
//
// The whole layout system rests on the attr surviving serialization: getHTML() must emit
// `data-layout`, and parseHTML must read it back — that's what carries the layout through
// the File.content mirror, Yjs collab, and the Word/PDF export pipelines. We exercise the
// extension's *schema* directly with generateHTML/generateJSON (no React node view, no
// WebSocket) so the assertion is on renderHTML ⇄ parseHTML alone.
import { describe, it, expect } from 'vitest'
import { generateHTML, generateJSON, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ResizableImage } from './ResizableImage'

const extensions = [StarterKit, ResizableImage]
// Use a normal http(s) src — this mirrors production, where images are uploaded to storage
// and inserted as `<img src="https://…">` (see CollabEditor startUpload), never data URLs.
// Do NOT switch this to a `data:` URL: ProseMirror-model's schema parse drops data-URL
// images under jsdom (a test-environment quirk that hits even the stock @tiptap Image
// extension), which would fail these round-trips for reasons unrelated to the layout attr.
const SRC = 'https://cdn.example.com/x.png'

const imageDoc = (attrs: Record<string, unknown>): JSONContent => ({
  type: 'doc',
  content: [{ type: 'image', attrs: { src: SRC, ...attrs } }],
})

/** attrs of the first image node in an HTML string, per the extension's parseHTML. */
function parseImageAttrs(html: string): Record<string, unknown> {
  const json = generateJSON(html, extensions) as JSONContent
  const node = json.content?.find((n) => n.type === 'image')
  if (!node) throw new Error('no image node parsed')
  return node.attrs ?? {}
}

describe('ResizableImage — layout attribute round-trip', () => {
  it('serializes a non-default layout to data-layout', () => {
    const html = generateHTML(imageDoc({ layout: 'wrap-right' }), extensions)
    expect(html).toContain('data-layout="wrap-right"')
  })

  it('parses data-layout back into the layout attr', () => {
    expect(parseImageAttrs('<img src="x.png" data-layout="block-center">').layout).toBe('block-center')
    expect(parseImageAttrs('<img src="x.png" data-layout="wrap-left">').layout).toBe('wrap-left')
  })

  it('survives a full HTML→JSON→HTML cycle for every layout mode', () => {
    for (const layout of ['block-left', 'block-center', 'block-right', 'wrap-left', 'wrap-right']) {
      const html1 = generateHTML(imageDoc({ layout }), extensions)
      const attrs = parseImageAttrs(html1)
      expect(attrs.layout).toBe(layout)
      const html2 = generateHTML(imageDoc(attrs), extensions)
      expect(html2).toContain(`data-layout="${layout}"`)
    }
  })

  it('omits data-layout for inline images (backward-compatible clean HTML)', () => {
    const html = generateHTML(imageDoc({ layout: 'inline' }), extensions)
    expect(html).not.toContain('data-layout')
  })

  it('defaults a missing attr to inline (existing docs keep working)', () => {
    expect(parseImageAttrs('<img src="x.png">').layout).toBe('inline')
  })

  it('falls back to inline for an unknown/garbage data-layout value', () => {
    expect(parseImageAttrs('<img src="x.png" data-layout="diagonal">').layout).toBe('inline')
  })

  it('preserves the width attr alongside layout (both round-trip together)', () => {
    const html = generateHTML(imageDoc({ layout: 'block-center', width: 320 }), extensions)
    expect(html).toContain('data-layout="block-center"')
    expect(html).toContain('width="320"')
    const attrs = parseImageAttrs(html)
    expect(attrs.layout).toBe('block-center')
    expect(String(attrs.width)).toBe('320')
  })
})
