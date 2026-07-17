// Shared download helpers for document export (Word / Markdown).
// Kept dependency-free and tiny so it can live in whichever lazy export chunk imports it.

// Filesystem-illegal characters on Windows/macOS, plus ASCII control chars. Spaces and
// hyphens are intentionally preserved (both are legal and common in report/Thai names).
// eslint-disable-next-line no-control-regex
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g

/**
 * Turn a document name into a safe file basename. Strips filesystem-illegal characters,
 * collapses whitespace, and trims trailing dots/spaces (which break Windows). Falls back
 * to `document` so we never produce an empty or dot-only name. The extension is added by
 * the caller.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(ILLEGAL_FILENAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned || 'document'
}

/** Save a Blob to disk via a transient object URL + anchor click. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the download has committed to the URL first.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
