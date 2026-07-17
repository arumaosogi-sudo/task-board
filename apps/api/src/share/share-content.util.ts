import sanitizeHtml from 'sanitize-html'

/**
 * Opaque scheme used as an image `src` placeholder in the STORED published snapshot,
 * e.g. `tbasset:clx123`. It is deliberately not a real, fetchable URL: the raw share
 * token is never stored, so the concrete asset-proxy URL
 * (`/public/share/<token>/assets/<assetId>`) can only be assembled by the client, which
 * already holds the token from its route. The public content endpoint returns the
 * placeholder as-is; the viewer swaps `tbasset:` for the real proxy prefix at render.
 */
export const ASSET_PLACEHOLDER_SCHEME = 'tbasset'

/** Minimal shape of a FileAsset needed to map an <img src> back to its id. */
export interface AssetRef {
  id: string
  url: string
  path: string
}

/**
 * Sanitize a document HTML snapshot for anonymous public serving and rewrite known
 * image sources to the opaque `tbasset:<id>` placeholder.
 *
 * Security posture (ADR 0006 I-3 / §5.1 — this is the single server-side choke point
 * that makes stored cross-user XSS impossible on the public page):
 *  - Drops <script>, event handlers, `javascript:` URLs, `<style>`, `<iframe>`, `<object>`,
 *    SVG/foreignObject, and any tag/attribute not on the allowlist below.
 *  - Restricts inline CSS to a handful of harmless presentational properties.
 *  - <img> whose src resolves to a known FileAsset of THIS file → `tbasset:<id>`; any
 *    other <img src> is dropped, so a stray external/signed URL can neither load nor
 *    leak a referer from the public page.
 */
export function sanitizeShareContent(html: string, assets: AssetRef[]): string {
  const byUrl = new Map(assets.map((a) => [a.url, a.id]))

  const resolveAssetId = (src: string): string | null => {
    if (!src) return null
    const exact = byUrl.get(src)
    if (exact) return exact
    // Fallback: a signed URL embeds the storage object path. Match on that so a
    // re-signed URL (different query token, same object) still resolves.
    for (const a of assets) {
      if (a.path && src.includes(a.path)) return a.id
    }
    return null
  }

  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'hr', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'sub', 'sup',
      'a', 'img',
      'ul', 'ol', 'li',
      'blockquote', 'code', 'pre',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'label', 'input', // TipTap task lists render a disabled checkbox inside a label
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      span: ['class', 'style', 'data-type', 'data-id', 'data-label'],
      div: ['class', 'style', 'data-type'],
      p: ['style'],
      h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'], h5: ['style'], h6: ['style'],
      ul: ['class', 'data-type'],
      ol: ['class', 'start'],
      li: ['class', 'data-type', 'data-checked'],
      td: ['colspan', 'rowspan', 'style'],
      th: ['colspan', 'rowspan', 'style'],
      code: ['class'],
      pre: ['class'],
      input: ['type', 'checked', 'disabled'],
      label: ['class'],
    },
    // Only our inert placeholder scheme survives on <img>; hyperlinks stay web/mail only.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: [ASSET_PLACEHOLDER_SCHEME] },
    allowProtocolRelative: false,
    // Whitelist a small set of presentational CSS props with strict value patterns —
    // blocks url(), expression(), and anything that could exfiltrate or execute.
    allowedStyles: {
      '*': {
        color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3}\s*,\s*){2}\d{1,3}\s*\)$/i, /^[a-z]+$/i],
        'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3}\s*,\s*){2}\d{1,3}\s*\)$/i, /^[a-z]+$/i],
        'text-align': [/^(left|right|center|justify)$/],
        'font-family': [/^[\w\s"',-]+$/],
      },
    },
    transformTags: {
      img: (_tag, attribs) => {
        const out: Record<string, string> = {}
        if (attribs.alt) out.alt = attribs.alt
        const id = resolveAssetId(attribs.src ?? '')
        // Known asset → opaque placeholder. Unknown source → empty (broken) img,
        // never its original src (no external load, no referer leak).
        if (id) out.src = `${ASSET_PLACEHOLDER_SCHEME}:${id}`
        return { tagName: 'img', attribs: out }
      },
      a: (_tag, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      input: (_tag, attribs) => {
        // Task-list checkboxes are display-only on the public page.
        const out: Record<string, string> = { type: 'checkbox', disabled: 'disabled' }
        if (attribs.checked !== undefined) out.checked = 'checked'
        return { tagName: 'input', attribs: out }
      },
    },
  })
}
