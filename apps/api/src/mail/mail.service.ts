import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'

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

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private readonly transporter: nodemailer.Transporter
  private readonly from: string
  private readonly webUrl: string

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>('EMAIL_FROM', 'noreply@taskboard.local')
    this.webUrl = this.config.get<string>('WEB_URL', 'http://localhost:5173')

    const host = this.config.get<string>('SMTP_HOST', 'localhost')
    const port = Number(this.config.get<string>('SMTP_PORT', '1025'))
    const user = this.config.get<string>('SMTP_USER')
    // Strip whitespace — Gmail App Passwords are sometimes pasted with spaces
    const pass = (this.config.get<string>('SMTP_PASS') ?? '').replace(/\s/g, '')

    this.logger.log(`SMTP → ${host}:${port} as ${user ?? '(no-auth)'}`)

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: user ? { user, pass } : undefined,
    })
  }

  sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${this.webUrl}/verify-email?token=${encodeURIComponent(token)}`
    const subject = 'ยืนยันอีเมลของคุณ — Task Board'
    return this.send(to, subject, {
      html: this.layout('ยืนยันอีเมลของคุณ', 'คลิกปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งาน Task Board ลิงก์นี้จะหมดอายุใน 24 ชั่วโมง', link, 'ยืนยันอีเมล'),
      text: `ยืนยันอีเมลของคุณ — Task Board\n\nคลิกลิงก์นี้เพื่อยืนยันอีเมลและเริ่มใช้งาน Task Board (หมดอายุใน 24 ชั่วโมง):\n${link}`,
    })
  }

  sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `${this.webUrl}/reset-password?token=${encodeURIComponent(token)}`
    const subject = 'รีเซ็ตรหัสผ่าน — Task Board'
    return this.send(to, subject, {
      html: this.layout('รีเซ็ตรหัสผ่าน', 'เราได้รับคำขอรีเซ็ตรหัสผ่านของคุณ คลิกปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ ลิงก์นี้จะหมดอายุใน 1 ชั่วโมง หากคุณไม่ได้ร้องขอ สามารถเพิกเฉยอีเมลนี้ได้', link, 'ตั้งรหัสผ่านใหม่'),
      text: `รีเซ็ตรหัสผ่าน — Task Board\n\nคลิกลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (หมดอายุใน 1 ชั่วโมง):\n${link}\n\nหากคุณไม่ได้ร้องขอ สามารถเพิกเฉยอีเมลนี้ได้`,
    })
  }

  sendInvitationEmail(to: string, token: string, projectName: string, inviterName: string): Promise<void> {
    const link = `${this.webUrl}/accept-invite?token=${encodeURIComponent(token)}`
    // Escape user-controlled values before they enter the HTML template. The
    // plain-text `subject`/`text` fields are not HTML, so they use the raw values.
    const safeProject = escapeHtml(projectName)
    const safeInviter = escapeHtml(inviterName)
    const subject = `คุณได้รับเชิญเข้าร่วม "${projectName}" — Task Board`
    return this.send(to, subject, {
      html: this.layout(`เชิญเข้าร่วม ${safeProject}`, `${safeInviter} เชิญคุณเข้าร่วม Project "${safeProject}" บน Task Board คลิกปุ่มด้านล่างเพื่อตอบรับ ลิงก์นี้จะหมดอายุใน 7 วัน`, link, 'ตอบรับคำเชิญ'),
      text: `${inviterName} เชิญคุณเข้าร่วม "${projectName}" บน Task Board\n\nคลิกลิงก์นี้เพื่อตอบรับ (หมดอายุใน 7 วัน):\n${link}`,
    })
  }

  private async send(to: string, subject: string, content: { html: string; text: string }): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html: content.html,
        text: content.text,
        headers: { 'List-Unsubscribe': `<mailto:${this.from}?subject=unsubscribe>` },
      })
      this.logger.log(`Sent "${subject}" to ${to} [${info.messageId}]`)
    } catch (err) {
      this.logger.error(
        `Failed to send "${subject}" to ${to}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      )
    }
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
