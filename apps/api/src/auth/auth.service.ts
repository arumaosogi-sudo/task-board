import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { User, UserSetting } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { MailService } from '../mail/mail.service'
import { JwtPayload } from './strategies/jwt.strategy'
import { GoogleProfile } from './strategies/google.strategy'
import { generateOpaqueToken, hashToken } from './token.util'

export const REFRESH_COOKIE = 'tb_refresh'
const BCRYPT_ROUNDS = 12
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000 // 1h

export interface PublicUser {
  id: string
  username: string
  email: string
  emailVerified: boolean
  createdAt: Date
}

export interface IssuedTokens {
  accessToken: string
  refreshToken: string // raw value — caller sets it as an httpOnly cookie
}

/** Minimal user shape needed to mint tokens (JWT payload + FK). */
type TokenUser = Pick<User, 'id' | 'username' | 'email'>

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /* ------------------------------- helpers -------------------------------- */

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    }
  }

  /** ms until refresh-token expiry — used for both DB row and cookie maxAge. */
  get refreshTtlMs(): number {
    return parseDuration(this.config.get<string>('JWT_REFRESH_EXPIRES', '30d'))
  }

  private async signAccessToken(user: TokenUser): Promise<string> {
    const payload: JwtPayload = { sub: user.id, username: user.username, email: user.email }
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES', '15m'),
    })
  }

  /** Issues an access JWT + a fresh opaque refresh token (stored hashed). */
  private async issueTokens(user: TokenUser): Promise<IssuedTokens> {
    const accessToken = await this.signAccessToken(user)
    const refreshToken = generateOpaqueToken()
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    })
    return { accessToken, refreshToken }
  }

  /* ------------------------------- register ------------------------------- */

  async register(username: string, email: string, password: string): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase()
    const [byEmail, byUsername] = await Promise.all([
      this.users.findByEmail(normalizedEmail),
      this.users.findByUsername(username),
    ])
    if (byEmail) throw new ConflictException({ code: 'email-taken', message: 'อีเมลนี้ถูกใช้แล้ว' })
    if (byUsername) throw new ConflictException({ code: 'username-taken', message: 'Username นี้ถูกใช้แล้ว' })

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const user = await this.users.create({ username, email: normalizedEmail, passwordHash })

    await this.sendVerification(user)
    return { message: 'verify-email-sent' }
  }

  private async sendVerification(user: User): Promise<void> {
    const raw = generateOpaqueToken()
    await this.prisma.emailVerification.create({
      data: { userId: user.id, token: hashToken(raw), expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS) },
    })
    await this.mail.sendVerificationEmail(user.email, raw)
  }

  /* -------------------------------- login --------------------------------- */

  async login(identity: string, password: string): Promise<{ user: PublicUser } & IssuedTokens> {
    const user = await this.users.findByIdentity(identity)
    // Constant-ish failure path: same generic error whether user missing or pw wrong.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({ code: 'invalid-credentials', message: 'Username/Email หรือรหัสผ่านไม่ถูกต้อง' })
    }
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      throw new UnauthorizedException({ code: 'invalid-credentials', message: 'Username/Email หรือรหัสผ่านไม่ถูกต้อง' })
    }
    if (!user.emailVerified) {
      throw new ForbiddenException({ code: 'email-not-verified', message: 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ' })
    }
    const tokens = await this.issueTokens(user)
    return { user: this.toPublicUser(user), ...tokens }
  }

  /* -------------------------------- refresh ------------------------------- */

  /** Used by JwtRefreshGuard. Throws on missing/expired token. */
  async validateRefreshToken(raw: string): Promise<{ user: User; tokenId: string }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { token: hashToken(raw) },
      include: { user: true },
    })
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'invalid-refresh-token', message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' })
    }
    return { user: record.user, tokenId: record.id }
  }

  /** Rotates the refresh token: deletes the used one, issues a new pair. */
  async rotateRefresh(user: TokenUser, oldTokenId: string): Promise<IssuedTokens> {
    await this.prisma.refreshToken.delete({ where: { id: oldTokenId } }).catch(() => undefined)
    return this.issueTokens(user)
  }

  async logout(tokenId: string): Promise<void> {
    await this.prisma.refreshToken.delete({ where: { id: tokenId } }).catch(() => undefined)
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } })
  }

  /* --------------------------- email verification ------------------------- */

  async verifyEmail(rawToken: string): Promise<{ message: string }> {
    const record = await this.prisma.emailVerification.findUnique({ where: { token: hashToken(rawToken) } })
    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'invalid-token', message: 'ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ' })
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
      this.prisma.emailVerification.deleteMany({ where: { userId: record.userId } }),
    ])
    return { message: 'email-verified' }
  }

  async resendVerify(email: string): Promise<{ message: string }> {
    const user = await this.users.findByEmail(email)
    // Don't reveal whether the email exists; also no-op if already verified.
    if (user && !user.emailVerified) {
      await this.prisma.emailVerification.deleteMany({ where: { userId: user.id } })
      await this.sendVerification(user)
    }
    return { message: 'verify-email-sent' }
  }

  /* ----------------------------- password reset --------------------------- */

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.users.findByEmail(email)
    if (user) {
      const raw = generateOpaqueToken()
      await this.prisma.passwordReset.create({
        data: { userId: user.id, token: hashToken(raw), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
      })
      await this.mail.sendPasswordResetEmail(user.email, raw)
    }
    // Always the same response to avoid account enumeration.
    return { message: 'reset-email-sent' }
  }

  async resetPassword(rawToken: string, password: string): Promise<{ message: string }> {
    const record = await this.prisma.passwordReset.findUnique({ where: { token: hashToken(rawToken) } })
    if (!record || record.used || record.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'invalid-token', message: 'ลิงก์รีเซ็ตไม่ถูกต้องหรือหมดอายุ' })
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordReset.update({ where: { id: record.id }, data: { used: true } }),
      // Revoke all sessions after a password reset.
      this.prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
    ])
    return { message: 'password-reset' }
  }

  /* -------------------------------- google -------------------------------- */

  /** Finds-or-links-or-creates a user from a verified Google profile, then issues tokens. */
  async loginWithGoogle(profile: GoogleProfile): Promise<{ user: PublicUser } & IssuedTokens> {
    let user = await this.users.findByGoogleId(profile.googleId)

    if (!user) {
      const existing = await this.users.findByEmail(profile.email)
      if (existing) {
        // Link Google to the existing local account.
        user = await this.users.update(existing.id, {
          googleId: profile.googleId,
          emailVerified: true,
        })
      } else {
        const username = await this.generateUniqueUsername(profile.email)
        const created = await this.users.create({
          username,
          email: profile.email,
          googleId: profile.googleId,
          emailVerified: true,
        })
        user = created
      }
    }

    const tokens = await this.issueTokens(user)
    return { user: this.toPublicUser(user), ...tokens }
  }

  private async generateUniqueUsername(email: string): Promise<string> {
    const base = (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24) || 'user'
    let candidate = base
    for (let i = 0; i < 5; i++) {
      if (!(await this.users.findByUsername(candidate))) return candidate
      candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`
    }
    return `${base}${Date.now().toString().slice(-6)}`
  }

  /* -------------------------------- misc ---------------------------------- */

  async checkUsername(username: string): Promise<{ available: boolean }> {
    const existing = await this.users.findByUsername(username)
    return { available: !existing }
  }

  async getMe(userId: string): Promise<PublicUser & { setting: UserSetting | null }> {
    const user = await this.users.findByIdWithSetting(userId)
    if (!user) throw new UnauthorizedException()
    return { ...this.toPublicUser(user), setting: user.setting }
  }

  async updateSetting(
    userId: string,
    data: Partial<
      Pick<
        UserSetting,
        | 'themeColor'
        | 'themeMode'
        | 'language'
        | 'fontSize'
        | 'notifyInvite'
        | 'notifyMention'
        | 'notifyRevision'
      >
    >,
  ): Promise<UserSetting> {
    return this.users.updateSetting(userId, data)
  }

  /* --------------------------- account management ------------------------- */

  /** Change username and/or email. Changing email resets verification + re-sends. */
  async updateProfile(
    userId: string,
    data: { username?: string; email?: string },
  ): Promise<PublicUser & { setting: UserSetting | null }> {
    const user = await this.users.findById(userId)
    if (!user) throw new UnauthorizedException()

    const patch: { username?: string; email?: string; emailVerified?: boolean } = {}

    if (data.username && data.username !== user.username) {
      const taken = await this.users.findByUsername(data.username)
      if (taken) throw new ConflictException({ code: 'username-taken', message: 'Username นี้ถูกใช้แล้ว' })
      patch.username = data.username
    }

    let emailChanged = false
    if (data.email) {
      const normalized = data.email.toLowerCase()
      if (normalized !== user.email) {
        const taken = await this.users.findByEmail(normalized)
        if (taken) throw new ConflictException({ code: 'email-taken', message: 'อีเมลนี้ถูกใช้แล้ว' })
        patch.email = normalized
        patch.emailVerified = false
        emailChanged = true
      }
    }

    if (Object.keys(patch).length > 0) {
      await this.users.update(userId, patch)
    }
    if (emailChanged) {
      // Re-verify the new address; old verification links are invalidated first.
      await this.prisma.emailVerification.deleteMany({ where: { userId } })
      const updated = await this.users.findById(userId)
      if (updated) await this.sendVerification(updated)
    }
    return this.getMe(userId)
  }

  /**
   * Change password after verifying the current one. All existing sessions are
   * revoked for safety; the caller (controller) receives a fresh token pair so
   * the current device stays signed in.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<IssuedTokens> {
    const user = await this.users.findById(userId)
    if (!user) throw new UnauthorizedException()
    if (!user.passwordHash) {
      throw new BadRequestException({
        code: 'no-password-set',
        message: 'บัญชีนี้เข้าสู่ระบบผ่าน Google — ใช้ "ลืมรหัสผ่าน" เพื่อตั้งรหัสผ่านครั้งแรก',
      })
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!ok) {
      throw new BadRequestException({ code: 'wrong-password', message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' })
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ])
    // Re-issue a session for the current device.
    return this.issueTokens(user)
  }

  /**
   * Permanently delete the account. Blocked while the user still owns any
   * project (they must transfer or delete those first — same rule as leaving).
   * Sent invitations and authored revisions are removed to satisfy FK
   * constraints; memberships, pins, tokens and notifications cascade.
   */
  async deleteAccount(userId: string, password?: string): Promise<{ message: string }> {
    const user = await this.users.findById(userId)
    if (!user) throw new UnauthorizedException()

    if (user.passwordHash) {
      if (!password) {
        throw new BadRequestException({ code: 'password-required', message: 'กรุณายืนยันด้วยรหัสผ่าน' })
      }
      const ok = await bcrypt.compare(password, user.passwordHash)
      if (!ok) throw new BadRequestException({ code: 'wrong-password', message: 'รหัสผ่านไม่ถูกต้อง' })
    }

    const ownedCount = await this.prisma.project.count({ where: { ownerId: userId } })
    if (ownedCount > 0) {
      throw new ForbiddenException({
        code: 'owns-projects',
        message: 'โอนหรือลบ Project ที่คุณเป็นเจ้าของก่อนจึงจะลบบัญชีได้',
      })
    }

    await this.prisma.$transaction([
      this.prisma.invitation.deleteMany({ where: { invitedById: userId } }),
      this.prisma.revision.deleteMany({ where: { authorId: userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ])
    return { message: 'account-deleted' }
  }
}

/** Parses durations like "15m", "30d", "12h", "45s" into milliseconds. */
function parseDuration(input: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(input.trim())
  if (!match) return 30 * 24 * 60 * 60 * 1000 // sane default: 30d
  const value = Number(match[1])
  const unit = match[2]
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 86_400_000
  return value * factor
}
