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
import { yUndoPluginKey, undo as yUndo, redo as yRedo } from 'y-prosemirror'
import * as Y from 'yjs'
import { cn } from '../lib/cn'
import { Icon } from '../lib/icons'
import { apiError } from '../lib/api'
import { FilesApi } from '../lib/files'
import { Box } from './editor/Box'
import { FontSize } from './editor/FontSize'
import { ResizableImage } from './editor/ResizableImage'
import { CommentHighlight } from './editor/CommentHighlight'
import { applyCommentMark, rangeToAnchor } from './editor/commentAnchor'
import { migrateLegacyDrawings } from './editor/drawing'
import { DrawingOverlay } from './editor/DrawingOverlay'
import { DRAW_ORIGIN, DRAW_COLORS, DRAW_SIZES, type DrawTool } from './editor/drawingModel'
import { buildMentionSuggestion } from './editor/mentionSuggestion'
import type { MentionMember } from './editor/MentionList'

const COLLAB_URL = import.meta.env.VITE_COLLAB_URL || 'ws://localhost:3002'
const MAX_IMAGE_BYTES = 3 * 1024 * 1024 // 3MB — enforced client-side + server-side
// Raster whitelist mirrors the API (assets.service.ts). SVG drawings are rasterized
// to PNG before upload, so the doc never carries an <img src="data:image/svg…">.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const AUTOSAVE_MS = 1000

type EditorMode = 'write' | 'draw' | 'insert'

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `u${Date.now()}${Math.random()}`

/** A local (never synced) image-upload in flight or failed — drives the progress/error cards. */
interface UploadItem {
  id: string
  status: 'uploading' | 'error'
  progress: number // 0..1
  name: string
  message?: string // error text (status === 'error')
  blob?: Blob // present ⇒ the upload is retriable
  insertPos?: number // doc position captured at start
}

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
  /** Project id — scopes the image-upload endpoint (ProjectRoleGuard reads it). */
  projectId: string
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
  /** Serialized <svg> of the inline drawing layer — emitted on stroke change so the parent
   *  can inject it into the PDF export (ADR 0005 D5; drawings live outside getHTML). */
  onDrawingsSvgChange?: (svg: string) => void
  /** Editor+ may attach comments (backend @MinRole(Editor) on POST) — gates the comment
   *  affordance in the selection BubbleMenu. */
  canComment?: boolean
  /** Persist a new comment. Resolves with the created id so the highlight mark can be applied
   *  to the exact source range. Returns null if creation failed (no mark is applied). */
  onCreateComment?: (input: {
    anchorFrom: unknown
    anchorTo: unknown
    anchorText: string
    body: string
  }) => Promise<{ id: string } | null>
  /** A comment highlight was clicked in the document — ids of every thread covering that
   *  point (overlaps included), topmost-first. Lets the shell open + focus the thread. */
  onCommentActivate?: (commentIds: string[]) => void
}

