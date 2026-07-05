// Phase 4.2 — Real-time collaborative rich-text editor (TipTap + Yjs).
//
// Replaces the execCommand-based RichEditor. The ProseMirror document is bound to a
// Yjs CRDT that syncs over a HocuspocusProvider WebSocket; the server (CollabService)
// is the authority for auth/authorization and persists the Y.Doc to `File.ydoc`.
//
// Design notes:
//  - StarterKit `history` is DISABLED — undo/redo is owned by the Collaboration
//    extension's Yjs UndoManager. Running both stacks fights over the same doc.
//  - The Y.Doc + provider are created once per mount. WorkPage remounts this
//    component per document via `key={doc.id}`, so "once per mount" == "per file".
//  - Legacy seed: pre-Phase-4 documents only have HTML (`File.content`). On the first
//    successful sync, if the shared Yjs fragment is still empty we seed it once from
//    `initialContent`. Guarded so it can never run twice (which would duplicate text).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { cn } from '../lib/cn'
import { Icon } from '../lib/icons'
import { DrawingCanvas } from './DrawingCanvas'
import { Box } from './editor/Box'
import { migrateLegacyDrawings, svgToDataUrl } from './editor/drawing'

const COLLAB_URL = import.meta.env.VITE_COLLAB_URL || 'ws://localhost:3002'
const MAX_IMAGE_BYTES = 3 * 1024 * 1024 // 3MB — embedded as a data URL into the doc
const AUTOSAVE_MS = 1000

export interface CollabUser {
  name: string
  color: string
}

/** A peer currently connected to the same document (from Yjs awareness). */
export interface PresenceUser {
  clientId: number
  name: string
  color: string
}

export interface CollabEditorProps {
  /** File id — used as the Yjs document name (server maps it to File.ydoc). */
  fileId: string
  /**
   * Access JWT for the WS handshake. Prefer an (optionally async) getter: Hocuspocus
   * calls it on every (re)connect, so a token refreshed elsewhere — or refreshed
   * on-demand by the getter itself — is picked up on reconnect instead of a stale
   * snapshot expiring the socket.
   */
  token: string | (() => string) | (() => Promise<string>)
  /** Legacy HTML body (pre-Phase-4). Seeds the Yjs doc once if it's still empty. */
  initialContent?: string
  /** Viewer role → non-editable on the client (the server also enforces read-only). */
  readOnly?: boolean
  /** Debounced HTML snapshot for the secondary `File.content` mirror + PDF export. */
  onChange?: (html: string) => void
  /** Identity for the live cursor / presence (Phase 4.3). */
  user?: CollabUser
  /** Live roster of peers in the room (includes self) — drives the header avatar stack. */
  onPresenceChange?: (users: PresenceUser[]) => void
  /** Connection state → lets the shell show a "reconnecting" hint. */
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void
  /** Hands the editor instance to the parent (version-history snapshot + restore). */
  onReady?: (editor: Editor | null) => void
}

type ToolButton = {
  key: string
  title: string
  text?: string
  icon?: keyof typeof Icon
  run: (e: Editor) => void
  active?: (e: Editor) => boolean
  enabled?: (e: Editor) => boolean
}

// Toolbar is data-driven so active/disabled state derives from the single editor
// instance — no duplicated command wiring, and every button stays in sync with Yjs.
const GROUPS: ToolButton[][] = [
  [
    { key: 'bold', title: 'ตัวหนา (Ctrl+B)', icon: 'bold', run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive('bold') },
    { key: 'italic', title: 'ตัวเอียง (Ctrl+I)', icon: 'italic', run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive('italic') },
    { key: 'underline', title: 'ขีดเส้นใต้ (Ctrl+U)', icon: 'underline', run: (e) => e.chain().focus().toggleUnderline().run(), active: (e) => e.isActive('underline') },
  ],
  [
    { key: 'h1', title: 'หัวข้อใหญ่', text: 'H1', run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive('heading', { level: 1 }) },
    { key: 'h2', title: 'หัวข้อรอง', text: 'H2', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive('heading', { level: 2 }) },
    { key: 'p', title: 'ย่อหน้าปกติ', text: '¶', run: (e) => e.chain().focus().setParagraph().run(), active: (e) => e.isActive('paragraph') },
  ],
  [
    { key: 'ul', title: 'รายการแบบจุด', text: '•', run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive('bulletList') },
    { key: 'ol', title: 'รายการแบบเลข', text: '1.', run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive('orderedList') },
  ],
  [
    { key: 'left', title: 'ชิดซ้าย', icon: 'alignLeft', run: (e) => e.chain().focus().setTextAlign('left').run(), active: (e) => e.isActive({ textAlign: 'left' }) },
    { key: 'center', title: 'กึ่งกลาง', icon: 'alignCenter', run: (e) => e.chain().focus().setTextAlign('center').run(), active: (e) => e.isActive({ textAlign: 'center' }) },
    { key: 'right', title: 'ชิดขวา', icon: 'alignRight', run: (e) => e.chain().focus().setTextAlign('right').run(), active: (e) => e.isActive({ textAlign: 'right' }) },
  ],
  [
    // Undo/redo go through the Yjs UndoManager (Collaboration extension), not StarterKit history.
    { key: 'undo', title: 'ย้อนกลับ (Ctrl+Z)', icon: 'undo', run: (e) => e.chain().focus().undo().run(), enabled: (e) => e.can().undo() },
    { key: 'redo', title: 'ทำซ้ำ (Ctrl+Y)', icon: 'redo', run: (e) => e.chain().focus().redo().run(), enabled: (e) => e.can().redo() },
  ],
]

