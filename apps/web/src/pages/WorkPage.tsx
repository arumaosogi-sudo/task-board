// /projects/:id/work — Phase 3 (complete): file tree + rich document editor
// (text/format, image, freehand drawing w/ stylus, Box) + undo/redo + autosave + PDF export.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/react'
import { Button, Field, Input, Menu, MenuItem, Modal, Segmented } from '../components/ui'
import type { PresenceUser } from '../components/CollabEditor'
import { HistoryModal } from '../components/HistoryModal'
import { useComments, useCreateComment } from '../lib/comments'
import { ProjectActivityDrawer } from '../components/ProjectActivityDrawer'
import { SharePanel } from '../components/SharePanel'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'
import { useAuth } from '../lib/auth'
import { getFreshAccessToken } from '../lib/api'
import { colorFromKey, initialOf } from '../lib/presence'
import { useProject } from '../lib/projects'
import { RevisionsApi, normalizeCommitLabel, useCreateRevision } from '../lib/revisions'
import {
  FilesApi,
  useCreateFile, useDeleteFile, useFile, useFileTree, useSaveContent,
  type FileNode,
} from '../lib/files'
import { REPORT_TEMPLATES, templateContent, type TemplateId } from '../lib/templates'
import type { Language } from '../i18n'

// Lazy-loaded: TipTap + Yjs + Hocuspocus is a heavy bundle (~800KB). Split it out
// so the file tree / landing shell paints without waiting for the editor chunk.
const CollabEditor = lazy(() =>
  import('../components/CollabEditor').then((m) => ({ default: m.CollabEditor })),
)
// Lazy too: CommentsPanel pulls the Yjs anchor helpers (yjs / y-prosemirror). Keeping it out
// of the eager route bundle stops those heavy deps from loading on non-editor pages (rule #9).
const CommentsPanel = lazy(() =>
  import('../components/CommentsPanel').then((m) => ({ default: m.CommentsPanel })),
)

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// Isolates editor crashes (a thrown render in CollabEditor / DrawingCanvas / any lazy
// chunk) so a failure paints an inline recoverable panel instead of unmounting the whole
// WorkPage and leaving a blank/black screen. The "try again" button clears the error and
// re-attempts the current doc.
class EditorErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[EditorErrorBoundary]', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <p className="text-lg font-semibold text-ink">เกิดข้อผิดพลาดใน Editor</p>
          <p className="mt-1 text-sm text-muted">{this.state.error.message}</p>
          <button
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-fg"
            onClick={() => this.setState({ error: null })}
          >
            ลองใหม่
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Auto-snapshot: create a silent revision after the user pauses editing this long.
const AUTO_SNAPSHOT_MS = 5 * 60 * 1000 // 5 minutes

// Depth-first flatten of the file tree — used to resolve the `?file=` deep-link and
// (potentially) any other id-based lookups without walking the nested structure by hand.
function flattenTree(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)])
}

function TreeItem({
  node, depth, selectedId, onSelect, onDelete, canEdit,
}: {
  node: FileNode; depth: number; selectedId: string | null
  onSelect: (n: FileNode) => void; onDelete: (n: FileNode) => void; canEdit: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const isFolder = node.kind === 'Folder'
  const selected = node.id === selectedId
  return (
    <div>
      <div
        className={cn('group flex items-center gap-1.5 rounded-lg pr-1.5 text-sm', selected ? 'bg-primary-soft text-primary' : 'hover:bg-ink/5')}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <button
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
          onClick={() => (isFolder ? setOpen((o) => !o) : onSelect(node))}
        >
          {isFolder
            ? <Icon.folder width={15} height={15} className="shrink-0 text-muted" />
            : <span className="grid size-[15px] shrink-0 place-items-center text-[10px] text-muted">▦</span>}
          <span className="truncate">{node.name}</span>
        </button>
        {canEdit && (
          <button
            className="hidden size-6 place-items-center rounded text-subtle hover:text-danger group-hover:grid"
            onClick={() => onDelete(node)} aria-label={t('common.delete')}
          >
            <Icon.trash width={14} height={14} />
          </button>
        )}
      </div>
      {isFolder && open && node.children.map((c) => (
        <TreeItem key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} canEdit={canEdit} />
      ))}
    </div>
  )
}

