import { Logger } from '@nestjs/common'
import * as nodemailer from 'nodemailer'
import { escapeHtml, isTransientMailError, MailService } from './mail.service'

jest.mock('nodemailer')

// P2 Hardening — HTML-injection defence in outbound email. `projectName` and
// `inviterName` are fully user-controlled (no character restriction), so they
// must be escaped before entering the HTML body or an attacker could inject
// markup/links into a mail we send on their behalf. These tests pin the escape
// helper and prove `sendInvitationEmail` actually emits escaped HTML.
describe('MailService — HTML escaping', () => {
  describe('escapeHtml', () => {
    it('escapes all five HTML-significant characters', () => {
      expect(escapeHtml('&')).toBe('&amp;')
      expect(escapeHtml('<')).toBe('&lt;')
      expect(escapeHtml('>')).toBe('&gt;')
      expect(escapeHtml('"')).toBe('&quot;')
      expect(escapeHtml("'")).toBe('&#39;')
    })

    it('neutralises a script-tag payload', () => {
      expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    })

    it('escapes ampersands first so entities are not double-mangled', () => {
      // If `&` were replaced after `<`, the output would contain `&amp;lt;`.
      expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;')
    })

    it('leaves safe text untouched', () => {
      expect(escapeHtml('Marketing Q3')).toBe('Marketing Q3')
    })
  })

  describe('sendInvitationEmail', () => {
    let sendMail: jest.Mock

    const buildService = () => {
      sendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' })
      ;(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail })
      // ConfigService.get(key, default) — return the caller's default in tests.
      const config = { get: jest.fn((_key: string, def?: string) => def) }
      return new MailService(config as never)
    }

    it('escapes a malicious projectName in the HTML body (not the raw tag)', async () => {
      const service = buildService()
      await service.sendInvitationEmail('victim@x.io', 'tok', '<script>alert(1)</script>', 'Bob')

      const html = sendMail.mock.calls[0][0].html as string
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
      expect(html).not.toContain('<script>')
    })

    it('escapes a malicious inviterName in the HTML body', async () => {
      const service = buildService()
      await service.sendInvitationEmail('victim@x.io', 'tok', 'Proj', '"><img src=x onerror=alert(1)>')

      const html = sendMail.mock.calls[0][0].html as string
      expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;')
      expect(html).not.toContain('<img')
    })

    it('keeps the plain-text part raw (it is not HTML) — escaping there would corrupt it', async () => {
      const service = buildService()
      await service.sendInvitationEmail('victim@x.io', 'tok', 'A & B', 'Bob')

      const { text, html } = sendMail.mock.calls[0][0]
      expect(text).toContain('A & B') // raw in text/plain
      expect(html).toContain('A &amp; B') // escaped in text/html
    })
  })
})