/** Draw-mode tools surfaced in the toolbar (SPEC งานที่ 2). */
const DRAW_TOOLS: { key: DrawTool; titleKey: string; icon: keyof typeof Icon }[] = [
  { key: 'pen', titleKey: 'editor.pen', icon: 'pencil' },
  { key: 'highlighter', titleKey: 'editor.highlighter', icon: 'highlighter' },
  { key: 'eraser', titleKey: 'editor.eraser', icon: 'eraser' },
]

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
  // Undo/redo used to live here; they now sit in the mode-row (shared across all modes)
  // and are driven directly by the Yjs UndoManager (SPEC A2) — see doUndo/doRedo below.
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
  fileId, projectId, token, initialContent, readOnly, orientation, onChange, user, onPresenceChange, onStatusChange, onReady, members, onDrawingsSvgChange,
  canComment, onCreateComment, onCommentActivate,
}: CollabEditorProps) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  // Comment click-activation reads through a ref: editorProps is built once at mount, so the
  // handler must not close over a stale callback.
  const onCommentActivateRef = useRef(onCommentActivate)
  onCommentActivateRef.current = onCommentActivate
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
  // Inline drawing tool state (SPEC งานที่ 2) — local UI, never synced. The strokes
  // themselves live in a Y.Array (DrawingOverlay), synced + persisted with the doc.
  const [drawTool, setDrawTool] = useState<DrawTool>('pen')
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0])
  const [drawSize, setDrawSize] = useState(DRAW_SIZES[2])
  // Toolbar mode (SPEC B) — local UI state, never synced to peers. Always starts on "write".
  const [mode, setMode] = useState<EditorMode>('write')
  // Inline "new comment" composer (Sprint 4). The source range is captured when the comment
  // affordance is clicked and held here, so typing in the popover can never drift the anchor.
  const [commentDraft, setCommentDraft] = useState<{ from: number; to: number; x: number; y: number } | null>(null)
  const [commentText, setCommentText] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const commentPopRef = useRef<HTMLDivElement>(null)
  // In-flight / failed image uploads (SPEC A1) — local, never enter the Yjs CRDT.
  const [uploads, setUploads] = useState<UploadItem[]>([])
  // Abort controllers keyed by upload id, so an unmount cancels pending uploads.
  const uploadAborters = useRef<Map<string, AbortController>>(new Map())
  // Late-bound so editorProps.handlePaste/handleDrop (created at mount) can reach the
  // latest uploader without re-creating the editor.
  const startUploadRef = useRef<(blob: Blob, name: string, insertPos?: number) => void>()
  // Roving-tabindex focus targets for the mode tablist (SPEC B a11y).
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Created exactly once per mount (per file, thanks to the parent's `key`).
  //
  // NOT a useState lazy initializer: React 18 StrictMode deliberately invokes a
  // useState initializer function TWICE in dev to catch impurities (per the React
  // docs — "the initializer should not have side effects"), so the previous
  // `useState(() => new HocuspocusProvider(...))` opened TWO live WebSocket
  // connections racing for the same Yjs document room every mount, with the
  // discarded one still calling its `onSynced` handler (the exact
  // "state update on a component that hasn't mounted yet" warning this produced).
  // A ref guarded in the render body persists across that double-invoke (same
  // fiber, same ref object), so the check-then-create below runs the real
  // side effect exactly once.
  const collabRef = useRef<{ ydoc: Y.Doc; provider: HocuspocusProvider } | null>(null)
  if (!collabRef.current) {
    const ydoc = new Y.Doc()
    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: fileId,
      document: ydoc,
      token,
      onSynced: () => setSynced(true),
    })
    collabRef.current = { ydoc, provider }
  }
  const { ydoc, provider } = collabRef.current

  // Dedicated UndoManager for the inline drawing layer (ADR 0005 D4). Scoped to the
  // `drawings` Y.Array and tracking only local ink edits (DRAW_ORIGIN), so undo/redo in
  // draw mode reverts *my* last stroke and never a peer's — separate from the text
  // (y-prosemirror) undo stack. Same StrictMode double-invoke hazard as the provider
  // above (a useState lazy initializer runs twice in dev) — ref-guarded for the same
  // reason: constructing this attaches live listeners to `ydoc`, so a discarded second
  // instance would double-track every drawing edit against the (correctly) surviving one.
  const drawUndoRef = useRef<Y.UndoManager | null>(null)
  if (!drawUndoRef.current) {
    drawUndoRef.current = new Y.UndoManager(ydoc.getArray('drawings'), { trackedOrigins: new Set([DRAW_ORIGIN]) })
  }
  const drawUndo = drawUndoRef.current

  // Tear down the socket + doc on unmount so switching files doesn't leak connections.
  useEffect(() => () => {
    drawUndo.destroy()
    provider.destroy()
    ydoc.destroy()
  }, [drawUndo, provider, ydoc])

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
    // Comment highlight (Sprint 4) — a mark, so it rides the Yjs CRDT and persists with the
    // doc; the DB keeps the RelativePosition anchor as the durable record.
    CommentHighlight,
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
      // Close the paste/drag base64 gap (SPEC A1 / ADR Decision 3): intercept image
      // FILES from the clipboard/drop and route them through the upload pipeline so
      // they become URLs, not base64 in the CRDT. Non-file pastes (incl. legacy
      // <img data:> HTML) fall through to TipTap's default handling.
      handlePaste: (view, event) => {
        const image = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
        if (!image) return false
        event.preventDefault()
        startUploadRef.current?.(image, image.name || 'pasted-image', view.state.selection.from)
        return true
      },
      handleDrop: (view, event) => {
        const dt = (event as DragEvent).dataTransfer
        const image = Array.from(dt?.files ?? []).find((f) => f.type.startsWith('image/'))
        if (!image) return false
        event.preventDefault()
        const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })
        startUploadRef.current?.(image, image.name || 'dropped-image', at?.pos ?? view.state.selection.from)
        return true
      },
      // Click a comment highlight → surface its thread(s) in the panel. Never consumes the
      // click (returns false) so caret placement / normal editing is unaffected.
      handleClick: (view, pos) => {
        const notify = onCommentActivateRef.current
        if (!notify) return false
        const $pos = view.state.doc.resolve(pos)
        const type = view.state.schema.marks.commentHighlight
        const ids = $pos
          .marks()
          .filter((m) => m.type === type && m.attrs.commentId)
          .map((m) => m.attrs.commentId as string)
        if (ids.length) notify([...new Set(ids)])
        return false
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

  /* ── Image upload state machine (SPEC A1) ───────────────────────────────────
     Images are uploaded to Supabase Storage and only their URL enters the doc, so
     the Yjs CRDT never carries base64 (ADR 0004). We deliberately do NOT insert a
     ProseMirror placeholder node: a placeholder node would sync into the CRDT
     immediately (every PM node does), so "no partial node on failure / tab-close"
     can't hold for a real placeholder. Instead progress/errors render as local
     cards (below the toolbar) and only the final image node — on success — is
     inserted into the document. */
  const validateImage = useCallback((blob: Blob): string | null => {
    if (!ALLOWED_IMAGE_TYPES.includes(blob.type)) return 'รองรับเฉพาะรูปภาพ JPG, PNG, WEBP หรือ GIF'
    if (blob.size > MAX_IMAGE_BYTES) return 'รูปภาพต้องไม่เกิน 3MB'
    return null
  }, [])

  const dismissUpload = useCallback((id: string) => {
    uploadAborters.current.get(id)?.abort()
    uploadAborters.current.delete(id)
    setUploads((u) => u.filter((it) => it.id !== id))
  }, [])

  const startUpload = useCallback((blob: Blob, name: string, insertPos?: number) => {
    const invalid = validateImage(blob)
    if (invalid) {
      setUploads((u) => [...u, { id: uid(), status: 'error', progress: 0, name, message: invalid }])
      return
    }
    const id = uid()
    setUploads((u) => [...u, { id, status: 'uploading', progress: 0, name, blob, insertPos }])
    const controller = new AbortController()
    uploadAborters.current.set(id, controller)
    FilesApi.uploadAsset(projectId, fileId, blob, {
      filename: name,
      signal: controller.signal,
      onProgress: (f) => setUploads((u) => u.map((it) => (it.id === id ? { ...it, progress: f } : it))),
    })
      .then(({ url }) => {
        uploadAborters.current.delete(id)
        const ed = editorRef.current
        if (ed && !ed.isDestroyed) {
          const pos = insertPos != null ? Math.min(insertPos, ed.state.doc.content.size) : null
          const chain = ed.chain().focus()
          if (pos != null) chain.insertContentAt(pos, { type: 'image', attrs: { src: url } })
          else chain.setImage({ src: url })
          chain.run()
        }
        setUploads((u) => u.filter((it) => it.id !== id))
      })
      .catch((err) => {
        uploadAborters.current.delete(id)
        if (controller.signal.aborted) {
          setUploads((u) => u.filter((it) => it.id !== id))
          return
        }
        const msg = apiError(err).message ?? 'อัปโหลดไม่สำเร็จ'
        setUploads((u) => u.map((it) => (it.id === id ? { ...it, status: 'error', message: msg } : it)))
      })
  }, [validateImage, projectId, fileId])

  const retryUpload = useCallback((id: string) => {
    const item = uploads.find((it) => it.id === id)
    if (!item?.blob) return
    setUploads((u) => u.filter((it) => it.id !== id))
    startUpload(item.blob, item.name, item.insertPos)
  }, [uploads, startUpload])

  startUploadRef.current = startUpload

  const onImagePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    startUpload(file, file.name)
  }, [startUpload])

  // Re-render the undo/redo buttons when the Yjs undo/redo stacks change (SPEC A2 #4).
  // Covers both the text UndoManager (y-prosemirror) and the drawing UndoManager so the
  // shared toolbar buttons reflect whichever stack the current mode drives.
  useEffect(() => {
    if (!editor) return
    const tick = () => forceTick((n) => n + 1)
    const managers = [yUndoPluginKey.getState(editor.state)?.undoManager, drawUndo].filter(Boolean) as Y.UndoManager[]
    for (const m of managers) {
      m.on('stack-item-added', tick)
      m.on('stack-item-popped', tick)
      m.on('stack-cleared', tick)
    }
    return () => {
      for (const m of managers) {
        m.off('stack-item-added', tick)
        m.off('stack-item-popped', tick)
        m.off('stack-cleared', tick)
      }
    }
  }, [editor, drawUndo])

  // Abort any in-flight uploads on unmount (no orphaned requests / setState-after-unmount).
  useEffect(() => {
    const aborters = uploadAborters.current
    return () => {
      aborters.forEach((c) => c.abort())
      aborters.clear()
    }
  }, [])

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

  const clearDrawing = useCallback(() => {
    const arr = ydoc.getArray('drawings')
    if (arr.length > 0) ydoc.transact(() => arr.delete(0, arr.length), DRAW_ORIGIN)
  }, [ydoc])

  // Yjs' UndoManager constructor registers itself in `trackedOrigins` so that its own
  // undo transactions get recorded as redo items (undo pushes the inverse onto redoStack
  // only when the undo transaction's origin — the manager — is tracked). React StrictMode's
  // dev double-mount tears the plugin's UndoManager down (whose destroy() does
  // `trackedOrigins.delete(this)`) while the Y.Doc + manager singletons are reused on the
  // remount — leaving a manager that still *applies* undo but never records a redo item, so
  // the redo button/shortcut silently does nothing. (The headless undoRedo test only
  // single-mounts, so it never reproduces this; production renders StrictMode once, so it's
  // unaffected — but we keep this robust either way.) Re-assert the invariant the instant we
  // act: cheap, idempotent, and a no-op when it's already tracked.
  const ensureSelfTracks = useCallback((um?: Y.UndoManager | null) => {
    if (um) um.trackedOrigins.add(um)
  }, [])

  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z. In draw mode we drive the *drawing* stack directly
  // (capture-phase, so we win before ProseMirror's keymap); in write/insert mode we let the
  // y-prosemirror keymap do the undo/redo but first guarantee the text manager self-tracks.
  useEffect(() => {
    if (readOnly) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      const isUndo = k === 'z' && !e.shiftKey
      const isRedo = k === 'y' || (k === 'z' && e.shiftKey)
      if (!isUndo && !isRedo) return
      if (mode === 'draw') {
        e.preventDefault(); e.stopPropagation()
        ensureSelfTracks(drawUndo)
        if (isUndo) drawUndo.undo(); else drawUndo.redo()
      } else {
        ensureSelfTracks(yUndoPluginKey.getState(editorRef.current!.state)?.undoManager)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [mode, readOnly, drawUndo, ensureSelfTracks])

  // Dismiss the new-comment popover on Escape or an outside click.
  useEffect(() => {
    if (!commentDraft) return
    const close = () => { setCommentDraft(null); setCommentText('') }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onDown = (e: MouseEvent) => {
      if (commentPopRef.current && !commentPopRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [commentDraft])

  // Open the composer anchored to the current non-empty selection.
  const openCommentDraft = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const { from, to } = ed.state.selection
    if (from === to) return
    const coords = ed.view.coordsAtPos(to)
    setCommentText('')
    setCommentDraft({ from, to, x: coords.left, y: coords.bottom })
  }, [])

  // Persist the comment, then paint the highlight over the captured source range.
  const submitComment = useCallback(async () => {
    const ed = editorRef.current
    const draft = commentDraft
    const body = commentText.trim()
    if (!ed || !draft || !body || !onCreateComment) return
    const anchor = rangeToAnchor(ed, draft.from, draft.to)
    if (!anchor) { setCommentDraft(null); return }
    setCommentSaving(true)
    try {
      const created = await onCreateComment({ ...anchor, body })
      if (created) applyCommentMark(ed, draft.from, draft.to, created.id)
      setCommentDraft(null)
      setCommentText('')
    } finally {
      setCommentSaving(false)
    }
  }, [commentDraft, commentText, onCreateComment])

  if (!editor) return null

  /* ── Undo/redo driven straight off the Yjs UndoManager (SPEC A2) ────────────
     Reading undoStack/redoStack length is reliable (unlike TipTap's can().undo()
     under Collaboration, which returns false spuriously), so the buttons can be
     correctly disabled instead of silently no-op'ing. Ctrl+Z / Ctrl+Y keep working
     via the Collaboration extension's own keymap. */
  // Undo/redo target follows the active mode: in draw mode they drive the drawing
  // UndoManager (ADR 0005 D4); otherwise the text (y-prosemirror) stack.
  const undoManager = yUndoPluginKey.getState(editor.state)?.undoManager
  const drawingMode = mode === 'draw'
  const canUndo = drawingMode ? drawUndo.undoStack.length > 0 : (undoManager?.undoStack.length ?? 0) > 0
  const canRedo = drawingMode ? drawUndo.redoStack.length > 0 : (undoManager?.redoStack.length ?? 0) > 0
  const doUndo = () => {
    if (drawingMode) { ensureSelfTracks(drawUndo); drawUndo.undo(); return }
    const e = editorRef.current
    if (e) { ensureSelfTracks(yUndoPluginKey.getState(e.state)?.undoManager); yUndo(e.state); e.view.focus() }
  }
  const doRedo = () => {
    if (drawingMode) { ensureSelfTracks(drawUndo); drawUndo.redo(); return }
    const e = editorRef.current
    if (e) { ensureSelfTracks(yUndoPluginKey.getState(e.state)?.undoManager); yRedo(e.state); e.view.focus() }
  }

  // Shared toolbar button base: soft hover transition + tactile press (active:scale) +
  // keyboard focus ring (a11y — buttons preventDefault on mousedown so the ring shows on
  // Tab focus, not on click). transition covers color+transform so the press reads; under
  // prefers-reduced-motion the global reset zeroes the duration, so it just snaps.
  const btnBase =
    'grid h-8 min-w-8 place-items-center rounded-lg px-2 text-body-sm font-semibold ' +
    'transition duration-150 active:scale-95 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-card'
  const btnIdle = 'text-muted hover:bg-ink/5 hover:text-ink'
  // One divider style everywhere so the toolbar rhythm stays even (DESIGN_SPEC).
  const dividerCls = 'mx-1.5 h-5 w-px flex-shrink-0 bg-line'
  // Native selects: match the button chrome + a calm focus ring instead of a hard outline.
  const selectCls =
    'h-8 flex-shrink-0 rounded-lg border border-line bg-card px-2 text-body-sm transition duration-150 ' +
    'hover:border-ink/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-card'

  const MODE_TABS: { key: EditorMode; label: string }[] = [
    { key: 'write', label: t('editor.write') },
    { key: 'draw', label: t('editor.draw') },
    { key: 'insert', label: t('editor.insert') },
  ]

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const order = MODE_TABS.map((m) => m.key)
    const i = order.indexOf(mode)
    let next = i
    if (e.key === 'ArrowRight') next = (i + 1) % order.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + order.length) % order.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = order.length - 1
    else return
    e.preventDefault()
    setMode(order[next])
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="flex flex-col">
      {!readOnly && (
        <div className="sticky top-0 z-10 mb-3 rounded-xl border border-line bg-card shadow-soft">
          {/* Row 1 — mode switch (left) + undo/redo (shared across modes, right). Fixed
              height so the toolbar never jumps when the contextual row swaps (SPEC B). */}
          <div className="flex h-10 items-center gap-2 border-b border-line px-1.5">
            <div
              role="tablist"
              aria-label={t('editor.modesLabel')}
              onKeyDown={onTabKeyDown}
              className="inline-flex items-center gap-0.5 rounded-lg bg-paper p-0.5"
            >
              {MODE_TABS.map((m, i) => {
                const active = mode === m.key
                return (
                  <button
                    key={m.key}
                    ref={(el) => { tabRefs.current[i] = el }}
                    type="button"
                    role="tab"
                    id={`tab-${m.key}`}
                    aria-selected={active}
                    aria-controls={`toolbar-row-${m.key}`}
                    tabIndex={active ? 0 : -1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setMode(m.key)}
                    className={cn(
                      'h-8 rounded-md px-3 text-body-sm font-medium transition duration-150 active:scale-[0.97]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-paper',
                      active ? 'bg-card text-ink shadow-soft' : 'text-muted hover:bg-ink/5 hover:text-ink',
                    )}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                <button
                  type="button" title="ย้อนกลับ (Ctrl+Z)" aria-label="ย้อนกลับ"
                  disabled={!canUndo}
                  onMouseDown={(e) => e.preventDefault()} onClick={doUndo}
                  className={cn('grid h-8 w-8 place-items-center rounded-lg transition duration-150 active:scale-95', btnIdle, !canUndo && 'opacity-40 hover:bg-transparent hover:text-muted active:scale-100')}
                >
                  <Icon.undo width={16} height={16} />
                </button>
                <button
                  type="button" title="ทำซ้ำ (Ctrl+Y)" aria-label="ทำซ้ำ"
                  disabled={!canRedo}
                  onMouseDown={(e) => e.preventDefault()} onClick={doRedo}
                  className={cn('grid h-8 w-8 place-items-center rounded-lg transition duration-150 active:scale-95', btnIdle, !canRedo && 'opacity-40 hover:bg-transparent hover:text-muted active:scale-100')}
                >
                  <Icon.redo width={16} height={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Row 2 — contextual controls for the current mode. Fixed height + horizontal
              scroll so fewer buttons never reflow the bar (SPEC B / DESIGN_SPEC §29). */}
          <div className="flex h-11 items-center gap-0.5 overflow-x-auto px-1.5">
            {mode === 'write' && (
              <div id="toolbar-row-write" role="tabpanel" aria-labelledby="tab-write" className="flex items-center gap-0.5">
                {/* SPEC 2 — Font family + size. stopPropagation (not preventDefault) on mousedown:
                    a native <select> needs to take focus to open, unlike the toolbar buttons. */}
                <select
                  value={editor.getAttributes('textStyle').fontFamily ?? ''}
                  onChange={(e) => {
                    if (e.target.value) editor.chain().focus().setFontFamily(e.target.value).run()
                    else editor.chain().focus().unsetFontFamily().run()
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="แบบอักษร"
                  className={selectCls}
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
                  className={cn(selectCls, 'w-[4.5rem]')}
                >
                  <option value="">–</option>
                  {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className={dividerCls} />

                {GROUPS.map((group, gi) => (
                  <div key={gi} className="flex flex-shrink-0 items-center gap-0.5">
                    {gi > 0 && <span className={dividerCls} />}
                    {group.map((b) => {
                      const IconCmp = b.icon ? Icon[b.icon] : null
                      const active = b.active?.(editor) ?? false
                      return (
                        <button
                          key={b.key}
                          type="button"
                          title={b.title}
                          aria-label={b.title}
                          aria-pressed={b.active ? active : undefined}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => b.run(editor)}
                          className={cn(btnBase, active ? 'bg-primary-soft text-primary' : btnIdle)}
                        >
                          {IconCmp ? <IconCmp width={16} height={16} /> : b.text}
                        </button>
                      )
                    })}
                  </div>
                ))}

                <span className={dividerCls} />
                <button
                  type="button" title="แทรกตาราง" aria-label="แทรกตาราง"
                  onMouseDown={(e) => e.preventDefault()} onClick={insertTable}
                  className={cn(btnBase, 'flex-shrink-0', btnIdle)}
                >
                  <Icon.table width={16} height={16} />
                </button>
                <button
                  type="button" title={t('tasklist.insert')} aria-label={t('tasklist.insert')}
                  aria-pressed={editor.isActive('taskList')}
                  onMouseDown={(e) => e.preventDefault()} onClick={toggleChecklist}
                  className={cn(btnBase, 'flex-shrink-0', editor.isActive('taskList') ? 'bg-primary-soft text-primary' : btnIdle)}
                >
                  <Icon.checklist width={16} height={16} />
                </button>
              </div>
            )}

            {mode === 'draw' && (
              <div id="toolbar-row-draw" role="tabpanel" aria-labelledby="tab-draw" className="flex items-center gap-0.5">
                {/* Tools: pen / highlighter / eraser */}
                {DRAW_TOOLS.map((tl) => {
                  const IconCmp = Icon[tl.icon]
                  const activeTool = drawTool === tl.key
                  return (
                    <button
                      key={tl.key}
                      type="button" title={t(tl.titleKey)} aria-label={t(tl.titleKey)}
                      aria-pressed={activeTool}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => setDrawTool(tl.key)}
                      className={cn(btnBase, 'flex-shrink-0', activeTool ? 'bg-primary-soft text-primary' : btnIdle)}
                    >
                      <IconCmp width={16} height={16} />
                    </button>
                  )
                })}
                <span className={dividerCls} />

                {/* Ink colors + free picker */}
                <div className="flex flex-shrink-0 items-center gap-1">
                  {DRAW_COLORS.map((c) => (
                    <button
                      key={c} type="button" aria-label={`${t('editor.penColor')} ${c}`}
                      aria-pressed={drawColor === c}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => setDrawColor(c)}
                      className={cn(
                        'size-6 flex-shrink-0 rounded-full ring-offset-2 ring-offset-card transition duration-150 hover:scale-110 active:scale-95',
                        c === '#ffffff' && 'border border-line',
                        drawColor === c ? 'ring-2 ring-primary shadow-soft' : 'hover:shadow-soft',
                      )}
                      style={{ background: c }}
                    />
                  ))}
                  <label
                    className="grid size-6 flex-shrink-0 cursor-pointer place-items-center rounded-full border border-line"
                    title={t('editor.penColor')} style={{ background: drawColor }}
                  >
                    <input
                      type="color" value={drawColor} onChange={(e) => setDrawColor(e.target.value)}
                      className="size-0 opacity-0" aria-label={t('editor.penColor')}
                    />
                  </label>
                </div>
                <span className={dividerCls} />

                {/* Brush sizes */}
                <div className="flex flex-shrink-0 items-center gap-0.5" role="group" aria-label={t('editor.brushSize')}>
                  {DRAW_SIZES.map((s) => (
                    <button
                      key={s} type="button" title={`${t('editor.brushSize')} ${s}`} aria-label={`${t('editor.brushSize')} ${s}`}
                      aria-pressed={drawSize === s}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => setDrawSize(s)}
                      className={cn('grid size-8 flex-shrink-0 place-items-center rounded-lg transition duration-150 active:scale-90', drawSize === s ? 'bg-primary-soft' : 'hover:bg-ink/5')}
                    >
                      <span className={cn('rounded-full transition-colors', drawSize === s ? 'bg-primary' : 'bg-ink')} style={{ width: Math.min(s + 2, 16), height: Math.min(s + 2, 16) }} />
                    </button>
                  ))}
                </div>
                <span className={dividerCls} />

                <button
                  type="button" title={t('editor.clearDrawing')} aria-label={t('editor.clearDrawing')}
                  onMouseDown={(e) => e.preventDefault()} onClick={clearDrawing}
                  className={cn(btnBase, 'flex-shrink-0', btnIdle)}
                >
                  <Icon.trash width={16} height={16} />
                </button>
                <span className="ml-1 flex-shrink-0 text-caption text-muted">{t('editor.stylusHint')}</span>
              </div>
            )}

            {mode === 'insert' && (
              <div id="toolbar-row-insert" role="tabpanel" aria-labelledby="tab-insert" className="flex items-center gap-0.5">
                <button
                  type="button" title={t('editor.insertImage')} aria-label={t('editor.insertImage')}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()}
                  className={cn(btnBase, 'flex-shrink-0', btnIdle)}
                >
                  <Icon.image width={16} height={16} />
                </button>
                <span className={dividerCls} />
                <button
                  type="button" title={t('editor.insertBox')} aria-label={t('editor.insertBox')}
                  onMouseDown={(e) => e.preventDefault()} onClick={insertBox}
                  className={cn(btnBase, 'flex-shrink-0', btnIdle)}
                >
                  <Icon.box width={16} height={16} />
                </button>
                <button
                  type="button" title={t('editor.deleteBox')} aria-label={t('editor.deleteBox')}
                  disabled={!editor.isActive('box')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const { $from } = editor.state.selection
                    for (let d = $from.depth; d > 0; d--) {
                      if ($from.node(d).type.name === 'box') {
                        editor.chain().focus().deleteRange({ from: $from.before(d), to: $from.after(d) }).run()
                        break
                      }
                    }
                  }}
                  className={cn(btnBase, 'flex-shrink-0', btnIdle, !editor.isActive('box') && 'opacity-40 hover:bg-transparent hover:text-muted')}
                >
                  <Icon.trash width={16} height={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image upload progress / error cards (SPEC A1). Local only — never in the CRDT. */}
      {!readOnly && uploads.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {uploads.map((u) =>
            u.status === 'uploading' ? (
              <div
                key={u.id}
                className="flex max-w-[320px] animate-pop items-center gap-3 rounded-xl border border-line bg-card p-3 text-body-sm text-muted shadow-soft"
                role="status"
              >
                <svg className="animate-spin flex-shrink-0" width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{t('editor.uploading')}</div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={u.id}
                className="flex max-w-[360px] animate-pop items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3 text-body-sm text-danger shadow-soft"
                role="alert"
              >
                <Icon.warning width={16} height={16} />
                <span className="min-w-0 flex-1 truncate">{u.message ?? t('editor.uploadFailed')}</span>
                {u.blob && (
                  <button type="button" onClick={() => retryUpload(u.id)} className="flex-shrink-0 font-medium underline hover:no-underline">
                    {t('editor.retry')}
                  </button>
                )}
                <button type="button" onClick={() => dismissUpload(u.id)} className="flex-shrink-0 text-muted hover:text-ink">
                  {t('editor.dismiss')}
                </button>
              </div>
            ),
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onImagePick} />

      {/* SPEC 4 — Table controls, shown only while the caret sits inside a table. */}
      {!readOnly && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor }) => editor.isActive('table')}
          tippyOptions={{ placement: 'top', duration: 100, zIndex: 20 }}
          className="flex flex-wrap items-center gap-0.5 rounded-xl border border-line bg-card p-1 shadow-pop"
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
                  'rounded-md px-1.5 py-1 text-caption font-medium text-muted transition duration-150 hover:bg-ink/5 hover:text-ink active:scale-95',
                  disabled && 'opacity-40 hover:bg-transparent active:scale-100',
                )}
              >
                {a.title}
              </button>
            )
          })}
        </BubbleMenu>
      )}

      {/* Comment affordance — appears on any non-empty text selection (Sprint 4). Distinct
          pluginKey so it coexists with the table BubbleMenu above. Viewer+ by design (SRS
          §2): commenting is allowed even when the document itself is read-only — do NOT
          gate this on `!readOnly`, that would silently hide it for every Viewer. */}
      {canComment && (
        <BubbleMenu
          editor={editor}
          pluginKey="commentBubble"
          shouldShow={({ editor, state }) =>
            !editor.isActive('table') && !state.selection.empty && state.selection.from !== state.selection.to
          }
          tippyOptions={{ placement: 'top', duration: 100, zIndex: 20 }}
          className="rounded-lg border border-line bg-card p-1 shadow-soft"
        >
          <button
            type="button"
            title={t('comments.addComment')}
            aria-label={t('comments.addComment')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openCommentDraft}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-[12px] font-medium text-muted hover:bg-ink/5 hover:text-ink"
          >
            <Icon.comment width={15} height={15} /> {t('comments.addComment')}
          </button>
        </BubbleMenu>
      )}

      {/* New-comment composer — fixed to the selection's end coords, anchored to the captured
          range (not the live selection) so typing here cannot drift the highlight. */}
      {commentDraft && (
        <div
          ref={commentPopRef}
          className="fixed z-40 w-72 rounded-xl border border-line bg-card p-2.5 shadow-pop animate-pop"
          style={{ left: Math.min(commentDraft.x, window.innerWidth - 300), top: commentDraft.y + 6 }}
          role="dialog"
          aria-label={t('comments.addComment')}
        >
          <textarea
            autoFocus
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={t('comments.placeholder')}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (commentText.trim()) submitComment() }
            }}
            className="w-full resize-y rounded-lg border border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-subtle focus:border-primary"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setCommentDraft(null); setCommentText('') }}
              className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted hover:bg-ink/5"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={submitComment}
              disabled={!commentText.trim() || commentSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {commentSaving && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              {t('comments.send')}
            </button>
          </div>
        </div>
      )}

      {/* SPEC 1 — A4 page surface (portrait/landscape). Padding is the 1-inch page margin.
          The drawing overlay (ADR 0005) sits absolutely over this same box; .tb-page is
          already position:relative. Pointer capture is on only in draw mode. */}
      <div className={cn('tb-page', orientation === 'landscape' ? 'tb-page--landscape' : 'tb-page--portrait')}>
        <EditorContent editor={editor} />
        <DrawingOverlay
          ydoc={ydoc}
          active={mode === 'draw' && !readOnly}
          readOnly={readOnly}
          orientation={orientation}
          tool={drawTool}
          color={drawColor}
          size={drawSize}
          onStrokesChange={onDrawingsSvgChange}
        />
      </div>
    </div>
  )
}
