import * as nodemailer from 'nodemailer'
import { escapeHtml, MailService } from './mail.service'

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