// Selectable template cards for the "New file" modal. A real radiogroup (roving focus +
// arrow keys + aria-checked) — not decorative feature cards — per UI_GUIDELINES.
function TemplatePicker({ value, onChange }: { value: TemplateId; onChange: (v: TemplateId) => void }) {
  const { t } = useTranslation()
  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight'
    const next = (idx + (forward ? 1 : REPORT_TEMPLATES.length - 1)) % REPORT_TEMPLATES.length
    onChange(REPORT_TEMPLATES[next].id)
  }
  return (
    <div role="radiogroup" aria-label={t('templates.startFrom')} className="grid grid-cols-2 gap-2">
      {REPORT_TEMPLATES.map((tpl, idx) => {
        const active = tpl.id === value
        return (
          <button
            key={tpl.id}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tpl.id)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={cn(
              'flex flex-col gap-0.5 rounded-xl border p-3 text-left transition-colors',
              active
                ? 'border-primary bg-primary-soft/60 shadow-soft'
                : 'border-line bg-card hover:border-primary/40',
            )}
          >
            <span className={cn('text-body-sm font-semibold', active ? 'text-primary' : 'text-ink')}>
              {t(tpl.labelKey)}
            </span>
            <span className="text-caption leading-snug text-muted">{t(tpl.descKey)}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function WorkPage() {
  const { t, i18n } = useTranslation()
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { data: project } = useProject(id)
  const { data: tree, isLoading: treeLoading } = useFileTree(id)
  const create = useCreateFile(id)
  const del = useDeleteFile(id)
  const [searchParams, setSearchParams] = useSearchParams()
  const fileFromUrl = searchParams.get('file')
  const historyFromUrl = searchParams.get('history') === '1'

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: doc } = useFile(id, selectedId)
  const save = useSaveContent(id, selectedId ?? '')

  const [content, setContent] = useState('')
  // Serialized <svg> of the inline drawing layer (ADR 0005) — kept out of `content`
  // (getHTML) to avoid the legacy-seed duplication path; injected into the PDF export.
  const [drawingsSvg, setDrawingsSvg] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newOrientation, setNewOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [newTemplate, setNewTemplate] = useState<TemplateId>('blank')
  const [toDelete, setToDelete] = useState<FileNode | null>(null)
  const [presence, setPresence] = useState<PresenceUser[]>([])
  const [connStatus, setConnStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  // Tracks the moment the doc was last edited locally, so the Share panel can flag when
  // the published snapshot is older than the current document (SRS §3 publish badge).
  const [lastEditedAt, setLastEditedAt] = useState<string | null>(null)
  const [editorApi, setEditorApi] = useState<Editor | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  // Manual "Commit" (git-style versioned save with an optional message) — separate from the
  // silent 5-min auto-snapshot, which stays as-is as a safety net.
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; msg: string } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()
  const commitRevision = useCreateRevision(id, selectedId ?? '')
  const [exporting, setExporting] = useState<'word' | 'md' | null>(null)

  const canEdit = project?.myRole === 'Owner' || project?.myRole === 'Editor'
  const isOwner = project?.myRole === 'Owner'
  // Commenting is Viewer+ by design (SRS §2) — any project member can comment/reply,
  // only resolve/reopen requires canEdit (Editor+). Don't reuse canEdit here.
  const canComment = !!project?.myRole
  const loadedDocId = useRef<string | null>(null)

  // Comments for the open document. Loaded whenever a doc is open (drives the header badge
  // count as well as the panel). Not real-time — refetches on mutation (SRS Assumption #2).
  const { data: comments, isLoading: commentsLoading } = useComments(id, doc?.id ?? null, !!doc)
  const createComment = useCreateComment(id, doc?.id ?? '')
  const openCommentCount = (comments ?? []).filter((c) => !c.resolved).length

  // Persist a new comment; the editor paints the highlight from the returned id.
  const handleCreateComment = useCallback(
    async (input: { anchorFrom: unknown; anchorTo: unknown; anchorText: string; body: string }) => {
      try {
        const created = await createComment.mutateAsync(input)
        return { id: created.id }
      } catch {
        return null
      }
    },
    [createComment],
  )

  // A highlight was clicked in the document → open the panel focused on that thread.
  const handleCommentActivate = useCallback((ids: string[]) => {
    if (!ids.length) return
    setActiveCommentId(ids[0])
    setCommentsOpen(true)
  }, [])

  // Roster for @mention autocomplete — derived from the already-cached project detail
  // (no extra request). Shape adapted to what CollabEditor's suggestion needs.
  const mentionMembers = useMemo(
    () => (project?.members ?? []).map((m) => ({ id: m.userId, username: m.username, role: m.role })),
    [project?.members],
  )

  // Auto-snapshot bookkeeping. `lastSnapshotContent` tracks the HTML of the most recent
  // snapshot (seeded from the loaded doc) so we never persist a duplicate; the timer is
  // debounced on every keystroke and flushed on file switch / unmount.
  const lastSnapshotContent = useRef<string>('')
  const autoSnapshotTimer = useRef<ReturnType<typeof setTimeout>>()
  // Latest values captured in refs so the unmount/file-switch flush (whose effect has to
  // run its cleanup with a stable closure) always sees current content and permissions.
  const contentRef = useRef('')
  const canEditRef = useRef(false)
  contentRef.current = content
  canEditRef.current = !!canEdit
  // Tracks the HTML we last persisted to File.content so the file-switch/unmount flush
  // can skip a redundant PUT when nothing changed since the last autosave.
  const savedContentRef = useRef('')

  // Fire-and-forget snapshot: silent, non-blocking, and de-duplicated. Skips empty bodies,
  // viewers, and content identical to the last snapshot to keep the revision feed clean.
  const takeSnapshot = useCallback((projectId: string, fileId: string, html: string) => {
    if (!canEditRef.current) return
    const trimmed = html.trim()
    if (trimmed === '' || html === lastSnapshotContent.current) return
    lastSnapshotContent.current = html
    RevisionsApi.create(projectId, fileId, { content: html }).catch(() => undefined)
  }, [])

  // Access JWT getter for the WS handshake. Async so a token that expired while the
  // socket was down is refreshed *before* the reconnect handshake (Hocuspocus awaits
  // this), instead of the collab server rejecting a stale token in onAuthenticate.
  const getToken = useCallback(() => getFreshAccessToken(), [])
  // Identity for the live cursor — color is derived from the user id so caret + avatar match.
  const collabUser = useMemo(
    () => (user ? { name: user.username, color: colorFromKey(user.id) } : undefined),
    [user],
  )
  // Stable callbacks so CollabEditor doesn't resubscribe awareness on every render.
  const handlePresence = useCallback((users: PresenceUser[]) => setPresence(users), [])
  const handleStatus = useCallback((s: 'connecting' | 'connected' | 'disconnected') => setConnStatus(s), [])
  const handleReady = useCallback((e: Editor | null) => setEditorApi(e), [])

  // Live document HTML (for snapshots + diff) — read straight from the editor when open.
  const currentHtml = historyOpen ? (editorApi?.getHTML() ?? content) : content

  // CRDT-safe restore: write the snapshot back into the live editor so it syncs to
  // everyone and persists via the collab server — never a direct DB overwrite.
  const restoreRevision = useCallback((html: string) => {
    editorApi?.chain().focus().setContent(html).run()
  }, [editorApi])

  // Transient confirmation/error toast (auto-dismisses). Reuses the project's token palette
  // (add/del surfaces) rather than a new notification system.
  const showToast = useCallback((tone: 'success' | 'error', msg: string) => {
    setToast({ tone, msg })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Manual commit: persist a revision IMMEDIATELY (bypasses the 5-min auto-snapshot debounce)
  // using the editor's current HTML + the optional message as the revision label. Distinct
  // from takeSnapshot so the auto-snapshot path is untouched. Editor+ only (mirrors autosave).
  async function doCommit() {
    if (!doc || !canEdit || commitRevision.isPending) return
    const html = editorApi?.getHTML() ?? content
    const label = normalizeCommitLabel(commitMsg) // trim + cap at DTO limit, empty → undefined
    try {
      await commitRevision.mutateAsync({ content: html, label })
      // Keep the auto-snapshot baseline in sync so it doesn't immediately re-save identical
      // content moments later.
      lastSnapshotContent.current = html
      setCommitOpen(false)
      setCommitMsg('')
      showToast('success', t('commit.done'))
    } catch {
      showToast('error', t('commit.failed'))
    }
  }

  // Sync local content when a different document loads; reset per-doc collab state.
  useEffect(() => {
    if (doc) {
      setContent(doc.content); loadedDocId.current = doc.id; setStatus('idle')
      // Baseline the auto-snapshot against the just-loaded content so we never take a
      // redundant snapshot of an unchanged document.
      lastSnapshotContent.current = doc.content
      // Baseline the autosave flush against the loaded content — nothing to flush yet.
      savedContentRef.current = doc.content
    }
    setPresence([]); setConnStatus('connecting'); setDrawingsSvg('')
    setCommentsOpen(false); setActiveCommentId(null)
    setShareOpen(false); setLastEditedAt(null)
  }, [doc?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced autosave (800ms) — only after the user edits the loaded content.
  useEffect(() => {
    if (!selectedId || !doc || doc.id !== loadedDocId.current) return
    if (content === doc.content) return
    setLastEditedAt(new Date().toISOString())
    setStatus('saving')
    const t = setTimeout(async () => {
      try { await save.mutateAsync(content); savedContentRef.current = content; setStatus('saved') }
      catch (err) { console.error('[autosave] failed:', err); setStatus('error') }
    }, 800)
    return () => clearTimeout(t)
  }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-snapshot (debounced 5 min): after the user stops typing, silently persist a
  // revision so the "My Updates" / "Project Changes" feeds have history without the user
  // manually saving versions. Guards mirror takeSnapshot (no empty / no-op / viewer).
  useEffect(() => {
    if (!selectedId || !doc || doc.id !== loadedDocId.current) return
    if (!canEdit) return
    if (content.trim() === '' || content === lastSnapshotContent.current) return
    const pid = id
    const fid = doc.id
    clearTimeout(autoSnapshotTimer.current)
    autoSnapshotTimer.current = setTimeout(() => takeSnapshot(pid, fid, content), AUTO_SNAPSHOT_MS)
    return () => clearTimeout(autoSnapshotTimer.current)
  }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

  // Flush a snapshot immediately when switching files / unmounting, so a pending debounce
  // isn't lost. Reads live content from the ref; takeSnapshot de-dupes against the last one.
  // Also flush the pending File.content autosave so a fast file-switch / tab-close before
  // the 800ms debounce fires doesn't drop the tail edit. We PUT against the OUTGOING file's
  // id (`fid`) via FilesApi directly — the `save` hook is bound to the new selectedId by the
  // time cleanup runs, so using it would save to the wrong file.
  useEffect(() => {
    if (!doc) return
    const pid = id
    const fid = doc.id
    return () => {
      clearTimeout(autoSnapshotTimer.current)
      const latest = contentRef.current
      takeSnapshot(pid, fid, latest)
      if (canEditRef.current && latest.trim() !== '' && latest !== savedContentRef.current) {
        savedContentRef.current = latest
        FilesApi.saveContent(pid, fid, latest).catch((err) =>
          console.error('[autosave] flush on switch/unmount failed:', err),
        )
      }
    }
  }, [doc?.id, id, takeSnapshot]) // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link support (?file=<id>): auto-select the referenced document once the tree is
  // loaded. Applied once per distinct id so background tree refetches don't yank the user
  // back to the linked file after they've navigated elsewhere.
  const appliedFileLink = useRef<string | null>(null)
  useEffect(() => {
    if (!fileFromUrl || !tree) return
    if (appliedFileLink.current === fileFromUrl) return
    const found = flattenTree(tree).find((n) => n.id === fileFromUrl && n.kind === 'Document')
    if (found) { appliedFileLink.current = fileFromUrl; setSelectedId(found.id) }
  }, [fileFromUrl, tree])

  // Deep-link support (?history=1): auto-open the version-history modal for the linked
  // file once it's actually loaded (the Activity drawer links here via "view all history").
  // Applied once, then the `history` param is stripped so closing the modal or a later
  // navigation doesn't reopen it. Waits for `doc` so HistoryModal (which only mounts with a
  // loaded doc) targets the right file.
  const appliedHistoryLink = useRef(false)
  useEffect(() => {
    if (!historyFromUrl || appliedHistoryLink.current) return
    if (!doc || !selectedId) return
    if (fileFromUrl && doc.id !== fileFromUrl) return // wait until the linked file loads
    appliedHistoryLink.current = true
    setHistoryOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('history')
    setSearchParams(next, { replace: true })
  }, [historyFromUrl, doc, selectedId, fileFromUrl, searchParams, setSearchParams])

  // Dependency-free PDF export: open the document in a print window → "Save as PDF".
  // Renders as real, multi-page A4 (like Word) rather than one long column:
  //   • @page defines the physical A4 size + a 25.4mm (1-inch) margin, matching the
  //     editor's .tb-page padding (96px @ 96dpi). The printable content box then equals
  //     the editor's content area (portrait 210mm−2×25.4mm ≈ 601.7px vs 794−192 = 602px;
  //     landscape ≈ 930.5px vs 1123−192 = 931px), so text wraps identically to what the
  //     author sees while writing — no reflow.
  //   • The app's Google Fonts (incl. Noto Sans Thai) are @import-ed into the print
  //     window and we wait on document.fonts.ready before printing, so Thai renders with
  //     the correct shaping font instead of a broken system fallback.
  //   • Atomic blocks (headings, list items, table rows, boxes, images) get
  //     break-inside:avoid so a page break never slices through them; long paragraphs are
  //     intentionally left splittable so they flow across pages naturally.
  function exportPdf() {
    if (!doc) return
    const body = content || doc.content || '<p></p>'
    const landscape = doc.orientation === 'landscape'
    const w = window.open('', '_blank', 'width=900,height=1000')
    if (!w) return
    const safeName = doc.name.replace(/[<>&]/g, '')
    // Same font set as apps/web/src/index.css line 1 — keep in sync if that @import changes.
    const fontImport =
      "@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700" +
      '&family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700' +
      "&family=JetBrains+Mono:wght@400;500;700&display=swap');"
    const css =
      `${fontImport}` +
      // Physical A4 page + 1-inch margin === editor's .tb-page 96px padding.
      `@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:25.4mm}` +
      `*{box-sizing:border-box}html,body{margin:0;padding:0}` +
      // Base type mirrors the editor's editable surface EXACTLY — CollabEditor.tsx renders
      // .tb-prose as `text-[15px] leading-relaxed` (15px / line-height 1.625). Matching both
      // the font-size and the content-box width (via @page margin) is what makes the export
      // wrap line-for-line like the on-screen A4 page. color-adjust:exact keeps box/table
      // fills and highlighter strokes through the print pipeline.
      `body{font-family:'Inter','Noto Sans Thai',sans-serif;font-size:15px;line-height:1.625;` +
      `color:#1d2333;-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
      // Headings mirror .tb-prose (Sora, matching sizes/weights) so wrapping matches.
      `h1{font-family:'Sora','Noto Sans Thai',sans-serif;font-size:24px;font-weight:700;line-height:1.25;margin:16px 0 8px}` +
      `h2{font-family:'Sora','Noto Sans Thai',sans-serif;font-size:20px;font-weight:600;line-height:1.3;margin:12px 0 8px}` +
      `h3{font-family:'Sora','Noto Sans Thai',sans-serif;font-size:17px;font-weight:600;line-height:1.4;margin:10px 0 6px}` +
      `p{margin:8px 0}ul,ol{margin:8px 0;padding-left:24px}li{margin:2px 0}` +
      `a{color:#4f46e5;text-decoration:underline}img{max-width:100%;border-radius:8px}svg{max-width:100%;height:auto}` +
      `table{width:100%;border-collapse:collapse;margin:16px 0}` +
      `th,td{border:1px solid #d6dae4;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f3f4f8;font-weight:600}` +
      `.tb-box{border-left:4px solid #7c5cff;background:#f3f0ff;border-radius:10px;padding:10px 14px;margin:12px 0}` +
      // Task/checklist blocks — flatten the list bullets and lay the checkbox beside its text.
      `ul[data-type="taskList"]{list-style:none;padding-left:0;margin:8px 0}` +
      `ul[data-type="taskList"] li{display:flex;align-items:flex-start;gap:8px;margin:4px 0}` +
      `ul[data-type="taskList"] li>label{margin-top:2px}ul[data-type="taskList"] li>div{flex:1;min-width:0}` +
      `ul[data-type="taskList"] li>div>p{margin:0}` +
      // Keep atomic blocks whole across the A4 page boundary. Paragraphs are deliberately
      // NOT listed — they split across pages like a Word document.
      `h1,h2,h3,h4,li,tr,img,.tb-box,blockquote{break-inside:avoid;page-break-inside:avoid}` +
      // Don't strand a heading at the very bottom of a page, orphaned from its content.
      `h1,h2,h3,h4{break-after:avoid;page-break-after:avoid}` +
      // Inline drawing layer (ADR 0005 D5). The overlay SVG is authored in full-page pixel
      // coords (0..794 portrait / 0..1123 landscape, margins included) and is
      // position:absolute over the wrapper. Under real A4 pagination it is anchored to the
      // top of page 1 and scaled to the content box, so shapes/relative position are
      // preserved (owner-accepted limitation) but it does not align to text and does not
      // paginate. Being absolute, it adds no flow height — it can't spawn blank pages.
      `.tb-print-wrap{position:relative}`
    const script =
      '(function(){var done=false;' +
      'function go(){if(done)return;done=true;try{window.focus();window.print()}catch(e){}}' +
      // Wait for the Thai/Latin webfonts before printing; fall back after 3s so a slow or
      // blocked font network can never leave the export stuck un-printed.
      'if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go);setTimeout(go,3000)}' +
      'else{window.onload=go}})();'
    w.document.write(
      `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${safeName}</title>` +
      `<style>${css}</style></head><body>` +
      `<div class="tb-print-wrap">${body}${drawingsSvg}</div>` +
      `<script>${script}</script></body></html>`,
    )
    w.document.close()
  }

  // Freshest HTML for export: prefer the live editor (covers edits newer than the 1s
  // debounced `content` mirror), then the mirror, then the last-persisted body.
  const exportSourceHtml = useCallback(
    () => editorApi?.getHTML() || content || doc?.content || '<p></p>',
    [editorApi, content, doc],
  )

  // Word / Markdown export. The converters are heavy (turndown + html-to-docx), so the
  // module is code-split and dynamically imported only when the user actually exports —
  // it never inflates the main editor bundle. Failures surface a non-blocking alert.
  const handleExportWord = useCallback(async () => {
    if (!doc || exporting) return
    setExporting('word')
    try {
      const { exportWord } = await import('../lib/export/word')
      await exportWord(exportSourceHtml(), doc.name)
    } catch (err) {
      console.error('[export] Word failed:', err)
      alert(t('work.exportFailed'))
    } finally {
      setExporting(null)
    }
  }, [doc, exporting, exportSourceHtml, t])

  const handleExportMarkdown = useCallback(async () => {
    if (!doc || exporting) return
    setExporting('md')
    try {
      const { exportMarkdown } = await import('../lib/export/markdown')
      await exportMarkdown(exportSourceHtml(), doc.name)
    } catch (err) {
      console.error('[export] Markdown failed:', err)
      alert(t('work.exportFailed'))
    } finally {
      setExporting(null)
    }
  }, [doc, exporting, exportSourceHtml, t])

  async function submitCreate() {
    if (!newName.trim()) return
    try {
      // Resolve the template body against the CURRENT UI language (not modal-open time, per
      // SRS edge case). Blank → omit `content` entirely so the backend keeps its '' default
      // path byte-for-byte (no regression for the existing blank-document flow).
      const seed = newTemplate === 'blank' ? undefined : templateContent(newTemplate, i18n.language as Language)
      // Folder creation is disabled — the Work Page only creates Documents now.
      const created = await create.mutateAsync({
        name: newName.trim(),
        kind: 'Document',
        parentId: null,
        orientation: newOrientation,
        ...(seed ? { content: seed } : {}),
      })
      setCreateOpen(false); setNewName(''); setNewOrientation('portrait'); setNewTemplate('blank')
      if (created.kind === 'Document') setSelectedId(created.id)
    } catch { /* surfaced below via banner-less inline; keep simple */ }
  }

  const statusText: Record<SaveStatus, string> = {
    idle: '', saving: t('common.saving'), saved: t('common.saved'), error: t('work.saveFailed'),
  }

  return (
    <div className="flex h-screen flex-col bg-paper">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <Link to="/home" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-ink/5" aria-label={t('work.home')}>
          <Icon.arrowLeft width={18} height={18} />
        </Link>
        <h1 className="truncate font-heading text-[15px] font-semibold">{project?.name ?? t('work.workPage')}</h1>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">{project?.myRole}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setActivityOpen(true)} title={t('work.activity')} aria-label={t('work.activity')}
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-ink/5">
            <Icon.list width={18} height={18} />
          </button>
          <Link to={`/projects/${id}/settings`} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-ink/5" title={t('common.settings')} aria-label={t('common.settings')}>
            <Icon.invite width={18} height={18} />
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* File tree */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-line">
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-caption font-semibold uppercase tracking-wide text-subtle">{t('work.files')}</span>
            {canEdit && (
              <button onClick={() => { setCreateOpen(true); setNewOrientation('portrait'); setNewTemplate('blank') }}
                className="grid size-7 place-items-center rounded-lg text-primary hover:bg-primary-soft" aria-label={t('work.createFile')}>
                <Icon.plus width={16} height={16} />
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
            {treeLoading ? (
              <p className="px-2 py-4 text-body-sm text-muted">{t('common.loading')}</p>
            ) : tree && tree.length > 0 ? (
              tree.map((n) => (
                <TreeItem key={n.id} node={n} depth={0} selectedId={selectedId}
                  onSelect={(node) => setSelectedId(node.id)} onDelete={setToDelete} canEdit={!!canEdit} />
              ))
            ) : (
              <p className="px-2 py-4 text-body-sm text-muted">{t('work.noFiles')}{canEdit ? t('work.noFilesHint') : ''}</p>
            )}
          </div>
        </aside>

        {/* Editor */}
        <main className="flex min-w-0 flex-1 flex-col">
          {!selectedId || !doc ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary"><Icon.folder width={24} height={24} /></div>
                <p className="text-sm text-muted">{t('work.selectDocument')}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
                <span className="truncate text-sm font-medium">{doc.name}</span>
                <span className={cn('text-caption', status === 'error' ? 'text-danger' : 'text-subtle')}>{statusText[status]}</span>
                {connStatus !== 'connected' && (
                  <span className="flex items-center gap-1 text-caption text-warn" title={t('work.connStatus')}>
                    <span className="size-1.5 rounded-full bg-warn" />
                    {connStatus === 'connecting' ? t('work.connecting') : t('work.offline')}
                  </span>
                )}

                {/* Live presence — avatar colors match each peer's cursor color. */}
                {presence.length > 0 && (
                  <div className="ml-auto flex items-center -space-x-2" aria-label={t('work.onlineNow')}>
                    {presence.slice(0, 4).map((p) => (
                      <span key={p.clientId} title={p.name}
                        className="grid size-7 place-items-center rounded-full text-[11px] font-semibold text-white ring-2 ring-card"
                        style={{ background: p.color }}>
                        {initialOf(p.name)}
                      </span>
                    ))}
                    {presence.length > 4 && (
                      <span className="grid size-7 place-items-center rounded-full bg-ink/10 text-[11px] font-semibold text-muted ring-2 ring-card">
                        +{presence.length - 4}
                      </span>
                    )}
                  </div>
                )}

                <button onClick={() => { setActiveCommentId(null); setCommentsOpen(true) }} title={t('comments.title')}
                  className={cn('relative grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5', presence.length === 0 && 'ml-auto')}
                  aria-label={t('comments.title')}>
                  <Icon.comment width={17} height={17} />
                  {openCommentCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 grid min-w-[15px] place-items-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-[15px] text-primary-fg">
                      {openCommentCount}
                    </span>
                  )}
                </button>
                {canEdit && (
                  <button onClick={() => setCommitOpen(true)} title={t('commit.button')}
                    className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5"
                    aria-label={t('commit.button')}>
                    <Icon.commit width={17} height={17} />
                  </button>
                )}
                {isOwner && (
                  <button onClick={() => setShareOpen(true)} title={t('share.manage.title')}
                    className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5"
                    aria-label={t('share.manage.title')}>
                    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                      <path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" />
                    </svg>
                  </button>
                )}
                <button onClick={() => setHistoryOpen(true)} title={t('work.versionHistory')}
                  className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5"
                  aria-label={t('work.versionHistory')}>
                  <Icon.clock width={17} height={17} />
                </button>
                <Menu
                  align="right"
                  trigger={
                    <button
                      title={t('work.export')}
                      aria-label={t('work.export')}
                      aria-busy={exporting !== null}
                      className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5"
                    >
                      {exporting !== null ? (
                        <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      ) : (
                        <Icon.download width={17} height={17} />
                      )}
                    </button>
                  }
                >
                  <MenuItem icon={<Icon.download width={16} height={16} />} onClick={exportPdf}>
                    {t('work.exportPdf')}
                  </MenuItem>
                  <MenuItem icon={<Icon.file width={16} height={16} />} onClick={handleExportWord}>
                    {t('work.exportWord')}
                  </MenuItem>
                  <MenuItem icon={<Icon.file width={16} height={16} />} onClick={handleExportMarkdown}>
                    {t('work.exportMarkdown')}
                  </MenuItem>
                </Menu>
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-ink/[0.02] p-6">
                {/* SPEC 1 — width-fit wrapper so the A4 page surface centers without a Card frame. */}
                <div className="mx-auto w-fit">
                  {/* `key={doc.id}` remounts the boundary on file switch so a crash on one
                      doc doesn't stick when the user navigates to another. */}
                  <EditorErrorBoundary key={doc.id}>
                    <Suspense fallback={
                      <div className="grid place-items-center py-16">
                        <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      </div>
                    }>
                      <CollabEditor
                        key={doc.id}
                        fileId={doc.id}
                        projectId={doc.projectId}
                        token={getToken}
                        initialContent={doc.content}
                        orientation={doc.orientation === 'landscape' ? 'landscape' : 'portrait'}
                        readOnly={!canEdit}
                        onChange={setContent}
                        user={collabUser}
                        onPresenceChange={handlePresence}
                        onStatusChange={handleStatus}
                        onReady={handleReady}
                        members={mentionMembers}
                        onDrawingsSvgChange={setDrawingsSvg}
                        canComment={canComment}
                        onCreateComment={handleCreateComment}
                        onCommentActivate={handleCommentActivate}
                      />
                    </Suspense>
                  </EditorErrorBoundary>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Comments side drawer (Sprint 4). Mounted only once opened so its chunk (with the Yjs
          anchor helpers) is fetched on demand, not with the page. */}
      {selectedId && doc && commentsOpen && (
        <Suspense fallback={null}>
          <CommentsPanel
            open={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            projectId={id}
            fileId={doc.id}
            comments={comments}
            isLoading={commentsLoading}
            editor={editorApi}
            canComment={canComment}
            canResolve={!!canEdit}
            isOwner={!!isOwner}
            currentUserId={user?.id}
            activeCommentId={activeCommentId}
          />
        </Suspense>
      )}

      {/* Project-scoped activity feed (Sprint 4) — reuses useProjectChanges bound to this project */}
      <ProjectActivityDrawer
        projectId={id}
        projectName={project?.name ?? t('work.workPage')}
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
      />

      {/* Public share links (Sprint 4, ADR 0006) — Owner-only management panel. */}
      {selectedId && doc && isOwner && (
        <SharePanel
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          projectId={id}
          fileId={doc.id}
          isEmpty={!content || content.trim() === ''}
          docUpdatedAt={lastEditedAt ?? doc.updatedAt}
          onToast={showToast}
        />
      )}

      {/* Version history + diff (Phase 4.5) */}
      {selectedId && doc && (
        <HistoryModal
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          projectId={id}
          fileId={doc.id}
          fileName={doc.name}
          currentHtml={currentHtml}
          canEdit={!!canEdit}
          onRestore={restoreRevision}
        />
      )}

      {/* Commit — manual versioned save with an optional message (git-style). */}
      <Modal
        open={commitOpen}
        onClose={() => setCommitOpen(false)}
        title={t('commit.title')}
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCommitOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={doCommit} loading={commitRevision.isPending}>
              <Icon.commit width={16} height={16} /> {t('commit.action')}
            </Button>
          </>
        }
      >
        <Field label={t('commit.messageLabel')} htmlFor="commit-msg" optional hint={t('commit.hint')}>
          <Input
            id="commit-msg"
            value={commitMsg}
            maxLength={120}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder={t('commit.placeholder')}
            autoFocus
            aria-label={t('commit.messageLabel')}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doCommit() } }}
          />
        </Field>
      </Modal>

      {/* Toast — transient commit confirmation / error. */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4" role="status" aria-live="polite">
          <div className={cn(
            'pointer-events-auto flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-body-sm shadow-pop animate-pop',
            toast.tone === 'success' ? 'border-success/30 bg-add-bg text-add-fg' : 'border-danger/30 bg-del-bg text-del-fg',
          )}>
            {toast.tone === 'success' ? <Icon.check width={16} height={16} /> : <Icon.warning width={16} height={16} />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Create file/folder */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('work.createFileTitle')}
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={submitCreate} loading={create.isPending} disabled={!newName.trim()}>{t('common.create')}</Button>
          </>
        }
      >
        {/* Folder creation removed (Google Docs-style flat file list). Only Documents
            can be created now; existing folders still render/delete via the tree. */}
        <div className="space-y-4">
          <Field label={t('common.name')} htmlFor="fn">
            <Input id="fn" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder={t('work.documentNamePlaceholder')} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreate() }} />
          </Field>
          <Field label={t('templates.startFrom')}>
            <TemplatePicker value={newTemplate} onChange={setNewTemplate} />
          </Field>
          <Field label={t('work.orientation')}>
            <Segmented value={newOrientation} onChange={setNewOrientation}
              options={[{ value: 'portrait', label: t('work.portrait') }, { value: 'landscape', label: t('work.landscape') }]} />
          </Field>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={t('work.deleteFileTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={del.isPending}
              onClick={async () => {
                if (!toDelete) return
                const removingSelected = toDelete.id === selectedId
                await del.mutateAsync(toDelete.id).catch(() => undefined)
                if (removingSelected) setSelectedId(null)
                setToDelete(null)
              }}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          {toDelete?.kind === 'Folder'
            ? t('work.deleteFolderBody', { name: toDelete?.name })
            : t('work.deleteFileBody', { name: toDelete?.name })}
        </p>
      </Modal>
    </div>
  )
}
