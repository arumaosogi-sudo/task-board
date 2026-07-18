import { buildCorsOrigin } from './cors'

// The bug this pins: a disallowed Origin used to be rejected by calling the cors
// callback with an Error, which `cors` turns into next(err) → a raw HTTP 500.
// The fix rejects via (null, false) so the browser simply blocks it and the
// request completes cleanly (no 500). These tests assert the callback contract.
describe('buildCorsOrigin', () => {
  const allowed = ['http://localhost:5173', 'https://app.example.com']

  const resolve = (origin: string | undefined) =>
    new Promise<{ err: Error | null; allow?: boolean }>((done) => {
      buildCorsOrigin(allowed)(origin, (err, allow) => done({ err, allow }))
    })

  it('allows a whitelisted origin', async () => {
    await expect(resolve('https://app.example.com')).resolves.toEqual({ err: null, allow: true })
  })

  it('allows requests with no Origin header (same-origin / curl / server-to-server)', async () => {
    await expect(resolve(undefined)).resolves.toEqual({ err: null, allow: true })
  })

  it('rejects a disallowed origin WITHOUT throwing — (null, false), never (Error, …)', async () => {
    const { err, allow } = await resolve('https://evil.example.com')
    // The crux of the fix: no Error is passed, so cors won't emit a 500.
    expect(err).toBeNull()
    expect(allow).toBe(false)
  })
})
