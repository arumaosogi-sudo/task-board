import { describe, it, expect } from 'vitest'
import { resolveShareAssets, assetProxyPrefix } from './share'

// The stored snapshot uses opaque `tbasset:<id>` placeholders (the server never has the
// plaintext token); the client swaps them for token-scoped proxy URLs at render time.
describe('resolveShareAssets', () => {
  it('rewrites every tbasset placeholder to the token-scoped proxy URL', () => {
    const html = `<img src="tbasset:a1"><p>x</p><img src="tbasset:a2">`
    const out = resolveShareAssets(html, 'TOK')
    const prefix = assetProxyPrefix('TOK')
    expect(out).toContain(`src="${prefix}a1"`)
    expect(out).toContain(`src="${prefix}a2"`)
    expect(out).not.toContain('tbasset:')
  })

  it('URL-encodes the token in the proxy prefix', () => {
    expect(assetProxyPrefix('a/b')).toContain('a%2Fb')
  })

  it('leaves content without placeholders untouched', () => {
    const html = `<p>hello</p>`
    expect(resolveShareAssets(html, 'TOK')).toBe(html)
  })
})
