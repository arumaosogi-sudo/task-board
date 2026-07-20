import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import { GmailApiTransport } from './gmail-api.transport'

/**
 * Escape the 5 HTML-significant characters so user-controlled values (e.g. a
 * project name, which has no character restriction) cannot inject markup/links
 * into the email body. Must be applied to every user value before it enters an
 * HTML template. Links keep encodeURIComponent — do not run this on URLs.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Whether a transient send error is worth retrying. Connection/timeout/socket/
 * DNS failures and 4xx greylisting are temporary — retry. Auth failures, bad
 * envelopes, malformed messages and permanent 5xx rejections will fail again no
 * matter how many times we try, so we bail out immediately instead of burning
 * the backoff budget.
 */
export function isTransientMailError(err: unknown): boolean {
  const e = err as { code?: string; responseCode?: number; httpStatus?: number } | null
  // Gmail API (HTTPS) errors carry an `httpStatus`. HTTP semantics are the
  // INVERSE of SMTP: 429 (rate-limit) and 5xx (server) are worth retrying, while
  // 4xx (400 bad request, 401 unauthenticated, 403 forbidden) are permanent —
  // a revoked token or bad scope will fail identically on every retry.
  const http = e?.httpStatus
  if (typeof http === 'number') {
    return http === 429 || (http >= 500 && http < 600)
  }
  // Network/abort errors from the Gmail fetch (AbortError, fetch TypeError) have
  // no httpStatus and fall through to `return true` below — treated as transient.
  const code = e?.code ?? ''
  const rc = e?.responseCode
  if (code === 'EAUTH' || code === 'EENVELOPE' || code === 'EMESSAGE') return false
  if (typeof rc === 'number' && rc >= 500 && rc < 600) return false
  return true
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name)
  private readonly transporter: nodemailer.Transporter
  private readonly from: string
  private readonly webUrl: string
  private readonly host: string
  private readonly port: number
  /** dev fallback + retry tuning */
  private readonly isProd: boolean
  /** True when a real SMTP host was configured (vs. relying on the localhost default). */
  private readonly smtpConfigured: boolean
  /**
   * Primary delivery over the Gmail API (HTTPS) instead of SMTP. Set when the
   * Gmail OAuth env is fully configured; otherwise null and we use SMTP. See
   * `mailMode` for the resolved choice.
   */
  private readonly gmail: GmailApiTransport | null
  /** Which channel actually delivers mail — exposed for observability/tests. */
  readonly mailMode: 'gmail-api' | 'smtp'
  /** True when *some* real transport is configured (SMTP host or Gmail API). */
  private readonly mailConfigured: boolean
  /** 1 initial attempt + this many retries. */
  private readonly maxAttempts = 3
  private readonly baseBackoffMs = 200

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>('EMAIL_FROM', 'noreply@taskboard.local')
    this.webUrl = this.config.get<string>('WEB_URL', 'http://localhost:5173')
    this.isProd = this.config.get<string>('NODE_ENV') === 'production'

    const hostRaw = this.config.get<string>('SMTP_HOST')
    this.smtpConfigured = !!hostRaw && hostRaw.trim() !== ''
    this.host = this.smtpConfigured ? (hostRaw as string).trim() : 'localhost'
    // Guard against a non-numeric / out-of-range SMTP_PORT (e.g. "" or "smtp") —
    // Number() would yield NaN/0 and silently break outbound mail. Fall back to the
    // default (1025) with a loud warning so the misconfig is visible in the logs.
    const portRaw = this.config.get<string>('SMTP_PORT', '1025')
    const portNum = Number(portRaw)
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
      this.logger.warn(`Invalid SMTP_PORT "${portRaw}" — falling back to 1025`)
      this.port = 1025
    } else {
      this.port = portNum
    }
    const user = this.config.get<string>('SMTP_USER')
    // Strip whitespace — Gmail App Passwords are sometimes pasted with spaces.
    const pass = (this.config.get<string>('SMTP_PASS') ?? '').replace(/\s/g, '')

    this.logger.log(`SMTP → ${this.host}:${this.port} as ${user || '(no-auth)'}`)

    this.transporter = nodemailer.createTransport({
      host: this.host,
      port: this.port,
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: user ? { user, pass } : undefined,
      // Bounded timeouts: some hosts (e.g. Railway trial) silently drop outbound
      // SMTP packets, so without these a connect attempt hangs for nodemailer's
      // 2-minute default and every send (and the boot verify) stalls with it.
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 15_000,
    })

    // Gmail API (HTTPS) transport — the primary delivery path when configured.
    // Rationale: Railway trial blackholes SMTP; HTTPS egress is never blocked
    // (ADR 0009). Client id/secret fall back to the existing GOOGLE_* OAuth
    // credentials so the owner can reuse one OAuth client and only add a
    // GMAIL_REFRESH_TOKEN. Gmail mode activates only when all three are present.
    const gClientId = (
      this.config.get<string>('GMAIL_OAUTH_CLIENT_ID') ??
      this.config.get<string>('GOOGLE_CLIENT_ID') ??
      ''
    ).trim()
    const gClientSecret = (
      this.config.get<string>('GMAIL_OAUTH_CLIENT_SECRET') ??
      this.config.get<string>('GOOGLE_CLIENT_SECRET') ??
      ''
    ).trim()
    const gRefreshToken = (this.config.get<string>('GMAIL_REFRESH_TOKEN') ?? '').trim()

    if (gClientId && gClientSecret && gRefreshToken) {
      this.gmail = new GmailApiTransport({
        clientId: gClientId,
        clientSecret: gClientSecret,
        refreshToken: gRefreshToken,
      })
      this.mailMode = 'gmail-api'
      this.logger.log('Mail transport: Gmail API (HTTPS) — primary delivery path')
    } else {
      this.gmail = null
      this.mailMode = 'smtp'
    }
    this.mailConfigured = this.mailMode === 'gmail-api' || this.smtpConfigured
  }

  /**
   * Boot-time health probe. Non-fatal: a bad/unreachable SMTP config must not
   * stop the API from booting (the app degrades to the dev link-fallback rather
   * than crashing). We log a single, clear OK/FAIL line naming the host so an
   * operator sees at a glance whether outbound mail will work. No secrets logged.
   */
  onModuleInit(): void {
    // Fire-and-forget: NestJS awaits onModuleInit hooks before app.listen(), so
    // awaiting a network probe here lets an unreachable host (e.g. a PaaS that
    // blackholes outbound SMTP) stall the entire API boot — the process loads,
    // never binds the port, and the platform reports 502. The probe is purely
    // informational; run it in the background instead.
    if (this.gmail) {
      void this.verifyGmail()
    } else {
      void this.verifyTransport()
    }
  }

  /**
   * Boot-time probe for the Gmail API path — refreshes the access token to prove
   * the OAuth credentials still work. Same fire-and-forget contract as
   * `verifyTransport`: it must NEVER be awaited during boot. No secrets logged.
   */
  async verifyGmail(): Promise<void> {
    try {
      await this.gmail!.refreshAccessToken()
      this.logger.log('Gmail API verify OK — access token obtained')
    } catch (err) {
      this.logger.warn(
        `Gmail API verify FAILED: ${err instanceof Error ? err.message : String(err)}` +
          (this.isProd ? '' : ' (dev: verification/reset links will be logged as a fallback)'),
      )
    }
  }

  /** Boot-time probe body — awaitable directly in tests. */
  async verifyTransport(): Promise<void> {
    try {
      await this.transporter.verify()
      this.logger.log(`SMTP verify OK → ${this.host}:${this.port}`)
    } catch (err) {
      this.logger.warn(
        `SMTP verify FAILED → ${this.host}:${this.port}: ${err instanceof Error ? err.message : String(err)}` +
          (this.isProd ? '' : ' (dev: verification/reset links will be logged as a fallback)'),
      )
    }
  }

  /** @returns true if the message was accepted by the SMTP server, false otherwise. */
  sendVerificationEmail(to: string, token: string): Promise<boolean> {
    const link = `${this.webUrl}/verify-email?token=${encodeURIComponent(token)}`
    const subject = 'ยืนยันอีเมลของคุณ — Task Board'
    return this.send(to, subject, 'verification', link, {
      html: this.layout('ยืนยันอีเมลของคุณ', 'คลิกปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งาน Task Board ลิงก์นี้จะหมดอายุใน 24 ชั่วโมง', link, 'ยืนยันอีเมล'),
      text: `ยืนยันอีเมลของคุณ — Task Board\n\nคลิกลิงก์นี้เพื่อยืนยันอีเมลและเริ่มใช้งาน Task Board (หมดอายุใน 24 ชั่วโมง):\n${link}`,
    })
  }

  /** @returns true if the message was accepted by the SMTP server, false otherwise. */
  sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
    const link = `${this.webUrl}/reset-password?token=${encodeURIComponent(token)}`
    const subject = 'รีเซ็ตรหัสผ่าน — Task Board'
    return this.send(to, subject, 'password-reset', link, {
      html: this.layout('รีเซ็ตรหัสผ่าน', 'เราได้รับคำขอรีเซ็ตรหัสผ่านของคุณ คลิกปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ ลิงก์นี้จะหมดอายุใน 1 ชั่วโมง หากคุณไม่ได้ร้องขอ สามารถเพิกเฉยอีเมลนี้ได้', link, 'ตั้งรหัสผ่านใหม่'),
      text: `รีเซ็ตรหัสผ่าน — Task Board\n\nคลิกลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (หมดอายุใน 1 ชั่วโมง):\n${link}\n\nหากคุณไม่ได้ร้องขอ สามารถเพิกเฉยอีเมลนี้ได้`,
    })
  }

  /** @returns true if the message was accepted by the SMTP server, false otherwise. */
  sendInvitationEmail(to: string, token: string, projectName: string, inviterName: string): Promise<boolean> {
    const link = `${this.webUrl}/accept-invite?token=${encodeURIComponent(token)}`
    // Escape user-controlled values before they enter the HTML template. The
    // plain-text `subject`/`text` fields are not HTML, so they use the raw values.
    const safeProject = escapeHtml(projectName)
    const safeInviter = escapeHtml(inviterName)
    const subject = `คุณได้รับเชิญเข้าร่วม "${projectName}" — Task Board`
    return this.send(to, subject, 'invitation', link, {
      html: this.layout(`เชิญเข้าร่วม ${safeProject}`, `${safeInviter} เชิญคุณเข้าร่วม Project "${safeProject}" บน Task Board คลิกปุ่มด้านล่างเพื่อตอบรับ ลิงก์นี้จะหมดอายุใน 7 วัน`, link, 'ตอบรับคำเชิญ'),
      text: `${inviterName} เชิญคุณเข้าร่วม "${projectName}" บน Task Board\n\nคลิกลิงก์นี้เพื่อตอบรับ (หมดอายุใน 7 วัน):\n${link}`,
    })
  }

  /**
   * Deliver one message with bounded retry, returning whether it was accepted.
   * The whole call is awaited but time-bounded (a couple of short backoffs), so a
   * caller can honestly report the delivery outcome without an unbounded stall.
   * Unlike the old fire-and-forget version, errors are surfaced (as `false`) so
   * the auth flow can tell the user the email didn't go out.
   *
   * `kind`/`link` drive the dev-only link fallback: when SMTP isn't configured or
   * the send ultimately fails outside production, we log the actionable URL so
   * local flows work with zero SMTP. This never fires in production.
   */
  private async send(
    to: string,
    subject: string,
    kind: 'verification' | 'password-reset' | 'invitation',
    link: string,
    content: { html: string; text: string },
  ): Promise<boolean> {
    const ok = await this.deliver(to, subject, content)
    if (!this.isProd && (!this.mailConfigured || !ok)) {
      // Marked, greppable, dev-only. Lets a developer complete the flow by hand
      // when no SMTP server is reachable. Guarded by isProd — never leaks links
      // into production logs.
      this.logger.warn(`[MAIL-FALLBACK] ${kind} link for ${to}: ${link}`)
    }
    return ok
  }

  /** Common headers applied to every outbound message, regardless of transport. */
  private commonHeaders(): Record<string, string> {
    return { 'List-Unsubscribe': `<mailto:${this.from}?subject=unsubscribe>` }
  }

  private async deliver(to: string, subject: string, content: { html: string; text: string }): Promise<boolean> {
    if (this.gmail) {
      return this.deliverViaGmail(to, subject, content)
    }
    return this.deliverViaSmtp(to, subject, content)
  }

  /**
   * Gmail API path. The RFC822 MIME is built once (outside the retry loop, so a
   * transient send failure never rebuilds it) and re-POSTed on each attempt. A
   * MIME-build failure is permanent (bad input, not the network) → no retry.
   */
  private async deliverViaGmail(
    to: string,
    subject: string,
    content: { html: string; text: string },
  ): Promise<boolean> {
    let raw: Buffer
    try {
      raw = await this.gmail!.buildRawMessage({
        from: this.from,
        to,
        subject,
        html: content.html,
        text: content.text,
        headers: this.commonHeaders(),
      })
    } catch (err) {
      this.logger.error(
        `Failed to build MIME for "${subject}" to ${to}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      )
      return false
    }
    return this.runWithRetry(subject, to, async () => {
      await this.gmail!.sendRaw(raw)
      this.logger.log(`Sent "${subject}" to ${to} [gmail-api]`)
    })
  }

  /** SMTP path — unchanged behaviour from the original transporter-based send. */
  private deliverViaSmtp(
    to: string,
    subject: string,
    content: { html: string; text: string },
  ): Promise<boolean> {
    return this.runWithRetry(subject, to, async () => {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html: content.html,
        text: content.text,
        headers: this.commonHeaders(),
      })
      this.logger.log(`Sent "${subject}" to ${to} [${info.messageId}]`)
    })
  }

  /**
   * Shared bounded-retry loop for both transports. `sendOnce` performs one
   * delivery attempt (and logs its own success line); this loop owns transient-vs-
   * permanent classification, backoff, and the final error log. Returns whether
   * the message was ultimately accepted.
   */
  private async runWithRetry(
    subject: string,
    to: string,
    sendOnce: () => Promise<void>,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        await sendOnce()
        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const transient = isTransientMailError(err)
        const isLast = attempt === this.maxAttempts || !transient
        if (isLast) {
          this.logger.error(
            `Failed to send "${subject}" to ${to} after ${attempt} attempt(s)` +
              (transient ? '' : ' (permanent error — not retried)') +
              `: ${message}`,
            err instanceof Error ? err.stack : undefined,
          )
          return false
        }
        this.logger.warn(`Send attempt ${attempt}/${this.maxAttempts} for "${subject}" to ${to} failed (retrying): ${message}`)
        await this.backoff(attempt)
      }
    }
    return false
  }

  /** Exponential backoff: 200ms, 400ms, … kept short so callers aren't blocked long. */
  private backoff(attempt: number): Promise<void> {
    const ms = this.baseBackoffMs * 2 ** (attempt - 1)
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private layout(title: string, body: string, link: string, cta: string): string {
    return `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1d2333">
        <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
        <p style="font-size:14px;line-height:1.6;color:#4b5167;margin:0 0 20px">${body}</p>
        <a href="${link}" style="display:inline-block;background:#7c5cff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600">${cta}</a>
        <p style="font-size:12px;color:#8a90a6;margin:20px 0 0">หากปุ่มใช้ไม่ได้ ให้คัดลอกลิงก์นี้:<br><span style="word-break:break-all">${link}</span></p>
      </div>
    `
  }
}
