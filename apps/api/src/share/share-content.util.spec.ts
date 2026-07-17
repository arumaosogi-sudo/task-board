import { ASSET_PLACEHOLDER_SCHEME, AssetRef, sanitizeShareContent } from './share-content.util'

// The single server-side XSS choke point for the anonymous public page. These tests
// pin the security-critical behaviour: no script/handler survives, image sources are
// rewritten to an opaque placeholder, and unknown sources never load.
describe('sanitizeShareContent', () => {
  const assets: AssetRef[] = [
    { id: 'asset1', url: 'https://sb.example/storage/p1/f1/aaa.png?token=xyz', path: 'p1/f1/aaa.png' },
  ]

  it('strips <script> and inline event handlers (stored cross-user XSS)', () => {
    const dirty = `<p onclick="steal()">hi</p><script>alert(1)</script>`
    const clean = sanitizeShareContent(dirty, [])
    expect(clean).not.toMatch(/script/i)
    expect(clean).not.toMatch(/onclick/i)
    expect(clean).toContain('hi')
  })

  it('drops javascript: hrefs but keeps http/https links (hardened with rel/target)', () => {
    const clean = sanitizeShareContent(
      `<a href="javascript:alert(1)">x</a><a href="https://ok.example">y</a>`,
      [],
    )
    expect(clean).not.toMatch(/javascript:/i)
    expect(clean).toContain('href="https://ok.example"')
    expect(clean).toContain('rel="noopener noreferrer nofollow"')
  })

  it('rewrites a known asset <img src> to the opaque placeholder (exact URL match)', () => {
    const clean = sanitizeShareContent(`<img src="${assets[0].url}" alt="pic">`, assets)
    expect(clean).toContain(`src="${ASSET_PLACEHOLDER_SCHEME}:asset1"`)
    expect(clean).toContain('alt="pic"')
    expect(clean).not.toContain('sb.example')
  })

  it('rewrites by storage path when the signed URL query differs (re-signed URL)', () => {
    const clean = sanitizeShareContent(`<img src="https://sb.example/storage/p1/f1/aaa.png?token=DIFFERENT">`, assets)
    expect(clean).toContain(`${ASSET_PLACEHOLDER_SCHEME}:asset1`)
  })

  it('drops an unknown <img src> entirely (no external load / referer leak)', () => {
    const clean = sanitizeShareContent(`<img src="https://evil.example/track.gif">`, assets)
    expect(clean).not.toContain('evil.example')
    expect(clean).not.toMatch(/src=/)
  })

  it('forces task-list checkboxes to disabled (display-only)', () => {
    const clean = sanitizeShareContent(`<input type="checkbox" checked>`, [])
    expect(clean).toContain('disabled')
    expect(clean).toContain('checked')
  })

  it('removes disallowed tags (iframe/style) and unsafe CSS url()', () => {
    const clean = sanitizeShareContent(
      `<iframe src="https://evil"></iframe><p style="background-color:url(javascript:1)">t</p>`,
      [],
    )
    expect(clean).not.toMatch(/iframe/i)
    expect(clean).not.toMatch(/url\(/i)
    expect(clean).toContain('t')
  })

  it('preserves ordinary formatting (headings, lists, bold)', () => {
    const clean = sanitizeShareContent(`<h1>T</h1><ul><li><strong>a</strong></li></ul>`, [])
    expect(clean).toContain('<h1>T</h1>')
    expect(clean).toContain('<strong>a</strong>')
  })
})
