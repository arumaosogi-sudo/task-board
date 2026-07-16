// Mention autocomplete popup (Sprint 4). Rendered into document.body by the suggestion
// plugin (see mentionSuggestion.ts) and positioned manually from the caret rect — no tippy
// dependency. Exposes an imperative `onKeyDown` so the ProseMirror suggestion plugin can
// drive selection (↑/↓/Enter) while the caret stays in the editor. Full keyboard support +
// listbox/option ARIA per UI_GUIDELINES rule 6.
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { SuggestionKeyDownProps } from '@tiptap/suggestion'
import i18n from '../../i18n'
import { cn } from '../../lib/cn'

export interface MentionMember {
  id: string
  username: string
  role?: string
}

export interface MentionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

export interface MentionListProps {
  items: MentionMember[]
  command: (item: { id: string; label: string }) => void
}

function initial(name: string): string {
  return (name.trim()[0] ?? '@').toUpperCase()
}

export const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList(
  { items, command },
  ref,
) {
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  // The popup is mounted outside the React tree (ReactRenderer → detached node), so the
  // react-i18next context isn't guaranteed. Read from the i18n singleton directly instead.
  const t = (key: string) => i18n.t(key)

  // Reset the highlight to the top whenever the filtered result set changes so the user
  // never lands on a stale (now out-of-range) index after typing another character.
  useEffect(() => setSelected(0), [items])

  // Keep the highlighted option scrolled into view for long member lists (>10 rows).
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const pick = (index: number) => {
    const item = items[index]
    if (item) command({ id: item.id, label: item.username })
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelected((i) => (i + items.length - 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelected((i) => (i + 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'Enter') {
        pick(selected)
        return true
      }
      return false
    },
  }))

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={t('mentions.listLabel')}
      className="max-h-64 w-64 overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-pop"
    >
      {items.length === 0 ? (
        <p className="px-2.5 py-2 text-body-sm text-muted">{t('mentions.empty')}</p>
      ) : (
        items.map((m, idx) => (
          <button
            key={m.id}
            type="button"
            role="option"
            data-idx={idx}
            aria-selected={idx === selected}
            // mousedown (not click) so the option is chosen before the editor loses focus /
            // the suggestion tears down on blur.
            onMouseDown={(e) => { e.preventDefault(); pick(idx) }}
            onMouseEnter={() => setSelected(idx)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150',
              idx === selected ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-ink/5',
            )}
          >
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full text-label font-semibold transition-colors duration-150',
                idx === selected ? 'bg-primary text-primary-fg' : 'bg-ink/10 text-muted',
              )}
            >
              {initial(m.username)}
            </span>
            <span className="min-w-0 flex-1 truncate text-body-sm font-medium">{m.username}</span>
            {m.role && (
              <span className="shrink-0 rounded-full bg-ink/5 px-1.5 py-0.5 text-caption text-subtle">{m.role}</span>
            )}
          </button>
        ))
      )}
    </div>
  )
})
