import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private readonly transporter: nodemailer.Transporter
  private readonly from: string
  private readonly webUrl: string

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>('EMAIL_FROM', 'noreply@taskboard.local')
    this.webUrl = this.config.get<string>('WEB_URL', 'http://localhost:5173')

    const user = this.config.get<string>('SMTP_USER')
    const pass = this.config.get<string>('SMTP_PASS')

    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: Number(this.config.get<string>('SMTP_PORT', '1025')),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: user ? { user, pass } : undefined,
    })
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html })
      this.logger.log(`Sent "${subject}" to ${to}`)
    } catch (err) {
      // Never let a mail failure break the request flow — surface it in logs.
      this.logger.error(
        `Failed to send "${subject}" to ${to}. Is the SMTP server (Mailpit) running?`,
        err instanceof Error ? err.stack : String(err),
      )
    }
  }

  sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${this.webUrl}/verify-email?token=${encodeURIComponent(token)}`
    return this.send(
      to,
      'ยืนยันอีเมลของคุณ — Task Board',
      this.layout(
        'ยืนยันอีเมลของคุณ',
        'คลิกปุ่มด้านล่างเพื่อยืนยันอีเมลและเริ่มใช้งาน Task Board ลิงก์นี้จะหมดอายุใน 24 ชั่วโมง',
        link,
        'ยืนยันอีเมล',
      ),
    )
  }

  sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `${this.webUrl}/reset-password?token=${encodeURIComponent(token)}`
    return this.send(
      to,
      'รีเซ็ตรหัสผ่าน — Task Board',
      this.layout(
        'รีเซ็ตรหัสผ่าน',
        'เราได้รับคำขอรีเซ็ตรหัสผ่านของคุณ คลิกปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ ลิงก์นี้จะหมดอายุใน 1 ชั่วโมง หากคุณไม่ได้ร้องขอ สามารถเพิกเฉยอีเมลนี้ได้',
        link,
        'ตั้งรหัสผ่านใหม่',
      ),
    )
  }

  sendInvitationEmail(to: string, token: string, projectName: string, inviterName: string): Promise<void> {
    const link = `${this.webUrl}/accept-invite?token=${encodeURIComponent(token)}`
    return this.send(
      to,
      `คุณได้รับเชิญเข้าร่วม "${projectName}" — Task Board`,
      this.layout(
        `เชิญเข้าร่วม ${projectName}`,
        `${inviterName} เชิญคุณเข้าร่วม Project "${projectName}" บน Task Board คลิกปุ่มด้านล่างเพื่อตอบรับ ลิงก์นี้จะหมดอายุใน 7 วัน`,
        link,
        'ตอบรับคำเชิญ',
      ),
    )
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
