import { GmailApiHttpError, GmailApiTransport } from './gmail-api.transport'
import { isTransientMailError } from './mail.service'

// NOTE: this spec deliberately does NOT mock nodemailer — buildRawMessage must
// exercise nodemailer's REAL MIME generation (RFC2047 encoded-words for Thai
// subjects, multipart/alternative assembly). Only global fetch is mocked.

type FetchResult = {
  ok: boolean
  status: number
  json?: () => Promise<unknown>
  text?: () => Promise<string>
}

const tokenRes = (accessToken: string, expiresIn = 3600): FetchResult => ({
  ok: true,
  status: 200,
  json: async () => ({ access_token: accessToken, expires_in: expiresIn }),
  text: async () => '',
})

const sendOk = (): FetchResult => ({ ok: true, status: 200, text: async () => '' })

const httpErr = (status: number, body = '{}'): FetchResult => ({
  ok: false,
  status,
  text: async () => body,
  json: async () => JSON.parse(body),
})

const mockFetch = () => {
  const fn = jest.fn()
  ;(globalThis as { fetch: unknown }).fetch = fn
  return fn
}

const build = (over: Partial<ConstructorParameters<typeof GmailApiTransport>[0]> = {}) =>
  new GmailApiTransport({
    clientId: 'cid',
    clientSecret: 'secret',
    refreshToken: 'refresh',
    ...over,
  })

