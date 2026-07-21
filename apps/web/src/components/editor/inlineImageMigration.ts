// Data-safety migration: repair pre-inline-image documents so they bind to a
// schema-VALID ProseMirror doc.
//
// Background. Images used to be a BLOCK node (ResizableImage, inline:false), so an
// image could be stored in the Yjs `default` XmlFragment as a direct child of the
// fragment root — or directly inside another block container (box, table cell, list
// item, blockquote). The Word-style redesign makes the image node `inline: true`.
// An inline node is only schema-valid inside a textblock (paragraph / heading), so
// every one of those old block positions is now ILLEGAL under the new schema.
//
// Why this is dangerous (not just cosmetic). y-prosemirror binds a ydoc to
// ProseMirror with `NodeType.create()` — NOT `createChecked()` — so it does NOT throw
// on illegal content: it silently yields a schema-invalid live doc. That doc then
// crashes the editor / collab room on the next edit or peer update, where
// `doc.check()` throws `RangeError: Invalid content for node doc`. Every document ever
// edited with an image under the old block model hits this, because CollabEditor binds
// straight from the ydoc and only HTML-seeds `File.content` when the fragment is EMPTY
// (fragment.length === 0) — an old doc already has ydoc content, so it skips seeding
// and goes straight down the invalid-bind path.
//
// Fix. Before the doc can be edited, wrap any inline `image` element that sits in a
// non-textblock position inside a `paragraph`, in a single Yjs transaction, so the
// repair rides the CRDT and syncs to every peer as a normal update (never a silent
// local-only patch that would fight the synced version). Idempotent: a document whose
// images already live inside textblocks is left completely untouched, so it is safe to
// call on every load.
import * as Y from 'yjs'

// The ProseMirror node whose `inline: true` reclassification triggered this migration.
const IMAGE_NODE = 'image'
// Textblocks in this editor's schema (StarterKit) — the ONLY parents in which an inline
// image is schema-valid. Keep in sync if a new textblock node type is ever added to the
// CollabEditor extension set.
const TEXTBLOCK_NODES = new Set(['paragraph', 'heading'])
// A distinct transaction origin so the y-prosemirror UndoManager (which tracks the sync
// plugin's origin, not this) never captures the repair — a user must not be able to
// Ctrl+Z the document back into a schema-invalid state.
export const INLINE_IMAGE_MIGRATION_ORIGIN = 'inline-image-migration'

/**
 * Wrap every mis-placed inline image directly under `node` in a paragraph, recursing
 * into block containers. `parentIsTextblock` says whether `node` itself is a paragraph/
 * heading (in which case a direct image child is already valid and left alone).
 * Returns the number of images relocated.
 */
function wrapStrayImages(node: Y.XmlFragment, parentIsTextblock: boolean): number {
  let fixed = 0
  // Walk children back-to-front so an in-place delete+insert never shifts an index we
  // still have to visit.
  for (let i = node.length - 1; i >= 0; i--) {
    const child = node.get(i)
    if (!(child instanceof Y.XmlElement)) continue // Y.XmlText & friends can't hold an image
    if (child.nodeName === IMAGE_NODE) {
      // An image already inside a textblock is valid inline content — leave it.
      if (parentIsTextblock) continue
      // Image is a leaf node, so `clone()` (attributes only) fully preserves it. Drop the
      // stray original and insert a paragraph wrapper carrying the clone at the same slot.
      const wrapper = new Y.XmlElement('paragraph')
      wrapper.insert(0, [child.clone()])
      node.delete(i, 1)
      node.insert(i, [wrapper])
      fixed++
    } else {
      // Recurse into block containers (box, table, cells, lists, blockquote, …).
      fixed += wrapStrayImages(child, TEXTBLOCK_NODES.has(child.nodeName))
    }
  }
  return fixed
}

/**
 * Repair a possibly pre-inline-image ydoc in place. Safe to call on ANY document
 * (idempotent + transactional). Returns the number of images relocated (0 ⇒ nothing to
 * do). The fragment name mirrors CollabEditor's `ydoc.getXmlFragment('default')`.
 */
export function migrateInlineImages(ydoc: Y.Doc): number {
  const fragment = ydoc.getXmlFragment('default')
  let fixed = 0
  // A single transaction ⇒ one atomic CRDT update the server persists and peers apply.
  ydoc.transact(() => {
    // The fragment root is not a textblock, so a top-level image is always a stray.
    fixed = wrapStrayImages(fragment, false)
  }, INLINE_IMAGE_MIGRATION_ORIGIN)
  return fixed
}
