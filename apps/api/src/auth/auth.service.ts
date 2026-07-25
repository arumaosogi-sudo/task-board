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
import type { StringValue } from 'ms'
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

/**
 * A valid but throwaway bcrypt hash (cost 12) of a random string. On the login
 * miss path (unknown user / Google-only account with no password), we still run
 * a `bcrypt.compare` against this so the response takes the same ~bcrypt time as
 * a real password check. Without it, a missing account returns markedly faster
 * than a wrong password — a timing oracle that enumerates valid accounts.
 * The value is fixed so it never matches any real password.
 */
const DUMMY_BCRYPT_HASH = '$2b$12$pBmbtxxtMd3vlQpGcy9OA.yyEd6tVtfnlkTRqPRj3LdqlKrpeVclq'

/**
 * Honest delivery outcome for the *first* mail attempt tied to a request. The UI
 * uses it to tell the user whether the verification email actually went out
 * (`sent`) or the SMTP send failed (`failed`) — instead of always claiming
 * success. Not surfaced on anti-enumeration flows (forgot-password).
 */
export type EmailDelivery = 'sent' | 'failed'

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
      // jsonwebtoken's types now require the `ms`-style StringValue literal union
      // instead of a plain string; the value itself is still just an env-configured
      // duration string (e.g. "15m") — this is a type-only cast, no behavior change.
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES', '15m') as StringValue,
    })
  }

  /**
   * Issues an access JWT + a fresh opaque refresh token (stored hashed).
   * Pass `familyId` to keep a rotated token in its existing family; omit it on a
   * fresh login so Prisma mints a new family id (@default(cuid)).
   */
  private async issueTokens(user: TokenUser, familyId?: string): Promise<IssuedTokens> {
    const accessToken = await this.signAccessToken(user)
    const refreshToken = generateOpaqueToken()
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
        ...(familyId ? { familyId } : {}),
      },
    })
    return { accessToken, refreshToken }
  }

  /* ------------------------------- register ------------------------------- */

  async register(
    username: string,
    email: string,
    password: string,
  ): Promise<{ message: string; emailDelivery: EmailDelivery }> {
    const normalizedEmail = email.toLowerCase()
    const byEmail = await this.users.findByEmail(normalizedEmail)

    // Reclaim an unverified account instead of hard-blocking. If someone signed up
    // but never verified (lost the email, gave up), a second signup with the same
    // address is treated as "resend + reset password" rather than "email taken".
    // Only a *verified* address is a real conflict. (Same pattern GitHub/Discord use.)
    if (byEmail) {
      if (byEmail.emailVerified) {
        throw new ConflictException({ code: 'email-taken', message: 'อีเมลนี้ถูกใช้แล้ว' })
      }
      return this.reclaimUnverified(byEmail, username, password)
    }

    const byUsername = await this.users.findByUsername(username)
    if (byUsername) throw new ConflictException({ code: 'username-taken', message: 'Username นี้ถูกใช้แล้ว' })

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

    let user: User
    try {
      user = await this.users.create({ username, email: normalizedEmail, passwordHash })
    } catch (err) {
      // Safety net for the race between the pre-check above and the insert: two
      // concurrent signups with the same email/username both pass the check, then
      // one hits the DB unique constraint (Prisma P2002). Map it to a clean 409
      // instead of leaking a 500.
      if (isUniqueConstraintError(err)) {
        const target = err.meta?.target
        const isEmail = Array.isArray(target)
          ? target.includes('email')
          : String(target ?? '').includes('email')
        throw new ConflictException(
          isEmail
            ? { code: 'email-taken', message: 'อีเมลนี้ถูกใช้แล้ว' }
            : { code: 'username-taken', message: 'Username นี้ถูกใช้แล้ว' },
        )
      }
      throw err
    }

    const emailDelivery = await this.sendVerification(user)
    return { message: 'verify-email-sent', emailDelivery }
  }

  /**
   * Re-registration against an existing but UNVERIFIED account. Validates the
   * new username for availability, then stores the new credentials as PENDING
   * inside the EmailVerification row. They are applied atomically only when the
   * user clicks the link — so an attacker can never overwrite a victim's password
   * before proving ownership of the email address.
   */
  private async reclaimUnverified(
    existing: User,
    username: string,
    password: string,
  ): Promise<{ message: string; emailDelivery: EmailDelivery }> {
    // Validate username now (before we write anything), but don't apply yet.
    let pendingUsername: string | undefined
    if (username && username !== existing.username) {
      const taken = await this.users.findByUsername(username)
      if (taken && taken.id !== existing.id) {
        throw new ConflictException({ code: 'username-taken', message: 'Username นี้ถูกใช้แล้ว' })
      }
      pendingUsername = username
    }

    const pendingPasswordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

    await this.prisma.emailVerification.deleteMany({ where: { userId: existing.id } })
    // Email is unchanged, so `existing` still carries the right address/id for the mail.
    const emailDelivery = await this.sendVerification(existing, {
      passwordHash: pendingPasswordHash,
      username: pendingUsername,
    })
    return { message: 'verification-resent', emailDelivery }
  }

  /**
   * Persists the verification token then sends the email, returning the honest
   * delivery outcome. The token row must be written before we respond (the link
   * depends on it). The mail send is now awaited (bounded retry in MailService)
   * so we can report `sent`/`failed` to the caller — a failed send no longer
   * masquerades as success. A `failed` result never blocks registration: the row
   * exists, the user still reaches the "check your email" screen and can retry
   * via resend. Delivery failures are also logged server-side.
   */
  private async sendVerification(
    user: User,
    pending?: { passwordHash?: string; username?: string },
  ): Promise<EmailDelivery> {
    const raw = generateOpaqueToken()
    await this.prisma.emailVerification.create({
      data: {
        userId: user.id,
        token: hashToken(raw),
        expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
        ...(pending?.passwordHash && { pendingPasswordHash: pending.passwordHash }),
        ...(pending?.username && { pendingUsername: pending.username }),
      },
    })
    const ok = await this.mail.sendVerificationEmail(user.email, raw).catch((err) => {
      // MailService already swallows/retries internally, but guard against an
      // unexpected throw so a mail bug can never break registration.
      this.logger.error(
        `Verification email threw for ${user.email}: ${err instanceof Error ? err.message : String(err)}`,
      )
      return false
    })
    if (!ok) this.logger.warn(`Verification email delivery failed for ${user.email}`)
    return ok ? 'sent' : 'failed'
  }

  /* -------------------------------- login --------------------------------- */

  async login(identity: string, password: string): Promise<{ user: PublicUser } & IssuedTokens> {
    const user = await this.users.findByIdentity(identity)
    // Constant-ish failure path: same generic error whether user missing or pw wrong.
    if (!user || !user.passwordHash) {
      // Burn the same ~bcrypt time as a real comparison so an attacker can't
      // distinguish "no such account" from "wrong password" by response timing.
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH)
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

  /** Used by JwtRefreshGuard. Throws on missing/expired token, or on reuse of a
   * consumed (rotated) token — in which case the whole token family is revoked. */
  async validateRefreshToken(raw: string): Promise<{ user: User; tokenId: string; familyId: string }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { token: hashToken(raw) },
      include: { user: true },
    })
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'invalid-refresh-token', message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' })
    }
    // Theft detection: a token that was already rotated is being replayed. The
    // legitimate client always holds the newest token, so this means the token
    // leaked. Revoke every token in the family (kills both attacker and victim
    // sessions — forces a fresh login) and alarm.
    if (record.rotatedAt) {
      await this.prisma.refreshToken.deleteMany({ where: { familyId: record.familyId } })
      this.logger.warn(
        `Refresh-token reuse detected for user ${record.userId} (family ${record.familyId}) — family revoked`,
      )
      throw new UnauthorizedException({
        code: 'refresh-token-reuse',
        message: 'ตรวจพบการใช้ session ซ้ำ ระบบได้ยกเลิกทุก session เพื่อความปลอดภัย กรุณาเข้าสู่ระบบใหม่',
      })
    }
    return { user: record.user, tokenId: record.id, familyId: record.familyId }
  }

  /**
   * Rotates the refresh token. Instead of deleting the used token we stamp it
   * `rotatedAt` and mint a replacement in the SAME family — keeping the consumed
   * row is what lets `validateRefreshToken` detect a later replay of it (theft).
   * The stamped row is inert for auth and is cleaned up when it expires or when
   * the family is revoked (logout / password change / reuse alarm).
   */
  async rotateRefresh(user: TokenUser, oldTokenId: string): Promise<IssuedTokens> {
    const old = await this.prisma.refreshToken
      .update({ where: { id: oldTokenId }, data: { rotatedAt: new Date() } })
      .catch(() => null)
    return this.issueTokens(user, old?.familyId)
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
    // Apply any pending credentials from a reclaim attempt atomically with emailVerified.
    const userPatch: { emailVerified: boolean; passwordHash?: string; username?: string } = { emailVerified: true }
    if (record.pendingPasswordHash) userPatch.passwordHash = record.pendingPasswordHash
    if (record.pendingUsername) userPatch.username = record.pendingUsername
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: userPatch }),
      this.prisma.emailVerification.deleteMany({ where: { userId: record.userId } }),
    ])
    return { message: 'email-verified' }
  }

  async resendVerify(email: string): Promise<{ message: string; emailDelivery: EmailDelivery }> {
    const user = await this.users.findByEmail(email)
    // Fully generic response (anti-enumeration): ALWAYS report `sent`, regardless of
    // whether the account exists, is already verified, or the SMTP send actually
    // failed. The no-op paths (unknown / verified) already returned `sent`, so
    // surfacing a real `failed` only on the exists+unverified path turned an SMTP
    // outage into an enumeration oracle — an attacker could tell a registered-but-
    // unverified address apart from an unknown one. We still attempt the send and
    // log the true outcome server-side (incl. the dev [MAIL-FALLBACK] link); the
    // caller just never sees it. Mirrors forgotPassword. (register/reclaim keep
    // their honest flag: the caller there is the just-registered owner and the
    // response is not an enumeration surface.)
    if (!user) {
      this.logger.debug(`resendVerify: no account for ${email} — no-op`)
    } else if (user.emailVerified) {
      this.logger.debug(`resendVerify: ${email} already verified — no-op`)
    } else {
      await this.prisma.emailVerification.deleteMany({ where: { userId: user.id } })
      const outcome = await this.sendVerification(user)
      this.logger.log(`resendVerify: verification email ${outcome} for ${email} (reported as sent)`)
    }
    return { message: 'verify-email-sent', emailDelivery: 'sent' }
  }

  /* ----------------------------- password reset --------------------------- */

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.users.findByEmail(email)
    if (user) {
      const raw = generateOpaqueToken()
      await this.prisma.passwordReset.create({
        data: { userId: user.id, token: hashToken(raw), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
      })
      // Delivery outcome is logged for operators but deliberately NOT surfaced in
      // the response: revealing "failed" here would leak that the account exists.
      // Fire-and-forget so the request doesn't stall on the Gmail API round-trip —
      // the reset row exists and the link works regardless. Uniform (email-free)
      // response timing also removes a latency-based account-existence oracle.
      void this.mail
        .sendPasswordResetEmail(user.email, raw)
        .then((ok) => { if (!ok) this.logger.warn(`Password reset email delivery failed for ${user.email}`) })
        .catch(() => this.logger.warn(`Password reset email delivery failed for ${user.email}`))
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

/** Narrows an unknown error to a Prisma unique-constraint violation (P2002). */
function isUniqueConstraintError(
  err: unknown,
): err is { code: 'P2002'; meta?: { target?: string[] | string } } {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  )
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
