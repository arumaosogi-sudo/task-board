// Owner-only management panel for a document's public share links (ADR 0006 §5.2).
// Distinct from autosave: "Publish" is an explicit, deliberate action, and each link
// clearly shows whether what the public sees is older than the current document.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Segmented, Skeleton, Tag } from './ui'
import { Icon } from '../lib/icons'
import {
  useCreateShareLink,
  usePublishShareLink,
  useRevokeShareLink,
  useShareLinks,
  type ShareLink,
} from '../lib/share'

type Ttl = '7' | '30' | '90' | 'never'

function fmt(iso: string, lang: string): string {
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function isExpired(link: ShareLink): boolean {
  return !!link.expiresAt && new Date(link.expiresAt) <= new Date()
}

/** Lifecycle state that drives the badge shown for a link. */
function statusOf(link: ShareLink, docUpdatedAt: string | undefined): 'revoked' | 'expired' | 'unpublished' | 'stale' | 'live' {
  if (link.revokedAt) return 'revoked'
  if (isExpired(link)) return 'expired'
  if (!link.publishedAt) return 'unpublished'
  if (docUpdatedAt && new Date(docUpdatedAt) > new Date(link.publishedAt)) return 'stale'
  return 'live'
}

export function SharePanel({
  open,
  onClose,
  projectId,
  fileId,
  isEmpty,
  docUpdatedAt,
  onToast,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  fileId: string
  isEmpty: boolean
  docUpdatedAt?: string
  onToast: (tone: 'success' | 'error', msg: string) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language

  const { data: links, isLoading } = useShareLinks(projectId, fileId, open)
  const createLink = useCreateShareLink(projectId, fileId)
  const publishLink = usePublishShareLink(projectId, fileId)
  const revokeLink = useRevokeShareLink(projectId, fileId)

  const [ttl, setTtl] = useState<Ttl>('30')
  // The full URL is only ever returned once, at creation — surface it with copy-now.
  const [justCreated, setJustCreated] = useState<{ id: string; url: string } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [confirmPublishEmpty, setConfirmPublishEmpty] = useState<string | null>(null)

  const sorted = useMemo(() => links ?? [], [links])

  async function handleCreate() {
    try {
      const body = ttl === 'never' ? { noExpiry: true as const } : { expiresInDays: Number(ttl) as 7 | 30 | 90 }
      const res = await createLink.mutateAsync(body)
      setJustCreated({ id: res.link.id, url: res.url })
    } catch {
      onToast('error', t('share.manage.createFailed'))
    }
  }

  async function doPublish(id: string) {
    setConfirmPublishEmpty(null)
    try {
      await publishLink.mutateAsync(id)
      onToast('success', t('share.manage.published'))
    } catch {
      onToast('error', t('share.manage.publishFailed'))
    }
  }

  function handlePublish(link: ShareLink) {
    if (isEmpty && !link.publishedAt) setConfirmPublishEmpty(link.id)
    else doPublish(link.id)
  }

  async function handleRevoke(id: string) {
    setConfirmRevoke(null)
    try {
      await revokeLink.mutateAsync(id)
      if (justCreated?.id === id) setJustCreated(null)
      onToast('success', t('share.manage.revokedToast'))
    } catch {
      onToast('error', t('share.manage.revokeFailed'))
    }
  }

  async function copy(url: string, id: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000)
    } catch {
      /* clipboard blocked — the URL stays visible for manual copy */
    }
  }

  const ttlOptions = [
    { value: '7' as const, label: t('share.manage.ttl7') },
    { value: '30' as const, label: t('share.manage.ttl30') },
    { value: '90' as const, label: t('share.manage.ttl90') },
    { value: 'never' as const, label: t('share.manage.noExpiry') },
  ]

  return (
    <Modal open={open} onClose={onClose} title={t('share.manage.title')} width="max-w-lg">
      <div className="space-y-5">
        <p className="text-body-sm text-muted">{t('share.manage.description')}</p>

        {/* Create */}
        <div className="rounded-xl border border-line bg-ink/[0.015] p-3.5">
          <label className="mb-1.5 block text-caption font-semibold text-subtle">{t('share.manage.ttlLabel')}</label>
          <Segmented value={ttl} onChange={(v) => setTtl(v)} options={ttlOptions} />
          {ttl === 'never' && (
            <p className="mt-2 flex items-start gap-1.5 text-caption text-warn">
              <Icon.warning width={13} height={13} className="mt-0.5 shrink-0" />
              {t('share.manage.noExpiryWarn')}
            </p>
          )}
          <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-warn/10 px-2.5 py-2 text-caption text-warn">
            <Icon.warning width={13} height={13} className="mt-0.5 shrink-0" />
            {t('share.manage.warning')}
          </p>
          <div className="mt-3">
            <Button onClick={handleCreate} loading={createLink.isPending}>
              <Icon.plus width={16} height={16} /> {t('share.manage.create')}
            </Button>
          </div>
        </div>

        {/* Just-created link — copy now (shown once) */}
        {justCreated && (
          <div className="rounded-xl border border-primary/30 bg-primary-soft/50 p-3">
            <p className="mb-1.5 text-caption font-medium text-primary">{t('share.manage.linkCreated')}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-card px-2.5 py-1.5 text-caption text-ink" title={justCreated.url}>
                {justCreated.url}
              </code>
              <Button variant="secondary" onClick={() => copy(justCreated.url, justCreated.id)}>
                {copiedId === justCreated.id ? t('share.manage.copied') : t('share.manage.copy')}
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        <div>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="py-6 text-center text-body-sm text-muted">{t('share.manage.empty')}</p>
          ) : (
            <ul className="space-y-2.5">
              {sorted.map((link) => {
                const status = statusOf(link, docUpdatedAt)
                const dead = status === 'revoked' || status === 'expired'
                return (
                  <li key={link.id} className="rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {status === 'live' && <Tag tone="add">{t('share.manage.upToDate')}</Tag>}
                      {status === 'stale' && <Tag tone="warn">{t('share.manage.staleBadge')}</Tag>}
                      {status === 'unpublished' && <Tag tone="neutral">{t('share.manage.notPublished')}</Tag>}
                      {status === 'revoked' && <Tag tone="del">{t('share.manage.revoked')}</Tag>}
                      {status === 'expired' && <Tag tone="del">{t('share.manage.expired')}</Tag>}
                      <span className="ml-auto text-caption text-subtle">
                        {link.expiresAt
                          ? t('share.manage.expiresAt', { when: fmt(link.expiresAt, lang) })
                          : t('share.manage.neverExpires')}
                      </span>
                    </div>

                    <div className="mt-1 text-caption text-muted">
                      {t('share.manage.createdBy', { name: link.createdByUsername })}
                      {link.publishedAt && <> · {t('share.manage.publishedAt', { when: fmt(link.publishedAt, lang) })}</>}
                      {link.accessCount > 0 && <> · {t('share.manage.accessCount', { count: link.accessCount })}</>}
                    </div>

                    {confirmRevoke === link.id ? (
                      <div className="mt-2.5 rounded-lg bg-del-bg/60 p-2.5">
                        <p className="text-caption text-del-fg">{t('share.manage.revokeConfirmBody')}</p>
                        <div className="mt-2 flex gap-2">
                          <Button variant="danger" onClick={() => handleRevoke(link.id)} loading={revokeLink.isPending}>
                            {t('share.manage.revoke')}
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirmRevoke(null)}>{t('common.cancel')}</Button>
                        </div>
                      </div>
                    ) : confirmPublishEmpty === link.id ? (
                      <div className="mt-2.5 rounded-lg bg-warn/10 p-2.5">
                        <p className="text-caption text-warn">{t('share.manage.publishEmptyConfirm')}</p>
                        <div className="mt-2 flex gap-2">
                          <Button onClick={() => doPublish(link.id)} loading={publishLink.isPending}>
                            {t('share.manage.publish')}
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirmPublishEmpty(null)}>{t('common.cancel')}</Button>
                        </div>
                      </div>
                    ) : (
                      !dead && (
                        <div className="mt-2.5 flex gap-2">
                          <Button variant="secondary" onClick={() => handlePublish(link)} loading={publishLink.isPending}>
                            <Icon.check width={15} height={15} />
                            {link.publishedAt ? t('share.manage.publishAgain') : t('share.manage.publish')}
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirmRevoke(link.id)}>
                            {t('share.manage.revoke')}
                          </Button>
                        </div>
                      )
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
