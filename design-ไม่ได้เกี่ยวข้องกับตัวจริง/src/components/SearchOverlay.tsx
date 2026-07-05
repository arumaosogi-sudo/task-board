// COMPONENT — Global Search Overlay (Cmd+K)
// Usage: <SearchOverlay open={open} onClose={() => setOpen(false)} />
import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'

interface SearchResult {
  type: 'project' | 'file' | 'content'
  title: string
  subtitle: string
  to: string
}

const mockResults: SearchResult[] = [
  { type: 'project', title: 'Q3 Marketing Report', subtitle: 'Owner · 8 ไฟล์', to: '/work' },
  { type: 'project', title: 'Onboarding Handbook', subtitle: 'Editor · 3 ไฟล์', to: '/work' },
  { type: 'file', title: 'บทสรุปผู้บริหาร', subtitle: 'Q3 Marketing Report', to: '/editor' },
  { type: 'file', title: 'แผนการตลาด Q4', subtitle: 'Q3 Marketing Report', to: '/editor' },
  { type: 'content', title: 'ROI เฉลี่ย 3.4x', subtitle: 'บทสรุปผู้บริหาร · Q3 Marketing Report', to: '/editor' },
]

const typeLabel: Record<SearchResult['type'], string> = {
  project: 'Projects',
  file: 'Files',
  content: 'เนื้อหา',
}

const typeIcon: Record<SearchResult['type'], typeof Icon.grid> = {
  project: Icon.grid,
  file: Icon.file,
  content: Icon.edit,
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    return { ...acc, [k]: [...(acc[k] || []), item] }
  }, {} as Record<string, T[]>)
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = query.length >= 1
    ? mockResults.filter((r) =>
        r.title.toLowerCase().includes(query.toLowerCase()) ||
        r.subtitle.toLowerCase().includes(query.toLowerCase())
      )
    : []

  const grouped = groupBy(results, (r) => r.type)
  const groupOrder: SearchResult['type'][] = ['project', 'file', 'content']
  const flat = groupOrder.flatMap((t) => grouped[t] || [])

  useEffect(() => {
    if (open) { setQuery(''); setSelected(0); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') setSelected((s) => Math.min(s + 1, flat.length - 1))
      if (e.key === 'ArrowUp') setSelected((s) => Math.max(s - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, flat.length, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
      <div className="relative w-full max-w-xl animate-pop rounded-2xl bg-card shadow-pop mx-4">
        {/* search input */}
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon.search width={18} height={18} className="shrink-0 text-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
            placeholder="ค้นหา project, ไฟล์ หรือเนื้อหา…"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-subtle"
          />
          {query && (
            <button onClick={() => setQuery('')} className="grid size-6 place-items-center rounded-md hover:bg-ink/5">
              <Icon.x width={14} height={14} className="text-subtle" />
            </button>
          )}
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-subtle sm:block">
            Esc
          </kbd>
        </div>

        {/* results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {query.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Icon.search width={24} height={24} className="text-subtle" />
              <p className="text-sm text-muted">ค้นหา project, ไฟล์ หรือเนื้อหา</p>
            </div>
          )}

          {query.length > 0 && results.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Icon.search width={24} height={24} className="text-subtle" />
              <p className="text-sm text-ink">ไม่พบ &quot;{query}&quot;</p>
              <p className="text-[12px] text-muted">ลองใช้คำค้นอื่น</p>
            </div>
          )}

          {groupOrder.map((type) => {
            const items = grouped[type]
            if (!items?.length) return null
            const Icn = typeIcon[type]
            return (
              <div key={type}>
                <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                  {typeLabel[type]}
                </p>
                {items.map((item) => {
                  const idx = flat.indexOf(item)
                  return (
                    <Link key={item.title + item.subtitle} to={item.to} onClick={onClose}
                      className={cn('flex items-center gap-3 px-4 py-2.5 transition',
                        selected === idx ? 'bg-primary-soft' : 'hover:bg-ink/5')}>
                      <div className={cn('grid size-8 shrink-0 place-items-center rounded-lg',
                        selected === idx ? 'bg-primary text-primary-fg' : 'bg-line text-muted')}>
                        <Icn width={15} height={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">{item.title}</p>
                        <p className="truncate text-[11px] text-muted">{item.subtitle}</p>
                      </div>
                      <Icon.chevronR width={14} height={14} className="ml-auto shrink-0 text-subtle" />
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* footer hint */}
        {results.length > 0 && (
          <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-subtle">
            <span><kbd className="rounded border border-line px-1">↑</kbd> <kbd className="rounded border border-line px-1">↓</kbd> นำทาง</span>
            <span><kbd className="rounded border border-line px-1">↵</kbd> เปิด</span>
          </div>
        )}
      </div>
    </div>
  )
}
