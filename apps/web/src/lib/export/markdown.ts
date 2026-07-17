// Markdown (.md) export — lazily imported from WorkPage so turndown + the GFM plugin stay
// out of the main bundle and load only on first export.
import TurndownService from 'turndown'
import { tables, strikethrough } from 'turndown-plugin-gfm'
import { parseHtml, serialize, rasterizeSvgImages } from './prepare'
import { sanitizeFileName, triggerDownload } from './download'

const MD_MIME = 'text/markdown;charset=utf-8'

/** A turndown service configured for our editor's HTML (GFM tables + our custom nodes). */
function buildService(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  })

  // GFM tables + ~~strikethrough~~. We deliberately do NOT pull in the plugin's own
  // task-list rule — it only matches a checkbox that is the LI's first child, which our
  // TaskItem markup (label > input, then a content div) is not. Our rule below handles it.
  service.use([tables, strikethrough])

  // Task/checklist item → GFM "- [ ] " / "- [x] " syntax.
  service.addRule('taskItem', {
    filter: (node) =>
      node.nodeName === 'LI' && (node as HTMLElement).getAttribute('data-type') === 'taskItem',
    replacement: (content, node) => {
      const checked = (node as HTMLElement).getAttribute('data-checked') === 'true'
      const text = content.replace(/\s+/g, ' ').trim()
      return `- [${checked ? 'x' : ' '}] ${text}\n`
    },
  })

  // Box callout → blockquote (prefix every line with "> ").
  service.addRule('tbBox', {
    filter: (node) =>
      node.nodeName === 'DIV' && (node as HTMLElement).classList.contains('tb-box'),
    replacement: (content) => {
      const body = content.trim()
      if (!body) return ''
      const quoted = body
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n')
      return `\n\n${quoted}\n\n`
    },
  })

  return service
}

/**
 * Convert editor HTML to a Markdown string. Pure (no canvas / no download) so it is
 * unit-testable in jsdom. SVG rasterization happens in `exportMarkdown`, before this.
 */
export function htmlToMarkdown(html: string): string {
  return buildService().turndown(html).trim() + '\n'
}

/** Convert the document HTML to Markdown and trigger a `.md` download. */
export async function exportMarkdown(html: string, docName: string): Promise<void> {
  const doc = parseHtml(html)
  await rasterizeSvgImages(doc) // drawings → embedded PNG (Markdown has no inline SVG)
  const markdown = htmlToMarkdown(serialize(doc))
  triggerDownload(new Blob([markdown], { type: MD_MIME }), `${sanitizeFileName(docName)}.md`)
}
