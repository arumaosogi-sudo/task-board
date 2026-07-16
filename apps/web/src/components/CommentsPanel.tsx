// Sprint 4 — Comments side drawer.
//
// Slide-in panel (same shell as RevisionDiffDrawer) listing every thread on the open file.
// A segmented tablist filters all / open / resolved; clicking a thread whose highlight still
// resolves jumps + flashes it in the editor. Threads whose highlighted text was later edited
// away render as "orphaned" (no jump, explicit label) per Open Decision #1 option (a).
//
// Comments are plain text (never HTML) — the backend stores/returns raw strings, so rendering
// them as text content carries no XSS surface.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import { Button, EmptyState, Skeleton, Tag } from './ui'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'
import { initialOf } from '../lib/presence'
import {
  useCreateComment,
  useDeleteComment,
  useSetResolved,
  useUpdateComment,
  type CommentDto,
} from '../lib/comments'
import {
  countComments,
  filterComments,
  hasCommentMark,
  removeCommentMark,
  scrollToComment,
  setCommentMarkResolved,
  type CommentFilter,
} from './editor/commentAnchor'

function formatWhen(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

interface CommentsPanelProps {
  open: boolean
  onClose: () => void
  projectId: string
  fileId: string
  comments: CommentDto[] | undefined
  isLoading: boolean
  /** Live editor — enables jump/flash + keeps the in-document highlight in sync. */
  editor: Editor | null
  /** Editor+ may create/reply (matches the backend @MinRole(Editor) on POST). */
  canComment: boolean
  /** Owner/Editor may resolve/reopen. */
  canResolve: boolean
  /** Project Owner may delete anyone's comment; authors may delete their own. */
  isOwner: boolean
  currentUserId?: string
  /** Thread to focus (set when a highlight is clicked in the document). */
  activeCommentId?: string | null
}

function Composer({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  placeholder,
  submitLabel,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel?: () => void
  submitting: boolean
  placeholder: string
  submitLabel: string
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <textarea
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            if (value.trim()) onSubmit()
          }
        }}
        className="w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-body-sm text-ink outline-none transition-colors placeholder:text-subtle focus:border-primary"
      />
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button size="sm" onClick={onSubmit} loading={submitting} disabled={!value.trim()}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

function AuthorLine({ name, when }: { name: string; when: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">
        {initialOf(name)}
      </span>
      <span className="truncate text-body-sm font-medium text-ink">{name}</span>
      <span className="shrink-0 text-caption text-subtle">· {when}</span>
    </div>
  )
}

