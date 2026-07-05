// Tiny classnames joiner — keeps JSX readable without pulling in a dependency.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// Color is independent of mode — each color has its own light + dark mode.
export const THEMES = [
  { id: 'violet', label: 'Violet', swatch: '#6d5bd0', swatchDark: '#9684f5' },
  { id: 'ocean', label: 'Ocean', swatch: '#2f7df0', swatchDark: '#60a5fa' },
  { id: 'forest', label: 'Forest', swatch: '#1f9d57', swatchDark: '#4ac88c' },
  { id: 'sunset', label: 'Sunset', swatch: '#ee6a3a', swatchDark: '#f59266' },
  { id: 'rose', label: 'Rose', swatch: '#e0457b', swatchDark: '#f07aa5' },
  { id: 'amber', label: 'Amber', swatch: '#c98a1a', swatchDark: '#e0a93a' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export type Mode = 'light' | 'dark'

export function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute('data-theme', id)
  try { localStorage.setItem('tb-theme', id) } catch { /* ignore */ }
}

export function applyMode(mode: Mode) {
  document.documentElement.setAttribute('data-mode', mode)
  try { localStorage.setItem('tb-mode', mode) } catch { /* ignore */ }
}

export function getMode(): Mode {
  return (document.documentElement.getAttribute('data-mode') as Mode) || 'light'
}

export function initTheme(): { theme: ThemeId; mode: Mode } {
  let theme: ThemeId = 'violet'
  let mode: Mode = 'light'
  try {
    const t = localStorage.getItem('tb-theme') as ThemeId | null
    if (t && THEMES.some((x) => x.id === t)) theme = t
    const m = localStorage.getItem('tb-mode') as Mode | null
    if (m === 'light' || m === 'dark') mode = m
  } catch { /* ignore */ }
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.setAttribute('data-mode', mode)
  return { theme, mode }
}
