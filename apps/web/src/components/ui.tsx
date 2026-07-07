import {
  type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes,
  useEffect, useRef, useState,
} from 'react'
import { cn } from '../lib/cn'
import { Icon } from '../lib/icons'

// Presence color palette — keyed by a short presence id (A–F). Co-located with
// Avatar (its only consumer) so the UI kit stays self-contained. Reused by the
// real-time collaboration presence indicators.
const presenceColors: Record<string, string> = {
  A: '#f08a8a', B: '#e9c46a', C: '#82d178', D: '#5fc9d6', E: '#6d5bd0', F: '#e08ad0',
}

/* ----------------------------------- Button ---------------------------------- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'google'
type ButtonSize = 'sm' | 'md' | 'lg'
export function Button({
  variant = 'primary', size = 'md', loading, full, className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; full?: boolean
}) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-soft',
    secondary: 'bg-card text-ink border border-line hover:bg-paper',
    ghost: 'bg-transparent text-ink hover:bg-ink/5',
    danger: 'bg-danger text-white hover:brightness-95',
    google: 'bg-card text-ink border border-line hover:bg-paper',
  }
  const sizes: Record<ButtonSize, string> = {
    sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-[10px]',
    md: 'h-11 px-4 text-sm gap-2 rounded-xl',
    lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
  }
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors select-none',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]',
        variants[variant], sizes[size], full && 'w-full', className,
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />}
      {variant === 'google' && !loading && <Icon.google />}
      {children}
    </button>
  )
}

/* ------------------------------------ Input ---------------------------------- */
type FieldState = 'default' | 'error' | 'success'
export function Field({
  label, hint, error, success, children, htmlFor, optional,
}: {
  label?: string; hint?: ReactNode; error?: string; success?: string
  children: ReactNode; htmlFor?: string; optional?: boolean
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="flex items-center gap-2 text-[13px] font-medium text-ink">
          {label}
          {optional && <span className="text-subtle font-normal">(ไม่บังคับ)</span>}
        </label>
      )}
      {children}
      {error && <p className="flex items-center gap-1.5 text-[12px] text-danger"><Icon.warning width={13} height={13} />{error}</p>}
      {success && <p className="flex items-center gap-1.5 text-[12px] text-success"><Icon.check width={13} height={13} />{success}</p>}
      {hint && !error && !success && <p className="text-[12px] text-muted leading-relaxed">{hint}</p>}
    </div>
  )
}

export function Input({
  state = 'default', icon, trailing, className, ...rest
}: InputHTMLAttributes<HTMLInputElement> & { state?: FieldState; icon?: ReactNode; trailing?: ReactNode }) {
  const ring: Record<FieldState, string> = {
    default: 'border-line focus:border-primary',
    error: 'border-danger focus:border-danger',
    success: 'border-success/70 focus:border-success',
  }
  return (
    <div className="relative flex items-center">
      {icon && <span className="absolute left-3 text-subtle pointer-events-none">{icon}</span>}
      <input
        className={cn(
          'w-full h-11 rounded-xl bg-card border text-sm text-ink placeholder:text-subtle',
          'transition-colors outline-none', ring[state],
          icon ? 'pl-10' : 'pl-3.5', trailing ? 'pr-10' : 'pr-3.5', className,
        )}
        {...rest}
      />
      {trailing && <span className="absolute right-2.5">{trailing}</span>}
    </div>
  )
}

export function PasswordInput({
  showToggle = true, ...props
}: InputHTMLAttributes<HTMLInputElement> & { state?: FieldState; showToggle?: boolean }) {
  const [show, setShow] = useState(false)
  // When the toggle is hidden, render a plain password input with no eye button.
  if (!showToggle) return <Input {...props} type="password" />
  return (
    <Input
      {...props}
      type={show ? 'text' : 'password'}
      trailing={
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          className="grid size-9 place-items-center rounded-lg text-muted hover:text-ink hover:bg-ink/5">
          {show ? <Icon.eyeOff /> : <Icon.eye />}
        </button>
      }
    />
  )
}

