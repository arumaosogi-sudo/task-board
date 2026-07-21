// Schema tests for the inline ResizableImage node (Word-style "in line with text").
//
// The image is configured `inline: true`, so it lives INSIDE a block (paragraph) rather
// than as a top-level block node. Two things must hold:
//  1. The `width` attr survives serialization (getHTML emits width=, parseHTML reads it) —
//     that's what carries the resized size through the File.content mirror, Yjs collab,
//     and the Word/PDF export pipelines.
//  2. Documents saved by the OLD block-layout model — bare <img> or <img data-layout=…> —
//     still open cleanly as inline images (the obsolete data-layout attr is ignored, not
//     an error). This is the backward-compat guarantee.
// We exercise the extension's *schema* directly with generateHTML/generateJSON (no React
// node view, no WebSocket) so the assertions are on renderHTML ⇄ parseHTML alone.
import { describe, it, expect } from 'vitest'
import { generateHTML, generateJSON, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ResizableImage } from './ResizableImage'

// Mirror the production config (CollabEditor): the image is an inline node.
const extensions = [StarterKit, ResizableImage.configure({ inline: true })]
// Use a normal http(s) src — this mirrors production, where images are uploaded to storage
// and inserted as `<img src="https://…">` (see CollabEditor startUpload), never data URLs.
// Do NOT switch this to a `data:` URL: ProseMirror-model's schema parse drops data-URL
// images under jsdom (a test-environment quirk that hits even the stock @tiptap Image
// extension), which would fail these round-trips for reasons unrelated to the width attr.
const SRC = 'https://cdn.example.com/x.png'

// Inline images can't be a direct child of `doc`; they live inside a block. Wrap in a
// paragraph so the JSON is schema-valid.
const imageDoc = (attrs: Record<string, unknown>): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: SRC, ...attrs } }] }],
})

/** Recursively find the first image node's attrs, per the extension's parseHTML. */
function findImageAttrs(node: JSONContent): Record<string, unknown> | null {
  if (node.type === 'image') return node.attrs ?? {}
  for (const child of node.content ?? []) {
    const found = findImageAttrs(child)
    if (found) return found
  }
  return null
}

function parseImageAttrs(html: string): Record<string, unknown> {
  const json = generateJSON(html, extensions) as JSONContent
  const attrs = findImageAttrs(json)
  if (!attrs) throw new Error('no image node parsed')
  return attrs
}

describe('ResizableImage — inline node + width attribute', () => {
  it('serializes the width attr to the HTML width attribute', () => {
    const html = generateHTML(imageDoc({ width: 320 }), extensions)
    expect(html).toContain('width="320"')
  })

  it('parses the width attr back and round-trips through HTML→JSON→HTML', () => {
    const html1 = generateHTML(imageDoc({ width: 240 }), extensions)
    const attrs = parseImageAttrs(html1)
    expect(String(attrs.width)).toBe('240')
    const html2 = generateHTML(imageDoc(attrs), extensions)
    expect(html2).toContain('width="240"')
  })

  it('renders the image inline, inside its paragraph (no top-level <img> block)', () => {
    const html = generateHTML(imageDoc({ width: 200 }), extensions)
    // The <img> sits within the <p> — proof it is an inline node.
    expect(html).toMatch(/<p>[^]*<img[^>]*>[^]*<\/p>/)
  })

  it('emits no data-layout attribute (the layout model is gone)', () => {
    const html = generateHTML(imageDoc({ width: 200 }), extensions)
    expect(html).not.toContain('data-layout')
  })

  describe('backward compatibility with old block-layout documents', () => {
    it('opens a bare stored <img> as an inline image', () => {
      const attrs = parseImageAttrs('<p><img src="x.png"></p>')
      expect(attrs.src).toBe('x.png')
    })

    it('opens an old <img data-layout=…> without error, ignoring the obsolete attr', () => {
      // Documents saved by the previous block model carried data-layout on the <img>.
      const attrs = parseImageAttrs('<p><img src="x.png" data-layout="block-center" width="320"></p>')
      expect(attrs.src).toBe('x.png')
      expect(String(attrs.width)).toBe('320')
      // The obsolete positioning attr is not carried onto the node.
      expect(attrs.layout).toBeUndefined()
    })

    it('opens an old wrap-mode <img data-layout="wrap-left"> as a plain inline image', () => {
      const attrs = parseImageAttrs('<p><img src="x.png" data-layout="wrap-left"></p>')
      expect(attrs.src).toBe('x.png')
      expect(attrs.layout).toBeUndefined()
    })
  })
})
