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

  describe('onModuleInit health probe', () => {
    it('logs OK when transporter.verify() succeeds', async () => {
      const verify = jest.fn().mockResolvedValue(true)
      const { service } = build({ verify, env: { SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465' } })

      await service.onModuleInit()

      expect(verify).toHaveBeenCalledTimes(1)
      expect(log.mock.calls.some((c) => String(c[0]).includes('SMTP verify OK → smtp.example.com:465'))).toBe(true)
    })

    it('logs a non-fatal FAIL warning when verify() rejects (does not throw)', async () => {
      const verify = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      const { service } = build({ verify, env: { SMTP_HOST: 'smtp.example.com' } })

      await expect(service.onModuleInit()).resolves.toBeUndefined()
      expect(warn.mock.calls.some((c) => String(c[0]).includes('SMTP verify FAILED'))).toBe(true)
    })
  })
})
