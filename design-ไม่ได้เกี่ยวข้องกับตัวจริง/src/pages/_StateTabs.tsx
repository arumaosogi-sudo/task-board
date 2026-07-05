// Small helper that lets reviewers flip a screen between its designed states
// (default / empty / loading / error). Not part of the product — a prototype aid.
import { cn } from '../lib/cn'

export function StateTabs<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-subtle">State</span>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn('rounded-full border px-2.5 py-1 text-[12px] font-medium transition',
            value === o.value ? 'border-primary bg-primary text-primary-fg' : 'border-line bg-card text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
