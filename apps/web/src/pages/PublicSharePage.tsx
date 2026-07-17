// /share/:token — anonymous, read-only public viewer (ADR 0006 §5.1).
//
// Mounted OUTSIDE AuthProvider and ProtectedRoute (see App.tsx): it never reads a
// session, sends the refresh cookie, or fetches authenticated data. It shows only the
// sanitized `publishedContent` snapshot the Owner explicitly published — nothing live.
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n, { setLanguage, type Language } from '../i18n'
import { fetchPublicShare, resolveShareAssets, type PublicShareContent } from '../lib/share'
import { Segmented, Skeleton } from '../components/ui'

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: PublicShareContent }
  | { kind: 'error' }

/** Injects hardening <meta> tags for this route and removes them on unmount. */
function useShareHeadHardening() {
  useEffect(() => {
    const metas: HTMLMetaElement[] = []
    const add = (attrs: Record<string, string>) => {
      const m = document.createElement('meta')
      Object.entries(attrs).forEach(([k, v]) => m.setAttribute(k, v))
      document.head.appendChild(m)
      metas.push(m)
    }
    // Keep the opaque token out of Referer, and out of search indexes. The authoritative
    // Cache-Control / Referrer-Policy / X-Robots-Tag headers are set by the API on the
    // data responses; production must ALSO set a CSP at the web edge for /share/* (a
    // runtime meta can't fully replace it) — flagged for security review.
    add({ name: 'referrer', content: 'no-referrer' })
    add({ name: 'robots', content: 'noindex, nofollow' })
    return () => {
      metas.forEach((m) => m.remove())
    }
  }, [])
}

export default function PublicSharePage() {
  const { token = '' } = useParams()
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [lang, setLang] = useState<Language>(i18n.language === 'en' ? 'en' : 'th')

  useShareHeadHardening()

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    fetchPublicShare(token)
      .then((data) => !cancelled && setState({ kind: 'ok', data }))
      .catch(() => !cancelled && setState({ kind: 'error' }))
    return () => {
      cancelled = true
    }
  }, [token])

  const onLang = (v: Language) => {
    setLang(v)
    setLanguage(v)
  }

  // Server content is already sanitized; here we only swap asset placeholders for the
  // token-scoped proxy URLs the browser can actually fetch.
  const html = useMemo(
    () => (state.kind === 'ok' ? resolveShareAssets(state.data.contentHtml, token) : ''),
    [state, token],
  )

  const publishedLabel =
    state.kind === 'ok'
      ? new Date(state.data.publishedAt).toLocaleString(lang === 'en' ? 'en-US' : 'th-TH', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : ''

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex h-14 items-center gap-3 border-b border-line bg-card px-4">
        <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary" aria-hidden>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
            <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
          </svg>
        </span>
        <h1 className="truncate text-sm font-semibold">
          {state.kind === 'ok' ? state.data.fileName : t('share.viewer.brand')}
        </h1>
        <div className="ml-auto">
          <Segmented
            value={lang}
            onChange={onLang}
            options={[
              { value: 'th', label: 'ไทย' },
              { value: 'en', label: 'EN' },
            ]}
          />
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-4 py-8">
        {state.kind === 'loading' && (
          <div className="rounded-2xl border border-line bg-card p-8" aria-busy="true" aria-live="polite">
            <Skeleton className="mb-4 h-7 w-1/3" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-2 h-4 w-11/12" />
            <Skeleton className="mb-2 h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {state.kind === 'error' && (
          <div className="grid place-items-center py-20 text-center" role="alert">
            <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-ink/5 text-muted">
              <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-ink">{t('share.viewer.goneTitle')}</h1>
            <p className="mt-1 max-w-sm text-sm text-muted">{t('share.viewer.goneBody')}</p>
          </div>
        )}

        {state.kind === 'ok' && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-caption font-medium text-primary">
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {t('share.viewer.readonlyBadge')}
              </span>
              <span className="text-caption text-subtle">{t('share.viewer.publishedAt', { when: publishedLabel })}</span>
            </div>
            <article className="rounded-2xl border border-line bg-card p-8 shadow-soft sm:p-10">
              {html.trim() ? (
                <div className="tb-prose" dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <p className="text-sm text-muted">{t('share.viewer.empty')}</p>
              )}
            </article>
          </>
        )}
      </main>
    </div>
  )
}
