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
import { useTranslation } from 'react-i18next'
import { useEditor, EditorContent, BubbleMenu, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import TextAlign from '@tiptap/extension-text-align'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Mention from '@tiptap/extension-mention'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { cn } from '../lib/cn'
import { Icon } from '../lib/icons'
import { DrawingCanvas } from './DrawingCanvas'
import { Box } from './editor/Box'
import { FontSize } from './editor/FontSize'
import { ResizableImage } from './editor/ResizableImage'
import { migrateLegacyDrawings, svgToDataUrl } from './editor/drawing'
import { buildMentionSuggestion } from './editor/mentionSuggestion'
import type { MentionMember } from './editor/MentionList'

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
  /** Page geometry (SPEC 1) — drives the A4 portrait/landscape surface size. */
  orientation?: 'portrait' | 'landscape'
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
  /** Project roster for @mention autocomplete. Read live via a ref so the extension is
   *  created once and never remounts the editor when the list refreshes. */
  members?: MentionMember[]
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
    // No `enabled` guard: Yjs UndoManager makes `can().undo()/redo()` unreliable
    // (redo returns false spuriously). Buttons are always clickable; an empty stack no-ops.
    { key: 'undo', title: 'ย้อนกลับ (Ctrl+Z)', icon: 'undo', run: (e) => e.chain().focus().undo().run() },
    { key: 'redo', title: 'ทำซ้ำ (Ctrl+Y)', icon: 'redo', run: (e) => e.chain().focus().redo().run() },
  ],
]