export function CollabEditor({
  fileId, token, initialContent, readOnly, onChange, user, onPresenceChange, onStatusChange, onReady,
}: CollabEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const seeded = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  // Re-render the toolbar on selection/content change so active state stays live.
  const [, forceTick] = useState(0)
  const [synced, setSynced] = useState(false)
  const [drawOpen, setDrawOpen] = useState(false)

  // Created exactly once per mount (per file, thanks to the parent's `key`).
  const [{ ydoc, provider }] = useState(() => {
    const ydoc = new Y.Doc()
    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: fileId,
      document: ydoc,
      token,
      onSynced: () => setSynced(true),
    })
    return { ydoc, provider }
  })

  // Tear down the socket + doc on unmount so switching files doesn't leak connections.
  useEffect(() => () => {
    provider.destroy()
    ydoc.destroy()
  }, [provider, ydoc])

  const extensions = useMemo(() => [
    // History off: the Collaboration extension provides Yjs-backed undo/redo instead.
    StarterKit.configure({ history: false }),
    Underline,
    TextStyle,
    Color,
    Image.configure({ inline: false, allowBase64: true }),
    Box,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Collaboration.configure({ document: ydoc }),
    CollaborationCursor.configure({
      provider,
      user: user ?? { name: 'ผู้ใช้', color: '#6d5bd0' },
    }),
  ], [ydoc, provider, user])

  const editor = useEditor({
    extensions,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'tb-prose min-h-[60vh] w-full max-w-none text-[15px] leading-relaxed text-ink outline-none',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'พื้นที่แก้ไขเอกสาร',
      },
    },
    onSelectionUpdate: () => forceTick((n) => n + 1),
    onTransaction: () => forceTick((n) => n + 1),
    onUpdate: ({ editor }) => {
      if (!onChange) return
      // Debounced HTML mirror — the Yjs CRDT is the real source of truth; this keeps
      // File.content fresh for search/preview/PDF without racing the CRDT.
      clearTimeout(saveTimer.current)
      const html = editor.getHTML()
      saveTimer.current = setTimeout(() => onChange(html), AUTOSAVE_MS)
    },
  }, [ydoc, provider])

  // Always-current editor handle for the unmount flush (whose effect has empty deps).
  const editorRef = useRef<Editor | null>(null)
  editorRef.current = editor

  // Keep client editability in sync with the role (server is still authoritative).
  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  // Surface the editor to the parent (and null it out on unmount) for history actions.
  useEffect(() => {
    if (!onReady) return
    onReady(editor)
    return () => onReady(null)
  }, [editor, onReady])

  // If auth resolves after the editor mounts, refresh the cursor identity so peers
  // see the real name/color instead of the placeholder.
  useEffect(() => {
    if (editor && user) editor.commands.updateUser(user)
  }, [editor, user])

  // One-time legacy seed: only when the shared doc is genuinely empty after sync.
  useEffect(() => {
    if (!editor || !synced || seeded.current) return
    seeded.current = true
    const fragment = ydoc.getXmlFragment('default')
    // Defense-in-depth against a two-client seed race: only seed if we're effectively
    // alone in the room. If peers are already present, one of them owns the seed, so
    // seeding here too would duplicate the legacy content into the CRDT.
    const alone = (provider.awareness?.getStates().size ?? 1) <= 1
    if (fragment.length === 0 && initialContent && !readOnly && alone) {
      // Migrate legacy inline SVG drawings → data-URL images before parsing into the schema.
      // `false` → don't push this to the undo stack / don't emit an update storm.
      editor.commands.setContent(migrateLegacyDrawings(initialContent), false)
    }
  }, [editor, synced, ydoc, provider, initialContent, readOnly])

  // Presence roster: mirror Yjs awareness (set by CollaborationCursor) to the parent.
  useEffect(() => {
    const awareness = provider.awareness
    if (!awareness || !onPresenceChange) return
    const emit = () => {
      const seen = new Map<number, PresenceUser>()
      awareness.getStates().forEach((state, clientId) => {
        const u = (state as { user?: CollabUser }).user
        if (u?.name) seen.set(clientId, { clientId, name: u.name, color: u.color })
      })
      onPresenceChange([...seen.values()])
    }
    awareness.on('change', emit)
    emit()
    return () => awareness.off('change', emit)
  }, [provider, onPresenceChange])

  // Connection status → surfaced for a "reconnecting" indicator.
  useEffect(() => {
    if (!onStatusChange) return
    const onStatus = (e: { status: 'connecting' | 'connected' | 'disconnected' }) => onStatusChange(e.status)
    provider.on('status', onStatus)
    return () => { provider.off('status', onStatus) }
  }, [provider, onStatusChange])

  // Flush a final HTML snapshot on unmount so a fast file-switch doesn't drop the tail edit.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const e = editorRef.current
    if (onChange && e && !e.isDestroyed) onChange(e.getHTML())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onImagePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file || !editor) return
    if (!file.type.startsWith('image/')) return
    if (file.size > MAX_IMAGE_BYTES) { alert('รูปภาพต้องไม่เกิน 3MB'); return }
    const reader = new FileReader()
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result as string }).run()
    }
    reader.readAsDataURL(file)
  }, [editor])

  const insertBox = useCallback(() => {
    editor?.chain().focus().insertContent({
      type: 'box',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'พิมพ์ข้อความในกล่อง…' }] }],
    }).run()
  }, [editor])

  const insertDrawing = useCallback((svg: string) => {
    editor?.chain().focus().setImage({ src: svgToDataUrl(svg) }).run()
  }, [editor])

  if (!editor) return null

  return (
    <div className="flex flex-col">
      {!readOnly && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-card p-1.5 shadow-soft">
          {GROUPS.map((group, gi) => (
            <div key={gi} className="flex items-center gap-0.5">
              {gi > 0 && <span className="mx-1 h-5 w-px bg-line" />}
              {group.map((b) => {
                const IconCmp = b.icon ? Icon[b.icon] : null
                const active = b.active?.(editor) ?? false
                const disabled = b.enabled ? !b.enabled(editor) : false
                return (
                  <button
                    key={b.key}
                    type="button"
                    title={b.title}
                    aria-label={b.title}
                    aria-pressed={b.active ? active : undefined}
                    disabled={disabled}
                    // Don't let the button steal the editor selection.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => b.run(editor)}
                    className={cn(
                      'grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[13px] font-semibold',
                      active ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-ink/5 hover:text-ink',
                      disabled && 'opacity-40 hover:bg-transparent',
                    )}
                  >
                    {IconCmp ? <IconCmp width={16} height={16} /> : b.text}
                  </button>
                )
              })}
            </div>
          ))}

          {/* Insert group: image / draw / box */}
          <div className="flex items-center gap-0.5">
            <span className="mx-1 h-5 w-px bg-line" />
            <button
              type="button" title="แทรกรูปภาพ"
              onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()}
              className="grid h-8 min-w-8 place-items-center rounded-lg px-2 text-muted hover:bg-ink/5 hover:text-ink"
            >
              <Icon.image width={16} height={16} />
            </button>
            <button
              type="button" title="วาดภาพ (รองรับ stylus)"
              onMouseDown={(e) => e.preventDefault()} onClick={() => setDrawOpen(true)}
              className="grid h-8 min-w-8 place-items-center rounded-lg px-2 text-muted hover:bg-ink/5 hover:text-ink"
            >
              <Icon.pencil width={16} height={16} />
            </button>
            <button
              type="button" title="แทรกกล่องข้อความ (Box)"
              onMouseDown={(e) => e.preventDefault()} onClick={insertBox}
              className="grid h-8 min-w-8 place-items-center rounded-lg px-2 text-muted hover:bg-ink/5 hover:text-ink"
            >
              <Icon.box width={16} height={16} />
            </button>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onImagePick} />
      <DrawingCanvas open={drawOpen} onClose={() => setDrawOpen(false)} onInsert={insertDrawing} />

      <EditorContent editor={editor} />
    </div>
  )
}