describe('GmailApiTransport — token refresh + caching', () => {
  it('refreshes the access token via the refresh-token grant', async () => {
    const fetch = mockFetch()
    fetch.mockResolvedValueOnce(tokenRes('AT-1'))
    const t = build()

    await expect(t.getAccessToken()).resolves.toBe('AT-1')

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(init.method).toBe('POST')
    const body = String(init.body)
    expect(body).toContain('grant_type=refresh_token')
    expect(body).toContain('refresh_token=refresh')
  })

  it('caches the token and does not refetch until near expiry', async () => {
    const fetch = mockFetch()
    fetch.mockResolvedValue(tokenRes('AT-1', 3600))
    let clock = 1_000_000
    const t = build({ now: () => clock })

    await t.getAccessToken() // fetch #1
    await t.getAccessToken() // cached
    clock += 3_000_000 // still >60s before the 3600s expiry
    await t.getAccessToken() // cached

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('refetches once the cached token is within the 60s expiry skew', async () => {
    const fetch = mockFetch()
    fetch.mockResolvedValueOnce(tokenRes('AT-1', 3600)).mockResolvedValueOnce(tokenRes('AT-2', 3600))
    let clock = 1_000_000
    const t = build({ now: () => clock })

    await expect(t.getAccessToken()).resolves.toBe('AT-1')
    clock += 3_600_000 - 30_000 // inside the 60s skew window → must refresh
    await expect(t.getAccessToken()).resolves.toBe('AT-2')

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws a permanent GmailApiHttpError when the refresh token is rejected', async () => {
    const fetch = mockFetch()
    fetch.mockResolvedValue(httpErr(400, '{"error":"invalid_grant"}'))
    const t = build()

    const err = await t.getAccessToken().catch((e) => e)
    expect(err).toBeInstanceOf(GmailApiHttpError)
    expect(err.httpStatus).toBe(400) // 400 → permanent, not retried
    // Body is echoed; the request body (which carries the secret) is never logged.
    expect(err.message).toContain('invalid_grant')
  })
})

describe('GmailApiTransport — sendRaw', () => {
  it('POSTs the raw MIME to the media-upload endpoint with a bearer token', async () => {
    const fetch = mockFetch()
    fetch.mockResolvedValueOnce(tokenRes('AT-1')).mockResolvedValueOnce(sendOk())
    const t = build()

    await expect(t.sendRaw(Buffer.from('raw-mime'))).resolves.toBeUndefined()

    expect(fetch).toHaveBeenCalledTimes(2)
    const [url, init] = fetch.mock.calls[1]
    expect(url).toContain('gmail.googleapis.com/upload/gmail/v1/users/me/messages/send')
    expect(url).toContain('uploadType=media')
    expect(init.headers['Content-Type']).toBe('message/rfc822')
    expect(init.headers.Authorization).toBe('Bearer AT-1')
    expect(Buffer.from(init.body).toString('utf8')).toBe('raw-mime')
  })

  it('throws GmailApiHttpError carrying the HTTP status on a non-2xx send', async () => {
    const fetch = mockFetch()
    fetch.mockResolvedValueOnce(tokenRes('AT-1')).mockResolvedValueOnce(httpErr(403, '{"error":"forbidden"}'))
    const t = build()

    await expect(t.sendRaw(Buffer.from('x'))).rejects.toMatchObject({
      name: 'GmailApiHttpError',
      httpStatus: 403,
    })
  })
})

describe('GmailApiTransport — retry classification (isTransientMailError)', () => {
  it('treats 429 and 5xx Gmail errors as transient', () => {
    expect(isTransientMailError(new GmailApiHttpError('rate', 429))).toBe(true)
    expect(isTransientMailError(new GmailApiHttpError('server', 500))).toBe(true)
    expect(isTransientMailError(new GmailApiHttpError('bad gw', 503))).toBe(true)
  })

  it('treats 400/401/403 Gmail errors as permanent', () => {
    expect(isTransientMailError(new GmailApiHttpError('bad', 400))).toBe(false)
    expect(isTransientMailError(new GmailApiHttpError('unauth', 401))).toBe(false)
    expect(isTransientMailError(new GmailApiHttpError('forbidden', 403))).toBe(false)
  })

  it('treats a network/abort error (no httpStatus) as transient', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    expect(isTransientMailError(abort)).toBe(true)
  })
})

describe('GmailApiTransport — MIME generation (Thai round-trip)', () => {
  /**
   * Recover a needle from the raw MIME regardless of the transfer-encoding
   * nodemailer picked (7bit literal, base64, or quoted-printable). For base64 we
   * compare a padding/boundary-agnostic prefix against the whitespace-stripped raw.
   */
  const bodyCarries = (raw: string, needle: string): boolean => {
    if (raw.includes(needle)) return true
    const compact = raw.replace(/\s+/g, '')
    const b64 = Buffer.from(needle, 'utf8').toString('base64').replace(/=+$/, '')
    const b64Prefix = b64.slice(0, Math.max(0, b64.length - 4))
    if (b64Prefix && compact.includes(b64Prefix)) return true
    const qp = Buffer.from(needle, 'utf8')
      .toString('hex')
      .toUpperCase()
      .replace(/(..)/g, '=$1')
    if (raw.replace(/=\r?\n/g, '').includes(qp)) return true
    return false
  }

  it('encodes a Thai subject as an RFC2047 encoded-word (not raw bytes)', async () => {
    const t = build()
    const subject = 'ยืนยันอีเมลของคุณ — Task Board'
    const raw = (
      await t.buildRawMessage({
        from: 'from@gmail.com',
        to: 'to@x.io',
        subject,
        html: '<p>hi</p>',
        text: 'hi',
      })
    ).toString('utf8')

    const subjectLine = raw.split(/\r?\n/).find((l) => l.startsWith('Subject:')) ?? ''
    expect(subjectLine).toMatch(/=\?UTF-8\?/i)
    expect(subjectLine).not.toContain('ยืนยัน')
  })

  it('carries the Thai body through the round-trip and assembles both parts', async () => {
    const t = build()
    const thaiBody = 'คลิกเพื่อยืนยันอีเมล'
    const raw = (
      await t.buildRawMessage({
        from: 'from@gmail.com',
        to: 'to@x.io',
        subject: 'x',
        html: `<p>${thaiBody}</p>`,
        text: thaiBody,
      })
    ).toString('utf8')

    expect(raw).toContain('Content-Type: text/plain')
    expect(raw).toContain('Content-Type: text/html')
    expect(bodyCarries(raw, thaiBody)).toBe(true)
  })

  it('applies custom headers (List-Unsubscribe)', async () => {
    const t = build()
    const raw = (
      await t.buildRawMessage({
        from: 'from@gmail.com',
        to: 'to@x.io',
        subject: 'x',
        html: '<p>hi</p>',
        text: 'hi',
        headers: { 'List-Unsubscribe': '<mailto:from@gmail.com?subject=unsubscribe>' },
      })
    ).toString('utf8')

    expect(raw).toContain('List-Unsubscribe:')
  })
})