/* ------------------------------------ Card ----------------------------------- */
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('bg-card rounded-xl border border-line shadow-card', className)} {...rest}>
      {children}
    </div>
  )
}

/* ------------------------------------- Tag ----------------------------------- */
type TagTone = 'neutral' | 'add' | 'del' | 'primary' | 'warn'
export function Tag({ tone = 'neutral', children, className }: { tone?: TagTone; children: ReactNode; className?: string }) {
  const tones: Record<TagTone, string> = {
    neutral: 'bg-ink/5 text-muted',
    add: 'bg-add-bg text-add-fg',
    del: 'bg-del-bg text-del-fg',
    primary: 'bg-primary-soft text-primary',
    warn: 'bg-warn/10 text-warn',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium font-mono', tones[tone], className)}>
      {children}
    </span>
  )
}

/* ------------------------------------ Toggle --------------------------------- */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange?: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-line', disabled && 'opacity-50',
      )}
    >
      <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  )
}

/* ------------------------------------ Avatar --------------------------------- */
export function Avatar({ initial, ck, size = 32, ring }: { initial: string; ck?: string; size?: number; ring?: boolean }) {
  const color = ck ? (presenceColors[ck] ?? '#1d2333') : '#1d2333'
  return (
    <span
      className={cn('inline-grid place-items-center rounded-full font-semibold text-white shrink-0', ring && 'ring-2 ring-card')}
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  )
}

export function AvatarStack({ people, max = 3, size = 26 }: { people: { initial: string; key: string }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <span key={i} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: max - i }}>
          <Avatar initial={p.initial} ck={p.key} size={size} ring />
        </span>
      ))}
      {extra > 0 && (
        <span className="grid place-items-center rounded-full bg-ink/10 text-ink text-[11px] font-semibold ring-2 ring-card"
          style={{ width: size, height: size, marginLeft: -8 }}>+{extra}</span>
      )}
    </div>
  )
}

/* ------------------------------------ Menu ----------------------------------- */
export function Menu({ trigger, children, align = 'right' }: { trigger: ReactNode; children: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          role="menu"
          className={cn('absolute z-30 mt-1.5 min-w-[200px] rounded-xl border border-line bg-card p-1.5 shadow-pop animate-pop',
            align === 'right' ? 'right-0' : 'left-0')}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ icon, children, danger, onClick }: { icon?: ReactNode; children: ReactNode; danger?: boolean; onClick?: () => void }) {
  return (
    <button role="menuitem" onClick={onClick}
      className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left transition-colors',
        danger ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-ink/5')}>
      {icon}{children}
    </button>
  )
}

/* ------------------------------------ Modal ---------------------------------- */
export function Modal({ open, onClose, title, children, footer, width = 'max-w-md' }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 animate-fade" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn('relative w-full rounded-2xl border border-line bg-card shadow-pop animate-pop', width)}>
        {title && (
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h3 className="font-heading text-[17px] font-semibold">{title}</h3>
            <button onClick={onClose} aria-label="ปิด" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-ink/5"><Icon.x /></button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}

/* --------------------------------- EmptyState -------------------------------- */
export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-card/50 px-6 py-16 text-center">
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">{icon}</div>}
      <h3 className="font-heading text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted leading-relaxed">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ---------------------------------- Skeleton --------------------------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

/* ----------------------------------- Segment --------------------------------- */
export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-card p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn('h-9 rounded-lg px-3 text-[13px] font-medium transition-colors',
            value === o.value ? 'bg-primary text-primary-fg' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------- Banner ---------------------------------- */
export function Banner({ tone = 'error', children }: { tone?: 'error' | 'success' | 'warn'; children: ReactNode }) {
  const tones = {
    error: 'bg-del-bg text-del-fg border-danger/20',
    success: 'bg-add-bg text-add-fg border-success/20',
    warn: 'bg-warn/10 text-warn border-warn/20',
  }
  return (
    <div className={cn('flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[13px]', tones[tone])}>
      <Icon.warning width={16} height={16} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}
