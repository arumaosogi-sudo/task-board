// Runtime theme switcher: pick a COLOR (6) and a MODE (light/dark) independently.
// Each color has its own dark mode. Persists to localStorage.
import { useState } from 'react'
import { THEMES, applyTheme, applyMode, getMode, type ThemeId, type Mode } from '../lib/cn'
import { cn } from '../lib/cn'

function useThemeState() {
  const [active, setActive] = useState<ThemeId>(
    (document.documentElement.getAttribute('data-theme') as ThemeId) || 'violet',
  )
  const [mode, setMode] = useState<Mode>(getMode())
  const pick = (id: ThemeId) => { setActive(id); applyTheme(id) }
  const toggle = (m: Mode) => { setMode(m); applyMode(m) }
  return { active, mode, pick, toggle }
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex rounded-full border border-line bg-card p-0.5">
      {(['light', 'dark'] as Mode[]).map((m) => (
        <button key={m} onClick={() => onChange(m)}
          className={cn('flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition',
            mode === m ? 'bg-primary text-primary-fg' : 'text-muted hover:text-ink')}>
          {m === 'light' ? '☀︎' : '☾'} {m === 'light' ? 'สว่าง' : 'มืด'}
        </button>
      ))}
    </div>
  )
}

export function ThemeSwitcher({ inline }: { inline?: boolean }) {
  const { active, mode, pick, toggle } = useThemeState()
  const swatch = (t: (typeof THEMES)[number]) => (mode === 'dark' ? t.swatchDark : t.swatch)

  if (inline) {
    return (
      <div className="space-y-2 px-2.5 py-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">ธีมสี</p>
          <ModeToggle mode={mode} onChange={toggle} />
        </div>
        <div className="flex gap-1.5">
          {THEMES.map((t) => (
            <button key={t.id} onClick={() => pick(t.id)} aria-label={t.label} title={t.label}
              className={cn('size-6 rounded-full ring-2 ring-offset-2 ring-offset-card transition',
                active === t.id ? 'ring-primary' : 'ring-transparent hover:ring-line')}
              style={{ background: swatch(t) }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">โหมดการแสดงผล</p>
        <ModeToggle mode={mode} onChange={toggle} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {THEMES.map((t) => (
          <button key={t.id} onClick={() => pick(t.id)}
            className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition',
              active === t.id ? 'border-primary bg-primary-soft/50' : 'border-line hover:bg-paper')}>
            <span className="size-7 rounded-full shadow-soft" style={{ background: swatch(t) }} />
            <span className="text-sm font-medium text-ink">{t.label}</span>
            {active === t.id && <span className="ml-auto text-primary">●</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