// Delivery reporting, bounded retry, boot-time health probe, and the dev-only
// link fallback. These are the behaviours the auth flow depends on to tell a
// user honestly whether their email actually went out.
describe('MailService — delivery result, retry, health & dev fallback', () => {
  let warn: jest.SpyInstance
  let log: jest.SpyInstance

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    // Silence the expected error-level logs from failed-delivery paths.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  /** Build a service with a controllable transporter + config (env overrides). */
  const build = (opts: {
    sendMail?: jest.Mock
    verify?: jest.Mock
    env?: Record<string, string>
  }) => {
    const sendMail = opts.sendMail ?? jest.fn().mockResolvedValue({ messageId: 'ok' })
    const verify = opts.verify ?? jest.fn().mockResolvedValue(true)
    ;(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail, verify })
    const env = opts.env ?? {}
    const config = { get: jest.fn((key: string, def?: string) => env[key] ?? def) }
    const service = new MailService(config as never)
    return { service, sendMail, verify }
  }

  const err = (over: { code?: string; responseCode?: number; message?: string }) =>
    Object.assign(new Error(over.message ?? 'smtp error'), over)

  describe('send() delivery result', () => {
    it('returns true when the SMTP server accepts the message', async () => {
      const { service, sendMail } = build({})
      await expect(service.sendVerificationEmail('a@x.io', 'tok')).resolves.toBe(true)
      expect(sendMail).toHaveBeenCalledTimes(1)
    })

    it('returns false (not throwing) when delivery ultimately fails', async () => {
      const sendMail = jest.fn().mockRejectedValue(err({ code: 'EAUTH' }))
      const { service } = build({ sendMail, env: { SMTP_HOST: 'smtp.example.com' } })
      await expect(service.sendPasswordResetEmail('a@x.io', 'tok')).resolves.toBe(false)
    })
  })

  describe('retry with backoff', () => {
    it('retries a transient failure and succeeds on a later attempt', async () => {
      const sendMail = jest
        .fn()
        .mockRejectedValueOnce(err({ code: 'ECONNECTION' }))
        .mockResolvedValueOnce({ messageId: 'ok' })
      const { service } = build({ sendMail, env: { SMTP_HOST: 'smtp.example.com' } })

      await expect(service.sendVerificationEmail('a@x.io', 'tok')).resolves.toBe(true)
      expect(sendMail).toHaveBeenCalledTimes(2)
    })

    it('gives up after the max attempts (1 + 2 retries) and returns false', async () => {
      const sendMail = jest.fn().mockRejectedValue(err({ code: 'ETIMEDOUT' }))
      const { service } = build({ sendMail, env: { SMTP_HOST: 'smtp.example.com' } })

      await expect(service.sendVerificationEmail('a@x.io', 'tok')).resolves.toBe(false)
      expect(sendMail).toHaveBeenCalledTimes(3)
    })

    it('does NOT retry a permanent error (auth failure) — one attempt only', async () => {
      const sendMail = jest.fn().mockRejectedValue(err({ code: 'EAUTH' }))
      const { service } = build({ sendMail, env: { SMTP_HOST: 'smtp.example.com' } })

      await expect(service.sendVerificationEmail('a@x.io', 'tok')).resolves.toBe(false)
      expect(sendMail).toHaveBeenCalledTimes(1)
    })
  })

  describe('isTransientMailError', () => {
    it('treats connection/timeout/socket/dns and 4xx as transient', () => {
      expect(isTransientMailError(err({ code: 'ECONNECTION' }))).toBe(true)
      expect(isTransientMailError(err({ code: 'ETIMEDOUT' }))).toBe(true)
      expect(isTransientMailError(err({ code: 'ESOCKET' }))).toBe(true)
      expect(isTransientMailError(err({ responseCode: 421 }))).toBe(true)
    })
    it('treats auth/envelope/message and 5xx as permanent', () => {
      expect(isTransientMailError(err({ code: 'EAUTH' }))).toBe(false)
      expect(isTransientMailError(err({ code: 'EENVELOPE' }))).toBe(false)
      expect(isTransientMailError(err({ responseCode: 550 }))).toBe(false)
    })
  })

  describe('dev link fallback', () => {
    const fallbackLines = () =>
      warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('[MAIL-FALLBACK]'))

    it('logs the actionable link when a send fails outside production', async () => {
      const sendMail = jest.fn().mockRejectedValue(err({ code: 'EAUTH' }))
      const { service } = build({
        sendMail,
        env: { SMTP_HOST: 'smtp.example.com', NODE_ENV: 'development', WEB_URL: 'http://localhost:5173' },
      })

      await service.sendVerificationEmail('dev@x.io', 'tok123')

      const lines = fallbackLines()
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain('verification link for dev@x.io')
      expect(lines[0]).toContain('http://localhost:5173/verify-email?token=tok123')
    })

    it('NEVER logs the link fallback in production, even when the send fails', async () => {
      const sendMail = jest.fn().mockRejectedValue(err({ code: 'EAUTH' }))
      const { service } = build({
        sendMail,
        env: { SMTP_HOST: 'smtp.example.com', NODE_ENV: 'production' },
      })

      await service.sendPasswordResetEmail('user@x.io', 'tok')

      expect(fallbackLines()).toHaveLength(0)
    })

    it('logs the link when SMTP is unconfigured (dev with zero setup)', async () => {
      // No SMTP_HOST → unconfigured; even a "successful" send to the localhost
      // default should surface the link so a dev can complete the flow by hand.
      const { service } = build({ env: { NODE_ENV: 'development' } })

      await service.sendVerificationEmail('dev@x.io', 'tok')

      expect(fallbackLines()).toHaveLength(1)
    })
  })

  describe('boot health probe', () => {
    it('logs OK when transporter.verify() succeeds', async () => {
      const verify = jest.fn().mockResolvedValue(true)
      const { service } = build({ verify, env: { SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465' } })

      await service.verifyTransport()

      expect(verify).toHaveBeenCalledTimes(1)
      expect(log.mock.calls.some((c) => String(c[0]).includes('SMTP verify OK → smtp.example.com:465'))).toBe(true)
    })

    it('logs a non-fatal FAIL warning when verify() rejects (does not throw)', async () => {
      const verify = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      const { service } = build({ verify, env: { SMTP_HOST: 'smtp.example.com' } })

      await expect(service.verifyTransport()).resolves.toBeUndefined()
      expect(warn.mock.calls.some((c) => String(c[0]).includes('SMTP verify FAILED'))).toBe(true)
    })

    it('onModuleInit never blocks boot: returns synchronously even if verify() hangs forever', () => {
      // A blackholed SMTP host (packets dropped, no RST) makes verify() a promise
      // that neither resolves nor rejects for minutes. Boot must not await it —
      // this is the exact failure that 502'd the Railway deploy.
      const verify = jest.fn().mockReturnValue(new Promise(() => {}))
      const { service } = build({ verify, env: { SMTP_HOST: 'smtp.example.com' } })

      expect(service.onModuleInit()).toBeUndefined()
      expect(verify).toHaveBeenCalledTimes(1)
    })
  })
})

// Gmail API (HTTPS) transport mode. Railway trial blackholes SMTP, so when the
// Gmail OAuth env is configured the service delivers over HTTPS instead. These
// tests pin transport SELECTION and the non-blocking boot probe; the transport's
// own HTTP/OAuth/MIME behaviour lives in gmail-api.transport.spec.ts.
describe('MailService — Gmail API transport mode', () => {
  let warn: jest.SpyInstance
  let log: jest.SpyInstance
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    originalFetch = globalThis.fetch
  })
  afterEach(() => {
    jest.restoreAllMocks()
    globalThis.fetch = originalFetch
  })

  const gmailEnv = {
    GMAIL_OAUTH_CLIENT_ID: 'cid',
    GMAIL_OAUTH_CLIENT_SECRET: 'sec',
    GMAIL_REFRESH_TOKEN: 'rt',
  }

  const build = (opts: { sendMail?: jest.Mock; env?: Record<string, string> }) => {
    // The mocked createTransport backs BOTH the (unused) SMTP transporter and the
    // stream MIME builder inside GmailApiTransport. In Gmail mode `sendMail` is
    // only invoked to BUILD the MIME (info.message), never as the delivery channel.
    const sendMail = opts.sendMail ?? jest.fn().mockResolvedValue({ message: Buffer.from('mime') })
    ;(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail, verify: jest.fn() })
    const env = opts.env ?? {}
    const config = { get: jest.fn((key: string, def?: string) => env[key] ?? def) }
    return { service: new MailService(config as never), sendMail }
  }

  const okTokenRes = () => ({
    ok: true,
    status: 200,
    json: async () => ({ access_token: 'AT', expires_in: 3600 }),
    text: async () => '',
  })
  const okSendRes = () => ({ ok: true, status: 200, text: async () => '' })

  describe('transport selection', () => {
    it('chooses Gmail API when refresh token + client id/secret are configured', () => {
      const { service } = build({ env: gmailEnv })
      expect(service.mailMode).toBe('gmail-api')
    })

    it('falls back to the GOOGLE_* OAuth credentials for client id/secret', () => {
      const { service } = build({
        env: { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', GMAIL_REFRESH_TOKEN: 'rt' },
      })
      expect(service.mailMode).toBe('gmail-api')
    })

    it('uses SMTP when no Gmail refresh token is present', () => {
      const { service } = build({ env: { SMTP_HOST: 'smtp.example.com' } })
      expect(service.mailMode).toBe('smtp')
    })

    it('uses SMTP when the refresh token is set but client credentials are missing', () => {
      const { service } = build({ env: { GMAIL_REFRESH_TOKEN: 'rt' } })
      expect(service.mailMode).toBe('smtp')
    })
  })

  describe('delivery routing', () => {
    it('delivers over HTTPS (Gmail send endpoint), building the MIME exactly once', async () => {
      const fetch = jest.fn().mockResolvedValueOnce(okTokenRes()).mockResolvedValueOnce(okSendRes())
      globalThis.fetch = fetch as never
      const { service, sendMail } = build({ env: gmailEnv })

      await expect(service.sendVerificationEmail('a@x.io', 'tok')).resolves.toBe(true)

      // 1 fetch to refresh the token, 1 to POST the message.
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(String(fetch.mock.calls[1][0])).toContain('messages/send')
      // MIME built once (outside the retry loop), not re-sent via SMTP.
      expect(sendMail).toHaveBeenCalledTimes(1)
    })

    it('returns false when the Gmail send is permanently rejected (403)', async () => {
      const fetch = jest
        .fn()
        .mockResolvedValueOnce(okTokenRes())
        .mockResolvedValueOnce({ ok: false, status: 403, text: async () => '{"error":"forbidden"}' })
      globalThis.fetch = fetch as never
      const { service } = build({ env: gmailEnv })

      await expect(service.sendPasswordResetEmail('a@x.io', 'tok')).resolves.toBe(false)
      // token + one send attempt; 403 is permanent → no retry.
      expect(fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('boot probe', () => {
    it('never blocks boot: onModuleInit returns synchronously even if the token fetch hangs', () => {
      globalThis.fetch = jest.fn().mockReturnValue(new Promise(() => {})) as never
      const { service } = build({ env: gmailEnv })

      expect(service.onModuleInit()).toBeUndefined()
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    })

    it('logs OK when the boot token refresh succeeds', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(okTokenRes()) as never
      const { service } = build({ env: gmailEnv })

      await service.verifyGmail()

      expect(log.mock.calls.some((c) => String(c[0]).includes('Gmail API verify OK'))).toBe(true)
    })

    it('logs a non-fatal FAIL (does not throw) when the boot refresh is rejected', async () => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 400, text: async () => '{"error":"invalid_grant"}' }) as never
      const { service } = build({ env: gmailEnv })

      await expect(service.verifyGmail()).resolves.toBeUndefined()
      expect(warn.mock.calls.some((c) => String(c[0]).includes('Gmail API verify FAILED'))).toBe(true)
    })
  })
})
