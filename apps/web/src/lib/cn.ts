export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export type Mode = 'light' | 'dark'

/** Accent colors. `swatch` = light-mode preview, `swatchDark` = dark-mode preview. */
export const THEMES = [
  { id: 'violet', label: 'Violet', swatch: '#6a58ca', swatchDark: '#9684f5' },
  { id: 'ocean',  label: 'Ocean',  swatch: '#2768c7', swatchDark: '#60a5fa' },
  { id: 'forest', label: 'Forest', swatch: '#187c45', swatchDark: '#4ac88c' },
  { id: 'sunset', label: 'Sunset', swatch: '#b54b1d', swatchDark: '#f59266' },
  { id: 'rose',   label: 'Rose',   swatch: '#ba3966', swatchDark: '#f07aa5' },
  { id: 'amber',  label: 'Amber',  swatch: '#956310', swatchDark: '#e0a93a' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export function applyMode(mode: Mode) {
  document.documentElement.setAttribute('data-mode', mode)
  try { localStorage.setItem('tb-mode', mode) } catch { /* ignore */ }
}

export function getMode(): Mode {
  return (document.documentElement.getAttribute('data-mode') as Mode) || 'light'
}

export function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute('data-theme', id)
  try { localStorage.setItem('tb-theme', id) } catch { /* ignore */ }
}

export function getTheme(): ThemeId {
  const t = document.documentElement.getAttribute('data-theme') as ThemeId | null
  return t && THEMES.some((x) => x.id === t) ? t : 'violet'
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