// SPEC 2 — Font pickers. Families are stored as inline `font-family`; the first entry
// clears the override (falls back to the document's default body font).
const FONT_FAMILIES = [
  { label: 'ค่าเริ่มต้น', value: '' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Sora', value: 'Sora, sans-serif' },
  { label: 'Noto Sans Thai', value: '"Noto Sans Thai", sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
]
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]

// SPEC 4 — Table controls surfaced in a BubbleMenu when the caret is inside a table.
// `can` gates actions that ProseMirror rejects out of context (merge needs a multi-cell
// selection; split needs a merged cell) so the buttons disable instead of silently no-op.
const TABLE_ACTIONS: { key: string; title: string; run: (e: Editor) => void; can?: (e: Editor) => boolean }[] = [
  { key: 'colBefore', title: '+คอลัมน์ซ้าย', run: (e) => e.chain().focus().addColumnBefore().run() },
  { key: 'colAfter', title: '+คอลัมน์ขวา', run: (e) => e.chain().focus().addColumnAfter().run() },
  { key: 'delCol', title: 'ลบคอลัมน์', run: (e) => e.chain().focus().deleteColumn().run() },
  { key: 'rowBefore', title: '+แถวบน', run: (e) => e.chain().focus().addRowBefore().run() },
  { key: 'rowAfter', title: '+แถวล่าง', run: (e) => e.chain().focus().addRowAfter().run() },
  { key: 'delRow', title: 'ลบแถว', run: (e) => e.chain().focus().deleteRow().run() },
  { key: 'merge', title: 'รวมเซลล์', run: (e) => e.chain().focus().mergeCells().run(), can: (e) => e.can().mergeCells() },
  { key: 'split', title: 'แยกเซลล์', run: (e) => e.chain().focus().splitCell().run(), can: (e) => e.can().splitCell() },
  { key: 'header', title: 'สลับหัวแถว', run: (e) => e.chain().focus().toggleHeaderRow().run() },
  { key: 'delTable', title: 'ลบตาราง', run: (e) => e.chain().focus().deleteTable().run() },
]

export function CollabEditor({
  fileId, token, initialContent, readOnly, orientation, onChange, user, onPresenceChange, onStatusChange, onReady, members,
}: CollabEditorProps) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  // Live roster for @mention — the suggestion reads through this ref so a member-list
  // refetch never forces the editor (and its Yjs binding) to remount.
  const membersRef = useRef<MentionMember[]>(members ?? [])
  membersRef.current = members ?? []
  const getMembers = useCallback(() => membersRef.current, [])
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
    FontFamily,
    FontSize,
    // SPEC 3 — resizable variant; same config surface as the stock Image extension.
    ResizableImage.configure({ inline: false, allowBase64: true }),
    Box,
    // resizable:false — column resize handles fight the Yjs sync and add little value here.
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    // Task/checklist blocks — ProseMirror nodes under the Collaboration extension, so they
    // round-trip through Yjs / getHTML() / PDF export automatically (precedent: Box.ts).
    TaskList,
    TaskItem.configure({ nested: true }),
    // @mention chips. renderHTML keeps the literal "@username" text so the existing
    // backend regex (revisions.service.ts) still detects mentions. Suggestion reads the
    // live roster via getMembers; readOnly viewers never trigger it (not editable).
    Mention.configure({
      HTMLAttributes: { class: 'tb-mention' },
      suggestion: buildMentionSuggestion(getMembers),
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Collaboration.configure({ document: ydoc }),
    CollaborationCursor.configure({
      provider,
      user: user ?? { name: 'ผู้ใช้', color: '#6d5bd0' },
    }),
  ], [ydoc, provider, user, getMembers])

  const editor = useEditor({
    extensions,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'tb-prose text-[15px] leading-relaxed text-ink outline-none',
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

  const insertTable = useCallback(() => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  const toggleChecklist = useCallback(() => {
    editor?.chain().focus().toggleTaskList().run()
  }, [editor])

  const insertDrawing = useCallback((svg: string) => {
    editor?.chain().focus().setImage({ src: svgToDataUrl(svg) }).run()
  }, [editor])

  if (!editor) return null

  return (
    <div className="flex flex-col">
      {!readOnly && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-card p-1.5 shadow-soft">
          {/* SPEC 2 — Font family + size. stopPropagation (not preventDefault) on mousedown:
              a native <select> needs to take focus to open, unlike the toolbar buttons. */}
          <div className="flex items-center gap-1.5">
            <select
              value={editor.getAttributes('textStyle').fontFamily ?? ''}
              onChange={(e) => {
                if (e.target.value) editor.chain().focus().setFontFamily(e.target.value).run()
                else editor.chain().focus().unsetFontFamily().run()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="แบบอักษร"
              className="h-8 rounded-lg border border-line bg-card px-2 text-[13px] focus:outline-none"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select
              value={(editor.getAttributes('textStyle').fontSize ?? '').replace('px', '')}
              onChange={(e) => {
                if (e.target.value) editor.chain().focus().setFontSize(`${e.target.value}px`).run()
                else editor.chain().focus().unsetFontSize().run()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="ขนาดอักษร"
              className="h-8 w-[4.5rem] rounded-lg border border-line bg-card px-2 text-[13px] focus:outline-none"
            >
              <option value="">–</option>
              {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="mx-0.5 h-5 w-px bg-line" />
          </div>

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
            <button
              type="button"
              title="ลบกล่องข้อความ"
              disabled={!editor.isActive('box')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const { $from } = editor.state.selection
                for (let d = $from.depth; d > 0; d--) {
                  if ($from.node(d).type.name === 'box') {
                    const start = $from.before(d)
                    const end = $from.after(d)
                    editor.chain().focus().deleteRange({ from: start, to: end }).run()
                    break
                  }
                }
              }}
              className={cn(
                'grid h-8 min-w-8 place-items-center rounded-lg px-2 text-muted hover:bg-ink/5 hover:text-ink',
                !editor.isActive('box') && 'opacity-40 hover:bg-transparent',
              )}
            >
              <Icon.trash width={16} height={16} />
            </button>
            <button
              type="button" title="แทรกตาราง"
              onMouseDown={(e) => e.preventDefault()} onClick={insertTable}
              className="grid h-8 min-w-8 place-items-center rounded-lg px-2 text-muted hover:bg-ink/5 hover:text-ink"
            >
              <Icon.table width={16} height={16} />
            </button>
            <button
              type="button" title={t('tasklist.insert')} aria-label={t('tasklist.insert')}
              aria-pressed={editor.isActive('taskList')}
              onMouseDown={(e) => e.preventDefault()} onClick={toggleChecklist}
              className={cn(
                'grid h-8 min-w-8 place-items-center rounded-lg px-2',
                editor.isActive('taskList') ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-ink/5 hover:text-ink',
              )}
            >
              <Icon.checklist width={16} height={16} />
            </button>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onImagePick} />
      <DrawingCanvas open={drawOpen} onClose={() => setDrawOpen(false)} onInsert={insertDrawing} />

      {/* SPEC 4 — Table controls, shown only while the caret sits inside a table. */}
      {!readOnly && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor }) => editor.isActive('table')}
          tippyOptions={{ placement: 'top', duration: 100, zIndex: 20 }}
          className="flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-card p-1 shadow-soft"
        >
          {TABLE_ACTIONS.map((a) => {
            const disabled = a.can ? !a.can(editor) : false
            return (
              <button
                key={a.key}
                type="button"
                title={a.title}
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => a.run(editor)}
                className={cn(
                  'rounded px-1.5 py-1 text-[11px] font-medium text-muted hover:bg-ink/5 hover:text-ink',
                  disabled && 'opacity-40 hover:bg-transparent',
                )}
              >
                {a.title}
              </button>
            )
          })}
        </BubbleMenu>
      )}

      {/* SPEC 1 — A4 page surface (portrait/landscape). Padding is the 1-inch page margin. */}
      <div className={cn('tb-page', orientation === 'landscape' ? 'tb-page--landscape' : 'tb-page--portrait')}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
