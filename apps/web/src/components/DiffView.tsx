import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { Tag } from './ui'

type Line = { type: string; n1?: number; n2?: number; text: string }
type Hunk = { header: string; lines: Line[] }

function DiffRow({ line }: { line: Line }) {
  const isAdd = line.type === 'add'
  const isDel = line.type === 'del'
  return (
    <div className={cn('grid grid-cols-[44px_44px_20px_1fr] font-mono text-[12.5px] leading-[1.7]',
      isAdd && 'bg-add-bg', isDel && 'bg-del-bg')}>
      <span className={cn('select-none px-2 text-right tabular-nums', isAdd ? 'text-add-fg/60' : isDel ? 'text-del-fg/50' : 'text-subtle')}>{line.n1 ?? ''}</span>
      <span className={cn('select-none px-2 text-right tabular-nums', isAdd ? 'text-add-fg/60' : isDel ? 'text-del-fg/50' : 'text-subtle')}>{line.n2 ?? ''}</span>
      <span className={cn('select-none text-center font-semibold', isAdd ? 'text-add-fg' : isDel ? 'text-del-fg' : 'text-transparent')}>
        {isAdd ? '+' : isDel ? '−' : ''}
      </span>
      <span className={cn('whitespace-pre-wrap pr-3', isAdd ? 'text-add-fg' : isDel ? 'text-del-fg' : 'text-ink')}>
        {line.text.replace(/^[+-]\s/, '')}
      </span>
    </div>
  )
}

export function DiffView({
  file = 'document.tbx',
  hunks = [],
  added = 0,
  removed = 0,
}: {
  file?: string
  hunks?: Hunk[]
  added?: number
  removed?: number
}) {
  const { t } = useTranslation()
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line bg-paper/60 px-4 py-2.5">
        <div className="flex items-center gap-2 font-mono text-[13px] text-ink">
          <span className="text-muted">📄</span>{file}
        </div>
        <div className="flex items-center gap-2">
          <Tag tone="add">+{added}</Tag>
          <Tag tone="del">−{removed}</Tag>
        </div>
      </div>
      <div className="scroll-thin overflow-x-auto">
        {hunks.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted">{t('diff.noChanges')}</div>
        )}
        {hunks.map((hunk, i) => (
          <div key={i}>
            <div className="bg-primary-soft/50 px-4 py-1 font-mono text-[12px] text-primary">{hunk.header}</div>
            {hunk.lines.map((l, j) => <DiffRow key={j} line={l} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
