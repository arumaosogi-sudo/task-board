// Pure HTML→HTML adaptation for the Word exporter, split out from `word.ts` so it can be
// unit-tested without importing the heavy `@turbodocx/html-to-docx` converter.
import { parseHtml, serialize } from './prepare'

const CHECKED = '☑ '
const UNCHECKED = '☐ '

/**
 * Adapt editor HTML into a shape `@turbodocx/html-to-docx` renders faithfully:
 *   - `.tb-box` callouts → <blockquote> (the converter styles it with an indent + border).
 *   - Task lists → plain <ul> whose items are prefixed with ☑ / ☐ (the converter has no
 *     concept of a checkbox input, so we bake the state into the text).
 *   - @mention chips keep their literal "@username" text (already in the HTML) — no change.
 * Pure string→string so it is unit-testable without a real converter or canvas.
 */
export function normalizeDocxHtml(html: string): string {
  const doc = parseHtml(html)

  // Box callout → blockquote (preserve inner block content).
  doc.querySelectorAll('div.tb-box').forEach((div) => {
    const bq = doc.createElement('blockquote')
    while (div.firstChild) bq.appendChild(div.firstChild)
    div.replaceWith(bq)
  })

  // Task list → normal bullet list with a checkbox glyph baked into the text.
  doc.querySelectorAll('ul[data-type="taskList"]').forEach((ul) => {
    ul.removeAttribute('data-type')
    ul.querySelectorAll(':scope > li').forEach((li) => {
      const checked = li.getAttribute('data-checked') === 'true'
      li.removeAttribute('data-type')
      li.removeAttribute('data-checked')
      // Drop the interactive checkbox markup (label > input + span).
      li.querySelectorAll('label').forEach((l) => l.remove())
      // TaskItem content lives in a <div> wrapper; unwrap it so the converter sees li > p.
      const wrapper = li.querySelector('div')
      const glyphTarget = wrapper?.querySelector('p') ?? wrapper ?? li
      glyphTarget.insertBefore(doc.createTextNode(checked ? CHECKED : UNCHECKED), glyphTarget.firstChild)
      if (wrapper) {
        while (wrapper.firstChild) li.appendChild(wrapper.firstChild)
        wrapper.remove()
      }
    })
  })

  return serialize(doc)
}
