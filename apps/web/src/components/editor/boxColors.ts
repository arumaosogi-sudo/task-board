// Sprint 4 — Box color presets (owner: "ปรับแต่งสีเพื่อเพิ่มความชัดเจน").
//
// A deliberately small, design-system-aligned palette. The owner asked to let users color
// their boxes, while UI_GUIDELINES forbids an open hex picker (keeps the design language).
// So: a fixed set of presets, no free color input.
//
// Each preset is a light pastel background paired with a saturated border. Box text is
// pinned to a dark ink (see `.tb-box[data-tinted]` in index.css) so EVERY preset stays
// WCAG-AA readable on its pastel in BOTH light and dark mode — the tint reads like a
// highlighter, not a theme surface.
//
// Colors persist as inline `style` on <div.tb-box> (Box.ts renderHTML), so they round-trip
// through File.content and the PDF export exactly like the existing `width` attribute.

export interface BoxColor {
  id: string
  /** null bg/border = the default themed box (primary-soft). */
  bg: string | null
  border: string | null
  /** i18n key under `editor.boxColors.*`. */
  labelKey: string
}

export const BOX_COLORS: BoxColor[] = [
  { id: 'default', bg: null, border: null, labelKey: 'editor.boxColors.default' },
  { id: 'slate', bg: '#eef1f5', border: '#64748b', labelKey: 'editor.boxColors.slate' },
  { id: 'red', bg: '#fdecec', border: '#e5484d', labelKey: 'editor.boxColors.red' },
  { id: 'amber', bg: '#fdf3e0', border: '#d9821a', labelKey: 'editor.boxColors.amber' },
  { id: 'green', bg: '#e6f6ec', border: '#16a34a', labelKey: 'editor.boxColors.green' },
  { id: 'blue', bg: '#e7f0fd', border: '#2f7fe0', labelKey: 'editor.boxColors.blue' },
  { id: 'violet', bg: '#efeafe', border: '#7c5cff', labelKey: 'editor.boxColors.violet' },
]

const BG_SET = new Set(BOX_COLORS.map((c) => c.bg).filter(Boolean) as string[])
const BORDER_SET = new Set(BOX_COLORS.map((c) => c.border).filter(Boolean) as string[])

// Normalize a CSS color to lowercase `#rrggbb`, or null. Handles both the hex we author in
// renderHTML AND the `rgb(...)` form the DOM returns when reading `el.style.backgroundColor`
// (browsers reserialize inline color values), so parse/validate is symmetric across both.
export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null
  const c = input.trim().toLowerCase()
  const hex6 = c.match(/^#([0-9a-f]{6})$/)
  if (hex6) return `#${hex6[1]}`
  const hex3 = c.match(/^#([0-9a-f]{3})$/)
  if (hex3) return `#${hex3[1].split('').map((x) => x + x).join('')}`
  const rgb = c.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/)
  if (rgb) {
    const h = (n: string) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0')
    return `#${h(rgb[1])}${h(rgb[2])}${h(rgb[3])}`
  }
  return null
}

// Validate a parsed color against the preset palette. Rejects anything not in the palette
// (arbitrary or injected inline colors from hand-crafted File.content) → falls back to null
// so the box renders as the safe themed default. This is the enforcement point that keeps
// boxes inside the design language regardless of what HTML reaches parseHTML.
export function validBoxBg(input: string | null | undefined): string | null {
  const hex = normalizeHex(input)
  return hex && BG_SET.has(hex) ? hex : null
}

export function validBoxBorder(input: string | null | undefined): string | null {
  const hex = normalizeHex(input)
  return hex && BORDER_SET.has(hex) ? hex : null
}

// Resolve the active preset id from a stored background (drives aria-pressed in the picker).
export function boxColorIdFromBg(bg: string | null | undefined): string {
  const hex = normalizeHex(bg)
  return BOX_COLORS.find((c) => c.bg === hex)?.id ?? 'default'
}