export function CommentsPanel({
  open,
  onClose,
  projectId,
  fileId,
  comments,
  isLoading,
  editor,
  canComment,
  canResolve,
  isOwner,
  currentUserId,
  activeCommentId,
}: CommentsPanelProps) {
  const { t, i18n } = useTranslation()
  const [filter, setFilter] = useState<CommentFilter>('all')
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const create = useCreateComment(projectId, fileId)
  const update = useUpdateComment(projectId, fileId)
  const del = useDeleteComment(projectId, fileId)
  const setResolved = useSetResolved(projectId, fileId)

  const roots = comments ?? []
  const counts = countComments(roots)
  const visible = filterComments(roots, filter)

  // Which threads still resolve to a live highlight (vs. orphaned). Recomputed when the
  // list changes or the panel (re)opens — not on every keystroke in the doc.
  const anchored = useMemo(() => {
    const map: Record<string, boolean> = {}
    if (editor && open) for (const r of roots) map[r.id] = hasCommentMark(editor, r.id)
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, open, comments])

  // Focus the thread whose highlight was clicked in the document.
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  useEffect(() => {
    if (!open || !activeCommentId) return
    cardRefs.current[activeCommentId]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [open, activeCommentId, comments])

  // Tablist roving focus (a11y — same pattern as the editor mode tabs / ThemeSwitcher).
  const TABS: { key: CommentFilter; label: string; count: number }[] = [
    { key: 'all', label: t('comments.filterAll'), count: counts.all },
    { key: 'open', label: t('comments.filterOpen'), count: counts.open },
    { key: 'resolved', label: t('comments.filterResolved'), count: counts.resolved },
  ]
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const order = TABS.map((x) => x.key)
    const i = order.indexOf(filter)
    let next = i
    if (e.key === 'ArrowRight') next = (i + 1) % order.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + order.length) % order.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = order.length - 1
    else return
    e.preventDefault()
    setFilter(order[next])
    tabRefs.current[next]?.focus()
  }

  async function submitReply(rootId: string) {
    const body = replyText.trim()
    if (!body) return
    await create.mutateAsync({ body, parentId: rootId }).catch(() => undefined)
    setReplyFor(null)
    setReplyText('')
  }

  async function submitEdit(id: string) {
    const body = editText.trim()
    if (!body) return
    await update.mutateAsync({ commentId: id, body }).catch(() => undefined)
    setEditingId(null)
    setEditText('')
  }

  async function doDelete(id: string, isRoot: boolean) {
    await del.mutateAsync(id).catch(() => undefined)
    if (isRoot && editor) removeCommentMark(editor, id)
    setConfirmDelete(null)
  }

  async function toggleResolved(root: CommentDto) {
    const next = !root.resolved
    await setResolved.mutateAsync({ commentId: root.id, resolved: next }).catch(() => undefined)
    if (editor) setCommentMarkResolved(editor, root.id, next)
  }

  function canDelete(c: CommentDto): boolean {
    return c.authorId === currentUserId || isOwner
  }
  function canEdit(c: CommentDto): boolean {
    return c.authorId === currentUserId
  }

  function renderActions(c: CommentDto, isRoot: boolean) {
    const editing = editingId === c.id
    if (editing) return null
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
        {isRoot && canComment && (
          <button
            className="font-medium text-muted hover:text-ink"
            onClick={() => {
              setReplyFor(replyFor === c.id ? null : c.id)
              setReplyText('')
            }}
          >
            {t('comments.reply')}
          </button>
        )}
        {isRoot && canResolve && (
          <button className="font-medium text-muted hover:text-ink" onClick={() => toggleResolved(c)}>
            {c.resolved ? t('comments.reopen') : t('comments.resolve')}
          </button>
        )}
        {canEdit(c) && (
          <button
            className="font-medium text-muted hover:text-ink"
            onClick={() => {
              setEditingId(c.id)
              setEditText(c.body)
            }}
          >
            {t('comments.edit')}
          </button>
        )}
        {canDelete(c) &&
          (confirmDelete === c.id ? (
            <span className="flex items-center gap-2">
              <span className="text-danger">{t('comments.confirmDelete')}</span>
              <button className="font-medium text-danger hover:underline" onClick={() => doDelete(c.id, isRoot)}>
                {t('common.delete')}
              </button>
              <button className="font-medium text-muted hover:text-ink" onClick={() => setConfirmDelete(null)}>
                {t('common.cancel')}
              </button>
            </span>
          ) : (
            <button className="font-medium text-muted hover:text-danger" onClick={() => setConfirmDelete(c.id)}>
              {t('common.delete')}
            </button>
          ))}
      </div>
    )
  }

  function renderBody(c: CommentDto) {
    if (editingId === c.id) {
      return (
        <div className="mt-1.5">
          <Composer
            value={editText}
            onChange={setEditText}
            onSubmit={() => submitEdit(c.id)}
            onCancel={() => setEditingId(null)}
            submitting={update.isPending}
            placeholder={t('comments.placeholder')}
            submitLabel={t('common.save')}
            autoFocus
          />
        </div>
      )
    }
    return (
      <p className="mt-1 whitespace-pre-wrap break-words text-body-sm leading-relaxed text-ink">{c.body}</p>
    )
  }

  return (
    <div className={cn('fixed inset-0 z-50', open ? '' : 'pointer-events-none')}>
      <div
        className={cn('absolute inset-0 bg-ink/40 transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          'absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-paper shadow-pop transition-transform',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label={t('comments.title')}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-line bg-card px-4 py-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary">
            <Icon.comment width={18} height={18} />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-h3 leading-tight">{t('comments.title')}</p>
            <p className="text-caption text-muted">{t('comments.countLabel', { count: counts.all })}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid size-9 place-items-center rounded-lg text-muted hover:bg-ink/5"
            aria-label={t('common.close')}
          >
            <Icon.x />
          </button>
        </div>

        {/* Filter tablist */}
        <div className="border-b border-line px-4 py-2.5">
          <div
            role="tablist"
            aria-label={t('comments.filterLabel')}
            onKeyDown={onTabKeyDown}
            className="inline-flex items-center gap-0.5 rounded-lg bg-card p-0.5"
          >
            {TABS.map((tab, i) => {
              const active = filter === tab.key
              return (
                <button
                  key={tab.key}
                  ref={(el) => { tabRefs.current[i] = el }}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setFilter(tab.key)}
                  className={cn(
                    'h-8 rounded-md px-3 text-body-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    active ? 'bg-primary text-primary-fg shadow-soft' : 'text-muted hover:bg-ink/5 hover:text-ink',
                  )}
                >
                  {tab.label}
                  <span className={cn('ml-1.5 tabular-nums', active ? 'opacity-80' : 'text-subtle')}>{tab.count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div className="scroll-thin flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-line bg-card p-3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-2 h-3 w-full" />
                  <Skeleton className="mt-1.5 h-3 w-4/5" />
                </div>
              ))}
            </div>
          ) : counts.all === 0 ? (
            <EmptyState
              icon={<Icon.comment width={26} height={26} />}
              title={t('comments.emptyTitle')}
              body={t('comments.emptyBody')}
            />
          ) : visible.length === 0 ? (
            <p className="px-2 py-10 text-center text-body-sm text-muted">{t('comments.emptyFilter')}</p>
          ) : (
            <div className="space-y-3">
              {visible.map((root) => {
                const isAnchored = anchored[root.id]
                return (
                  <div
                    key={root.id}
                    ref={(el) => { cardRefs.current[root.id] = el }}
                    className={cn(
                      'rounded-xl border bg-card p-3 shadow-soft transition-colors',
                      activeCommentId === root.id ? 'border-primary ring-2 ring-primary/30' : 'border-line',
                      root.resolved && 'opacity-75',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <AuthorLine name={root.authorName} when={formatWhen(root.createdAt, i18n.language)} />
                      {root.resolved && (
                        <Tag tone="add" className="ml-auto shrink-0">
                          <Icon.check width={12} height={12} /> {t('comments.resolved')}
                        </Tag>
                      )}
                    </div>

                    {/* Anchor affordance: jump when live, explicit label when orphaned. */}
                    {isAnchored ? (
                      <button
                        onClick={() => editor && scrollToComment(editor, root.id)}
                        className="mt-1.5 flex max-w-full items-center gap-1.5 rounded-md bg-warn/10 px-2 py-1 text-caption text-warn hover:bg-warn/20"
                        title={t('comments.jumpTo')}
                      >
                        <Icon.comment width={12} height={12} className="shrink-0" />
                        <span className="truncate italic">
                          {root.anchorText?.trim() || t('comments.jumpTo')}
                        </span>
                      </button>
                    ) : (
                      <div className="mt-1.5 text-caption text-subtle">
                        {root.anchorText?.trim() && (
                          <span className="mr-1 italic">“{root.anchorText.trim()}”</span>
                        )}
                        <span>· {t('comments.orphaned')}</span>
                      </div>
                    )}

                    {renderBody(root)}
                    {renderActions(root, true)}

                    {/* Replies (single level) */}
                    {root.replies && root.replies.length > 0 && (
                      <div className="mt-2 space-y-2 border-l-2 border-line pl-3">
                        {root.replies.map((reply) => (
                          <div key={reply.id}>
                            <AuthorLine name={reply.authorName} when={formatWhen(reply.createdAt, i18n.language)} />
                            {renderBody(reply)}
                            {renderActions(reply, false)}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply composer */}
                    {replyFor === root.id && (
                      <div className="mt-2.5 border-t border-line pt-2.5">
                        {root.resolved && (
                          <p className="mb-2 text-caption text-warn">{t('comments.replyToResolved')}</p>
                        )}
                        <Composer
                          value={replyText}
                          onChange={setReplyText}
                          onSubmit={() => submitReply(root.id)}
                          onCancel={() => setReplyFor(null)}
                          submitting={create.isPending}
                          placeholder={t('comments.replyPlaceholder')}
                          submitLabel={t('comments.send')}
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
