// /projects/:id/work — Phase 3 (complete): file tree + rich document editor
// (text/format, image, freehand drawing w/ stylus, Box) + undo/redo + autosave + PDF export.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/react'
import { Button, Field, Input, Modal, Segmented } from '../components/ui'
import type { PresenceUser } from '../components/CollabEditor'
import { HistoryModal } from '../components/HistoryModal'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'
import { useAuth } from '../lib/auth'
import { getFreshAccessToken } from '../lib/api'
import { colorFromKey, initialOf } from '../lib/presence'
import { useProject } from '../lib/projects'
import { RevisionsApi } from '../lib/revisions'
import {
  FilesApi,
  useCreateFile, useDeleteFile, useFile, useFileTree, useSaveContent,
  type FileNode,
} from '../lib/files'

// Lazy-loaded: TipTap + Yjs + Hocuspocus is a heavy bundle (~800KB). Split it out
// so the file tree / landing shell paints without waiting for the editor chunk.
const CollabEditor = lazy(() =>
  import('../components/CollabEditor').then((m) => ({ default: m.CollabEditor })),
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

export default function WorkPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { data: project } = useProject(id)
  const { data: tree, isLoading: treeLoading } = useFileTree(id)
  const create = useCreateFile(id)
  const del = useDeleteFile(id)
  const [searchParams] = useSearchParams()
  const fileFromUrl = searchParams.get('file')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: doc } = useFile(id, selectedId)
  const save = useSaveContent(id, selectedId ?? '')

  const [content, setContent] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newOrientation, setNewOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [toDelete, setToDelete] = useState<FileNode | null>(null)
  const [presence, setPresence] = useState<PresenceUser[]>([])
  const [connStatus, setConnStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [editorApi, setEditorApi] = useState<Editor | null>(null)

  const canEdit = project?.myRole === 'Owner' || project?.myRole === 'Editor'
  const loadedDocId = useRef<string | null>(null)

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
    setPresence([]); setConnStatus('connecting')
  }, [doc?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced autosave (800ms) — only after the user edits the loaded content.
  useEffect(() => {
    if (!selectedId || !doc || doc.id !== loadedDocId.current) return
    if (content === doc.content) return
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

  // Dependency-free PDF export: open the document in a print window → "Save as PDF".
  function exportPdf() {
    if (!doc) return
    const body = content || doc.content || '<p></p>'
    const w = window.open('', '_blank', 'width=820,height=1000')
    if (!w) return
    const safeName = doc.name.replace(/[<>&]/g, '')
    w.document.write(
      `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${safeName}</title>` +
      `<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:40px auto;padding:0 28px;color:#1d2333;line-height:1.65}` +
      `h1{font-size:24px;border-bottom:1px solid #e5e7eb;padding-bottom:10px;margin:0 0 16px}h2{font-size:19px;margin:20px 0 8px}` +
      `ul,ol{padding-left:24px}a{color:#4f46e5}img{max-width:100%;border-radius:8px}svg{max-width:100%;height:auto}` +
      `.tb-box{border-left:4px solid #7c5cff;background:#f3f0ff;border-radius:10px;padding:10px 14px;margin:12px 0}</style></head><body>` +
      `${body}` +
      `<script>window.onload=function(){window.focus();window.print()}</script></body></html>`,
    )
    w.document.close()
  }

  async function submitCreate() {
    if (!newName.trim()) return
    try {
      // Folder creation is disabled — the Work Page only creates Documents now.
      const created = await create.mutateAsync({
        name: newName.trim(),
        kind: 'Document',
        parentId: null,
        orientation: newOrientation,
      })
      setCreateOpen(false); setNewName(''); setNewOrientation('portrait')
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
        <div className="ml-auto">
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
              <button onClick={() => { setCreateOpen(true); setNewOrientation('portrait') }}
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

                <button onClick={() => setHistoryOpen(true)} title={t('work.versionHistory')}
                  className={cn('grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5', presence.length === 0 && 'ml-auto')}
                  aria-label={t('work.versionHistory')}>
                  <Icon.clock width={17} height={17} />
                </button>
                <button onClick={exportPdf} title={t('work.exportPdf')}
                  className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5" aria-label={t('work.exportPdf')}>
                  <Icon.download width={17} height={17} />
                </button>
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
                        token={getToken}
                        initialContent={doc.content}
                        orientation={doc.orientation === 'landscape' ? 'landscape' : 'portrait'}
                        readOnly={!canEdit}
                        onChange={setContent}
                        user={collabUser}
                        onPresenceChange={handlePresence}
                        onStatusChange={handleStatus}
                        onReady={handleReady}
                      />
                    </Suspense>
                  </EditorErrorBoundary>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

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

      {/* Create file/folder */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('work.createFileTitle')}
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
