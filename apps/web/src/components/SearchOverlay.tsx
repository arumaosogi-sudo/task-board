import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'
import { useDebounced, useSearch } from '../lib/search'

interface SearchResult {
  type: 'project' | 'file' | 'content'
  title: string
  subtitle: string
  to: string
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    return { ...acc, [k]: [...(acc[k] || []), item] }
  }, {} as Record<string, T[]>)
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const debounced = useDebounced(query, 250)
  const { data, isFetching, enabled } = useSearch(debounced)

  // Map the grouped API payload into a flat, ordered list of navigable results.
  const results = useMemo<SearchResult[]>(() => {
    const projects = data.projects.map<SearchResult>((p) => ({
      type: 'project', title: p.name, subtitle: p.description || '—', to: `/projects/${p.id}/work`,
    }))
    const files = data.files.map<SearchResult>((f) => ({
      type: 'file', title: f.fileName, subtitle: f.projectName, to: `/projects/${f.projectId}/work`,
    }))
    const contents = data.contents.map<SearchResult>((c) => ({
      type: 'content', title: c.fileName, subtitle: c.snippet, to: `/projects/${c.projectId}/work`,
    }))
    return [...projects, ...files, ...contents]
  }, [data])

  const typeLabel: Record<SearchResult['type'], string> = {
    project: t('search.groupProjects'),
    file: t('search.groupFiles'),
    content: t('search.groupContent'),
  }
  const typeIcon: Record<SearchResult['type'], typeof Icon.grid> = {
    project: Icon.grid, file: Icon.file, content: Icon.edit,
  }

  const grouped = groupBy(results, (r) => r.type)
  const groupOrder: SearchResult['type'][] = ['project', 'file', 'content']
  const flat = groupOrder.flatMap((tp) => grouped[tp] || [])

  useEffect(() => {
    if (open) { setQuery(''); setSelected(0); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  // Clamp the highlighted index whenever the result set shrinks.
  useEffect(() => { setSelected((s) => Math.min(s, Math.max(0, flat.length - 1))) }, [flat.length])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, flat.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
      if (e.key === 'Enter') {
        const target = flat[selected]
        if (target) { navigate(target.to); onClose() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, flat, selected, onClose, navigate])

  if (!open) return null

  const showEmpty = !enabled
  const showNoResults = enabled && !isFetching && results.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" role="dialog" aria-modal="true" aria-label={t('common.search')}>
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative mx-4 flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-ink/10 animate-pop"
        style={{ maxHeight: 'min(640px, 85vh)' }}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-line/60 px-4 py-1">
          <Icon.search width={18} height={18} className="shrink-0 text-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-subtle"
          />
          {isFetching && <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
          {query && (
            <button onClick={() => setQuery('')} className="grid size-6 place-items-center rounded-md hover:bg-ink/5" aria-label={t('common.close')}>
              <Icon.x width={14} height={14} className="text-subtle" />
            </button>
          )}
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-subtle sm:block">Esc</kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
          {showEmpty && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Icon.search width={24} height={24} className="text-subtle" />
              <p className="text-sm text-muted">{t('search.empty')}</p>
            </div>
          )}
          {showNoResults && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Icon.search width={24} height={24} className="text-subtle" />
              <p className="text-sm text-ink">{t('search.noResults', { query: debounced })}</p>
              <p className="text-[12px] text-muted">{t('search.tryAnother')}</p>
            </div>
          )}
          {groupOrder.map((type) => {
            const items = grouped[type]
            if (!items?.length) return null
            const Icn = typeIcon[type]
            return (
              <div key={type}>
                <p className="px-4 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-subtle/70">{typeLabel[type]}</p>
                {items.map((item) => {
                  const idx = flat.indexOf(item)
                  return (
                    <button
                      key={item.type + item.title + item.subtitle}
                      onClick={() => { navigate(item.to); onClose() }}
                      onMouseEnter={() => setSelected(idx)}
                      className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        selected === idx ? 'bg-primary/10' : 'hover:bg-ink/[0.04]')}
                    >
                      <div className={cn('grid size-8 shrink-0 place-items-center rounded-lg transition-colors',
                        selected === idx ? 'bg-primary text-primary-fg' : 'bg-line text-muted')}>
                        <Icn width={15} height={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{item.title}</p>
                        <p className="truncate text-[11px] text-muted">{item.subtitle}</p>
                      </div>
                      <Icon.chevronR width={14} height={14} className="ml-auto shrink-0 text-subtle" />
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {results.length > 0 && (
          <div className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-subtle">
            <span><kbd className="rounded border border-line px-1">↑</kbd> <kbd className="rounded border border-line px-1">↓</kbd> {t('search.navigate')}</span>
            <span><kbd className="rounded border border-line px-1">↵</kbd> {t('search.open')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
