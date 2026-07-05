// Phase 4.5 — client-side HTML diff for the version-history viewer.
//
// Renders two document snapshots as a unified, line-oriented diff that feeds DiffView.
// We diff human-readable text lines (one per block element) rather than raw HTML tags,
// so the diff reflects what the author sees, not markup noise.

export interface DiffLine {
  type: 'ctx' | 'add' | 'del'
  n1?: number
  n2?: number
  text: string
}
export interface DiffHunk {
  header: string
  lines: DiffLine[]
}
export interface DiffResult {
  hunks: DiffHunk[]
  added: number
  removed: number
}

const BLOCK_SEL = 'h1,h2,h3,h4,p,li,blockquote,pre'
const CONTEXT = 3 // unified-diff context lines around each change

/** Flatten an HTML document to display lines (one per leaf block element). */
export function htmlToLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const blocks = Array.from(doc.body.querySelectorAll(BLOCK_SEL))
  // Keep only leaf blocks (a box wrapper's inner <p> wins over the wrapper) to avoid
  // emitting the same text twice for nested block structures.
  const leaves = blocks.filter((el) => !el.querySelector(BLOCK_SEL))
  const prefixFor = (el: Element): string => {
    switch (el.tagName) {
      case 'H1': return '# '
      case 'H2': return '## '
      case 'H3':
      case 'H4': return '### '
      case 'LI': return (el.closest('ol') ? '1. ' : '• ')
      case 'BLOCKQUOTE': return '▎ '
      default: return ''
    }
  }
  const lines: string[] = []
  for (const el of leaves) {
    if (el.querySelector('img')) { lines.push('[รูปภาพ]'); continue }
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text) lines.push(prefixFor(el) + text)
  }
  return lines
}

type Op = { type: 'ctx' | 'add' | 'del'; text: string }

/** Longest-common-subsequence diff of two line arrays → ordered edit ops. */
function diffOps(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: 'ctx', text: a[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'del', text: a[i] }); i++ }
    else { ops.push({ type: 'add', text: b[j] }); j++ }
  }
  while (i < n) { ops.push({ type: 'del', text: a[i] }); i++ }
  while (j < m) { ops.push({ type: 'add', text: b[j] }); j++ }
  return ops
}

/** Diff two HTML snapshots into unified hunks for DiffView. */
export function diffHtml(oldHtml: string, newHtml: string): DiffResult {
  const ops = diffOps(htmlToLines(oldHtml), htmlToLines(newHtml))

  // Assign 1-based line numbers per side.
  let n1 = 0
  let n2 = 0
  const lines: DiffLine[] = ops.map((op) => {
    if (op.type === 'add') return { type: 'add', n2: ++n2, text: op.text }
    if (op.type === 'del') return { type: 'del', n1: ++n1, text: op.text }
    n1++; n2++
    return { type: 'ctx', n1, n2, text: op.text }
  })

  const added = lines.filter((l) => l.type === 'add').length
  const removed = lines.filter((l) => l.type === 'del').length
  if (added === 0 && removed === 0) return { hunks: [], added: 0, removed: 0 }

  // Group into hunks: keep up to CONTEXT context lines around changes, collapse the rest.
  const changed = lines.map((l) => l.type !== 'ctx')
  const keep = new Array(lines.length).fill(false)
  for (let k = 0; k < lines.length; k++) {
    if (!changed[k]) continue
    for (let d = -CONTEXT; d <= CONTEXT; d++) {
      const idx = k + d
      if (idx >= 0 && idx < lines.length) keep[idx] = true
    }
  }

  const hunks: DiffHunk[] = []
  let current: DiffLine[] | null = null
  for (let k = 0; k < lines.length; k++) {
    if (keep[k]) {
      if (!current) { current = []; hunks.push({ header: '', lines: current }) }
      current.push(lines[k])
    } else {
      current = null
    }
  }
  // Header shows the 1-based start position on each side for the hunk.
  for (const h of hunks) {
    const first = h.lines[0]
    const s1 = first.n1 ?? first.n2 ?? 1
    const s2 = first.n2 ?? first.n1 ?? 1
    h.header = `@@ -${s1} +${s2} @@`
  }
  return { hunks, added, removed }
}
