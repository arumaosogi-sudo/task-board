import { useState } from 'react'
import { applyMode, applyTheme, getMode, getTheme, THEMES, type Mode, type ThemeId } from '../lib/cn'
import { cn } from '../lib/cn'

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

function ColorSwatches({
  theme, mode, onChange,
}: { theme: ThemeId; mode: Mode; onChange: (id: ThemeId) => void }) {
  return (
    <div className="flex items-center gap-2">
      {THEMES.map((c) => {
        const color = mode === 'dark' ? c.swatchDark : c.swatch
        const active = theme === c.id
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            title={c.label}
            aria-label={c.label}
            aria-pressed={active}
            className={cn(
              'size-6 rounded-full border transition',
              active ? 'ring-2 ring-primary ring-offset-2 ring-offset-card border-transparent' : 'border-line hover:scale-110',
            )}
            style={{ backgroundColor: color }}
          />
        )
      })}
    </div>
  )
}

export function ThemeSwitcher({
  onChange,
  inline = false,
}: {
  /** Persist callback — fired with the full theme selection after any change. */
  onChange?: (theme: ThemeId, mode: Mode) => void
  /** `inline` renders a compact horizontal row (e.g. in a header/menu). */
  inline?: boolean
}) {
  const [theme, setTheme] = useState<ThemeId>(getTheme())
  const [mode, setMode] = useState<Mode>(getMode())

  const pickTheme = (id: ThemeId) => { setTheme(id); applyTheme(id); onChange?.(id, mode) }
  const pickMode = (m: Mode) => { setMode(m); applyMode(m); onChange?.(theme, m) }

  if (inline) {
    return (
      <div className="flex items-center gap-3">
        <ColorSwatches theme={theme} mode={mode} onChange={pickTheme} />
        <ModeToggle mode={mode} onChange={pickMode} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">สีธีม</p>
        <ColorSwatches theme={theme} mode={mode} onChange={pickTheme} />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">โหมดการแสดงผล</p>
        <ModeToggle mode={mode} onChange={pickMode} />
      </div>
    </div>
  )
}
