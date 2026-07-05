// Phase 4.3 — deterministic presence colors for live cursors + avatar stacks.
// A user always maps to the same color across sessions/clients (derived from their id),
// so their caret and avatar are recognizable to everyone in the room.

const PALETTE = [
  '#f08a8a', '#e9c46a', '#82d178', '#5fc9d6', '#6d5bd0',
  '#e08ad0', '#2f7df0', '#f59e0b', '#16a34a', '#e0457b',
]

/** Stable color for a presence key (user id). Same key → same color, everywhere. */
export function colorFromKey(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

/** Uppercase initial for an avatar, safe for empty/whitespace names. */
export function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}
