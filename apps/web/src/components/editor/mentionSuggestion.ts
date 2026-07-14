// Mention suggestion wiring (Sprint 4). Feeds `@tiptap/extension-mention` its item list and
// renders the popup via TipTap's ReactRenderer, positioned manually from the caret rect so we
// don't pull in tippy as a first-party dependency. Members come from a getter (not a captured
// array) so the extension is created once while always seeing the current, cached member list.
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionOptions } from '@tiptap/suggestion'
import { MentionList, type MentionListHandle, type MentionListProps, type MentionMember } from './MentionList'

const POPUP_MAX_H = 288 // keep in sync with MentionList max-h (max-h-64 + padding)
const GAP = 6

/** Position a fixed popup just under the caret, flipping above when it would overflow. */
function place(el: HTMLElement, rect: DOMRect | null): void {
  if (!rect) return
  const below = window.innerHeight - rect.bottom
  const openUp = below < POPUP_MAX_H && rect.top > below
  el.style.left = `${Math.round(rect.left)}px`
  if (openUp) {
    el.style.top = ''
    el.style.bottom = `${Math.round(window.innerHeight - rect.top + GAP)}px`
  } else {
    el.style.bottom = ''
    el.style.top = `${Math.round(rect.bottom + GAP)}px`
  }
}

export function buildMentionSuggestion(
  getMembers: () => MentionMember[],
): Omit<SuggestionOptions<MentionMember>, 'editor'> {
  return {
    // Substring, case-insensitive match on username. Filtering happens client-side against
    // the cached roster (NFR: no network round-trip per keystroke). Cap to 10 visible rows.
    items: ({ query }) => {
      const q = query.toLowerCase()
      return getMembers()
        .filter((m) => m.username.toLowerCase().includes(q))
        .slice(0, 10)
    },
    render: () => {
      let component: ReactRenderer<MentionListHandle, MentionListProps> | null = null
      let popup: HTMLDivElement | null = null

      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, {
            props: { items: props.items, command: props.command },
            editor: props.editor,
          })
          popup = document.createElement('div')
          popup.style.position = 'fixed'
          popup.style.zIndex = '60'
          popup.appendChild(component.element)
          document.body.appendChild(popup)
          place(popup, props.clientRect?.() ?? null)
        },
        onUpdate: (props) => {
          component?.updateProps({ items: props.items, command: props.command })
          if (popup) place(popup, props.clientRect?.() ?? null)
        },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') return true // swallow → suggestion closes, '@' stays as text
          return component?.ref?.onKeyDown(props) ?? false
        },
        onExit: () => {
          component?.destroy()
          popup?.remove()
          component = null
          popup = null
        },
      }
    },
  }
}
