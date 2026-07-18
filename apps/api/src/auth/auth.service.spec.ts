import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { User } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { AuthService } from './auth.service'

// Wrap the real bcrypt.compare in a jest.fn so we can assert it *runs* on the
// login miss path (the timing-oracle guard) while keeping true hashing behaviour
// for every other assertion in this file. hash/hashSync stay the genuine article.
jest.mock('bcrypt', () => {
  const actual = jest.requireActual('bcrypt')
  return { ...actual, compare: jest.fn(actual.compare) }
})
import { hashToken } from './token.util'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { MailService } from '../mail/mail.service'

// P1 Auth Flow — the security-critical core: password hashing, credential
// verification, refresh-token rotation, and single-use email/reset tokens.
//
// Strategy (per test-plan §P1 + ADR 0001): PrismaService and MailService are
// mocked so no DB/SMTP is touched, but **bcrypt and JwtService run for real** —
// hashing and token minting are exactly what we want to assert, not stub away.
// UsersService is wired real on top of the mocked Prisma so the query shapes it
// composes (findUnique/findFirst/create) are exercised, not bypassed.
//
// Skipped here (need a live stack — see notes at bottom): throttle/429, httpOnly
// cookie flags, and the Google OAuth 503-when-unconfigured guard, all of which
// live in the controller/guard HTTP layer, not AuthService.

/** SHA-256 hex is 64 chars — used to assert we persist the *hash*, never the raw token. */
const SHA256_HEX = /^[a-f0-9]{64}$/
const SECRET = 'unit-test-jwt-secret-at-least-32-characters-long'

type Fn = jest.Mock
interface PrismaMock {
  user: { findUnique: Fn; findFirst: Fn; create: Fn; update: Fn; delete: Fn }
  refreshToken: { create: Fn; findUnique: Fn; update: Fn; delete: Fn; deleteMany: Fn }
  emailVerification: { create: Fn; findUnique: Fn; deleteMany: Fn }
  passwordReset: { create: Fn; findUnique: Fn; update: Fn }
  project: { count: Fn }
  $transaction: Fn
}

describe('AuthService (P1 auth flow)', () => {
  let prisma: PrismaMock
  let mail: { sendVerificationEmail: Fn; sendPasswordResetEmail: Fn }
  let jwt: JwtService
  let service: AuthService

  // bcrypt at 12 rounds is intentionally slow; hash the shared fixtures once so
  // per-test cost stays to a single hash/compare rather than re-hashing seeds.
  let PW_HASH: string
  beforeAll(() => {
    PW_HASH = bcrypt.hashSync('secret123', 12)
  })

  const makeUser = (over: Partial<User> = {}): User =>
    ({
      id: 'u1',
      username: 'alice',
      email: 'alice@x.io',
      passwordHash: PW_HASH,
      googleId: null,
      emailVerified: true,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      ...over,
    }) as unknown as User

  /** Route the (shared) findUnique/findFirst through an in-memory user list. */
  const seedUsers = (list: User[]) => {
    prisma.user.findUnique.mockImplementation(
      async ({ where }: { where: Partial<Record<'id' | 'email' | 'username' | 'googleId', string>> }) => {
        if (where.id) return list.find((u) => u.id === where.id) ?? null
        if (where.email) return list.find((u) => u.email === where.email) ?? null
        if (where.username) return list.find((u) => u.username === where.username) ?? null
        if (where.googleId) return list.find((u) => u.googleId === where.googleId) ?? null
        return null
      },
    )
    prisma.user.findFirst.mockImplementation(
      async ({ where }: { where: { OR?: Array<{ email?: string; username?: string }> } }) => {
        const or = where.OR ?? []
        return (
          list.find((u) => or.some((c) => (c.email && u.email === c.email) || (c.username && u.username === c.username))) ??
          null
        )
      },
    )
  }

  const lastCall = (fn: Fn) => fn.mock.calls[fn.mock.calls.length - 1][0]

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      emailVerification: { create: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
      passwordReset: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      project: { count: jest.fn() },
      // The service only uses the array form: run every op so calls are recorded.
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    }
    // users.create echoes the row it would have inserted (email already lowercased upstream).
    prisma.user.create.mockImplementation(
      async ({ data }: { data: Partial<User> }) => makeUser({ id: 'u_new', ...data }),
    )
    prisma.user.update.mockImplementation(
      async ({ where, data }: { where: { id: string }; data: Partial<User> }) =>
        makeUser({ id: where.id, ...data }),
    )
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' })
    prisma.refreshToken.delete.mockResolvedValue({ id: 'rt1' })
    prisma.refreshToken.update.mockResolvedValue({ id: 'rt1', familyId: 'fam1' })

    // MailService now returns a delivery boolean (true = accepted by SMTP). Default
    // the mocks to a successful send; individual tests override to false to prove
    // the failure is surfaced honestly.
    mail = {
      sendVerificationEmail: jest.fn().mockResolvedValue(true),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    }
    const config = {
      get: jest.fn((key: string, def?: string) => {
        const map: Record<string, string> = {
          JWT_SECRET: SECRET,
          JWT_ACCESS_EXPIRES: '15m',
          JWT_REFRESH_EXPIRES: '30d',
        }
        return map[key] ?? def
      }),
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        UsersService,
        { provide: PrismaService, useValue: prisma as unknown as PrismaService },
        { provide: MailService, useValue: mail },
        { provide: JwtService, useValue: new JwtService({}) },
        { provide: ConfigService, useValue: config },
      ],
    }).compile()

    service = moduleRef.get(AuthService)
    jwt = moduleRef.get(JwtService)
  })

  /* =============================== register =============================== */

  describe('register', () => {
    it('stores a bcrypt hash (never the plaintext), creates the user, and sends verification', async () => {
      seedUsers([]) // email + username both free

      const res = await service.register('bob', 'Bob@X.IO', 'secret123')

      expect(res).toEqual({ message: 'verify-email-sent', emailDelivery: 'sent' })

      // Password persisted as a real bcrypt hash, not the plaintext.
      const created = lastCall(prisma.user.create) as { data: { passwordHash: string; email: string } }
      expect(created.data.passwordHash).not.toBe('secret123')
      expect(created.data.passwordHash.startsWith('$2')).toBe(true)
      expect(await bcrypt.compare('secret123', created.data.passwordHash)).toBe(true)
      // Email normalised to lowercase before insert.
      expect(created.data.email).toBe('bob@x.io')

      // Verify-token row stores the *hash*; the raw token only goes out by email.
      const ev = lastCall(prisma.emailVerification.create) as { data: { token: string; pendingPasswordHash?: string } }
      expect(ev.data.token).toMatch(SHA256_HEX)
      expect(ev.data.pendingPasswordHash).toBeUndefined()

      expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1)
      const [, rawSent] = mail.sendVerificationEmail.mock.calls[0]
      expect(hashToken(rawSent)).toBe(ev.data.token) // emailed raw hashes to the stored value
    })

    it('rejects a second signup on an already-verified email (email-taken)', async () => {
      seedUsers([makeUser({ email: 'bob@x.io', emailVerified: true })])

      await expect(service.register('bob', 'bob@x.io', 'secret123')).rejects.toMatchObject({
        response: { code: 'email-taken' },
      })
      expect(prisma.user.create).not.toHaveBeenCalled()
      expect(mail.sendVerificationEmail).not.toHaveBeenCalled()
    })

    it('rejects a taken username (username-taken) when the email is free', async () => {
      // Email lookup misses, username lookup hits.
      seedUsers([makeUser({ id: 'u9', username: 'bob', email: 'other@x.io' })])

      await expect(service.register('bob', 'new@x.io', 'secret123')).rejects.toMatchObject({
        response: { code: 'username-taken' },
      })
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('reclaims an UNVERIFIED account: stores pending password hash + resends, without touching the live user', async () => {
      seedUsers([makeUser({ id: 'u5', username: 'bob', email: 'bob@x.io', emailVerified: false })])

      const res = await service.register('bob', 'bob@x.io', 'newpass123')

      expect(res).toEqual({ message: 'verification-resent', emailDelivery: 'sent' })
      // Old verification rows cleared, and the new password is held PENDING (hashed),
      // not applied to the user until they click the link.
      expect(prisma.emailVerification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u5' } })
      expect(prisma.user.update).not.toHaveBeenCalled()
      const ev = lastCall(prisma.emailVerification.create) as { data: { pendingPasswordHash: string } }
      expect(ev.data.pendingPasswordHash).toBeDefined()
      expect(await bcrypt.compare('newpass123', ev.data.pendingPasswordHash)).toBe(true)
      expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1)
    })

    it('maps a Prisma P2002 unique-constraint race to a clean 409 instead of a 500', async () => {
      seedUsers([]) // pre-checks pass...
      prisma.user.create.mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } }) // ...then the insert races

      await expect(service.register('bob', 'bob@x.io', 'secret123')).rejects.toMatchObject({
        response: { code: 'email-taken' },
      })
    })

    it('reports emailDelivery:"failed" (still creating the account) when the SMTP send fails', async () => {
      seedUsers([])
      mail.sendVerificationEmail.mockResolvedValue(false) // SMTP down / rejected

      const res = await service.register('bob', 'bob@x.io', 'secret123')

      // Account + token row still persisted — a failed email must NOT roll back signup.
      expect(prisma.user.create).toHaveBeenCalledTimes(1)
      expect(prisma.emailVerification.create).toHaveBeenCalledTimes(1)
      // ...but the outcome is reported honestly so the UI can warn the user.
      expect(res).toEqual({ message: 'verify-email-sent', emailDelivery: 'failed' })
    })

    it('still succeeds (emailDelivery:"failed") if the mail send throws unexpectedly', async () => {
      seedUsers([])
      mail.sendVerificationEmail.mockRejectedValue(new Error('boom'))

      const res = await service.register('bob', 'bob@x.io', 'secret123')

      expect(prisma.user.create).toHaveBeenCalledTimes(1)
      expect(res).toEqual({ message: 'verify-email-sent', emailDelivery: 'failed' })
    })
  })

  /* ============================= resendVerify ============================= */

  describe('resendVerify', () => {
    it('resends for an unverified account and reports the delivery outcome', async () => {
      seedUsers([makeUser({ id: 'u5', email: 'bob@x.io', emailVerified: false })])

      const res = await service.resendVerify('bob@x.io')

      expect(prisma.emailVerification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u5' } })
      expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1)
      expect(res).toEqual({ message: 'verify-email-sent', emailDelivery: 'sent' })
    })

    it('surfaces emailDelivery:"failed" when the resend send fails', async () => {
      seedUsers([makeUser({ id: 'u5', email: 'bob@x.io', emailVerified: false })])
      mail.sendVerificationEmail.mockResolvedValue(false)

      const res = await service.resendVerify('bob@x.io')

      expect(res).toEqual({ message: 'verify-email-sent', emailDelivery: 'failed' })
    })

    it('is a no-op reporting emailDelivery:"sent" for an unknown email (no enumeration)', async () => {
      seedUsers([])

      const res = await service.resendVerify('ghost@x.io')

      expect(mail.sendVerificationEmail).not.toHaveBeenCalled()
      // No-op path must be indistinguishable from a real send: same message + "sent".
      expect(res).toEqual({ message: 'verify-email-sent', emailDelivery: 'sent' })
    })

    it('is a no-op reporting emailDelivery:"sent" for an already-verified account', async () => {
      seedUsers([makeUser({ email: 'done@x.io', emailVerified: true })])

      const res = await service.resendVerify('done@x.io')

      expect(mail.sendVerificationEmail).not.toHaveBeenCalled()
      expect(res).toEqual({ message: 'verify-email-sent', emailDelivery: 'sent' })
    })
  })

  /* ================================= login ================================ */

  describe('login', () => {
    it('issues an access JWT + refresh (hash persisted) and returns a user without the password hash', async () => {
      seedUsers([makeUser({ emailVerified: true })])

      const res = await service.login('alice', 'secret123')

      expect(res.user.id).toBe('u1')
      expect(res.user).not.toHaveProperty('passwordHash')

      // Access token is a real, verifiable JWT carrying the user id.
      const payload = await jwt.verifyAsync(res.accessToken, { secret: SECRET })
      expect(payload.sub).toBe('u1')

      // Refresh token: raw returned to caller, only the hash is stored.
      const stored = lastCall(prisma.refreshToken.create) as { data: { token: string; userId: string } }
      expect(stored.data.userId).toBe('u1')
      expect(stored.data.token).toBe(hashToken(res.refreshToken))
      expect(stored.data.token).not.toBe(res.refreshToken)
    })

    it('rejects a wrong password with a generic Unauthorized and issues no tokens', async () => {
      seedUsers([makeUser({ emailVerified: true })])

      await expect(service.login('alice', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedException)
      expect(prisma.refreshToken.create).not.toHaveBeenCalled()
    })

    it('rejects an unknown identity with the same generic error (no user enumeration)', async () => {
      seedUsers([])

      await expect(service.login('ghost', 'secret123')).rejects.toMatchObject({
        response: { code: 'invalid-credentials' },
      })
    })

    it('still runs a bcrypt.compare on the miss path (timing-oracle guard)', async () => {
      seedUsers([]) // no such user
      ;(bcrypt.compare as jest.Mock).mockClear()

      await expect(service.login('ghost', 'secret123')).rejects.toBeInstanceOf(UnauthorizedException)

      // A real bcrypt comparison must happen even when the account is missing, so a
      // wrong-password (existing user) and a no-such-user response cost the same time.
      expect(bcrypt.compare as jest.Mock).toHaveBeenCalledTimes(1)
      const [pw, hash] = (bcrypt.compare as jest.Mock).mock.calls[0]
      expect(pw).toBe('secret123')
      expect(String(hash).startsWith('$2')).toBe(true) // compared against a real bcrypt hash
    })

    it('blocks login until the email is verified (Forbidden), even with the right password', async () => {
      seedUsers([makeUser({ emailVerified: false })])

      await expect(service.login('alice', 'secret123')).rejects.toMatchObject({
        response: { code: 'email-not-verified' },
      })
      expect(prisma.refreshToken.create).not.toHaveBeenCalled()
    })

    it('rejects a Google-only account (no password set) via the same generic path', async () => {
      seedUsers([makeUser({ passwordHash: null, googleId: 'g1', emailVerified: true })])

      await expect(service.login('alice', 'secret123')).rejects.toBeInstanceOf(UnauthorizedException)
    })
  })

  /* ============================ refresh rotation =========================== */

  describe('refresh token — validate + rotate', () => {
    it('validateRefreshToken: looks up by HASH and returns the owning user + token id', async () => {
      const user = makeUser()
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-abc',
        expiresAt: new Date(Date.now() + 60_000),
        user,
      })

      const res = await service.validateRefreshToken('raw-token')

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token: hashToken('raw-token') },
        include: { user: true },
      })
      expect(res.tokenId).toBe('rt-abc')
      expect(res.user.id).toBe('u1')
    })

    it('validateRefreshToken: rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null)
      await expect(service.validateRefreshToken('nope')).rejects.toMatchObject({
        response: { code: 'invalid-refresh-token' },
      })
    })

    it('validateRefreshToken: rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-old',
        expiresAt: new Date(Date.now() - 1000), // already lapsed
        user: makeUser(),
      })
      await expect(service.validateRefreshToken('stale')).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('rotateRefresh: stamps the old row rotatedAt and issues a new pair in the SAME family', async () => {
      prisma.refreshToken.update.mockResolvedValue({ id: 'rt-old', familyId: 'fam-7' })

      const res = await service.rotateRefresh(makeUser(), 'rt-old')

      // Old token is kept but marked consumed (not deleted) so a later replay of it
      // can be caught as reuse.
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-old' },
        data: { rotatedAt: expect.any(Date) },
      })
      expect(prisma.refreshToken.delete).not.toHaveBeenCalled()
      // ...and a fresh refresh persisted as a hash, inheriting the family id.
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1)
      const created = lastCall(prisma.refreshToken.create) as { data: { token: string; familyId: string } }
      expect(created.data.token).toBe(hashToken(res.refreshToken))
      expect(created.data.familyId).toBe('fam-7')
      // New access token is valid.
      const payload = await jwt.verifyAsync(res.accessToken, { secret: SECRET })
      expect(payload.sub).toBe('u1')
    })

    // End-to-end rotation over an in-memory token store. Models the token-family
    // scheme: rotating stamps the old row `rotatedAt` (kept, not deleted); a fresh
    // token joins the same family; and replaying a consumed token is caught as
    // reuse, revoking the whole family. This is the property an attacker probes.
    interface RtRow {
      id: string
      userId: string
      token: string
      familyId: string
      rotatedAt: Date | null
      expiresAt: Date
    }
    const wireTokenStore = (user: User) => {
      let seq = 0
      const store = new Map<string, RtRow>()
      prisma.refreshToken.create.mockImplementation(
        async ({ data }: { data: { userId: string; token: string; expiresAt: Date; familyId?: string } }) => {
          const id = `rt${++seq}`
          const row: RtRow = {
            id,
            userId: data.userId,
            token: data.token,
            familyId: data.familyId ?? `fam${seq}`, // omitted on login → new family
            rotatedAt: null,
            expiresAt: data.expiresAt,
          }
          store.set(data.token, row)
          return row
        },
      )
      prisma.refreshToken.findUnique.mockImplementation(async ({ where }: { where: { token: string } }) => {
        const row = store.get(where.token)
        return row ? { ...row, user } : null
      })
      prisma.refreshToken.update.mockImplementation(
        async ({ where, data }: { where: { id: string }; data: { rotatedAt: Date } }) => {
          const found = [...store.values()].find((r) => r.id === where.id)
          if (!found) throw new Error('not found')
          found.rotatedAt = data.rotatedAt
          return found
        },
      )
      prisma.refreshToken.deleteMany.mockImplementation(async ({ where }: { where: { familyId?: string; userId?: string } }) => {
        let count = 0
        for (const [k, r] of store) {
          if ((where.familyId && r.familyId === where.familyId) || (where.userId && r.userId === where.userId)) {
            store.delete(k)
            count++
          }
        }
        return { count }
      })
      return store
    }

    it('rotation flow: after rotating, the OLD refresh is rejected as reuse and the NEW one is accepted', async () => {
      const user = makeUser({ emailVerified: true })
      seedUsers([user])
      wireTokenStore(user)

      // Get an initial refresh token the honest way.
      const first = await service.login('alice', 'secret123')

      // Rotate it.
      const { tokenId } = await service.validateRefreshToken(first.refreshToken)
      const rotated = await service.rotateRefresh(user, tokenId)

      expect(rotated.refreshToken).not.toBe(first.refreshToken)
      // The new token authenticates fine...
      const again = await service.validateRefreshToken(rotated.refreshToken)
      expect(again.user.id).toBe('u1')
      // ...but replaying the consumed old token is a theft signal → reuse alarm.
      await expect(service.validateRefreshToken(first.refreshToken)).rejects.toMatchObject({
        response: { code: 'refresh-token-reuse' },
      })
    })

    it('reuse detection revokes the WHOLE family: after an alarm, the freshly-minted token is dead too', async () => {
      const user = makeUser({ emailVerified: true })
      seedUsers([user])
      wireTokenStore(user)

      const first = await service.login('alice', 'secret123')
      const { tokenId } = await service.validateRefreshToken(first.refreshToken)
      const rotated = await service.rotateRefresh(user, tokenId)

      // Attacker replays the stolen (already-rotated) token → family revoked.
      await expect(service.validateRefreshToken(first.refreshToken)).rejects.toMatchObject({
        response: { code: 'refresh-token-reuse' },
      })
      // The legitimate current token is now also invalid (whole family killed).
      await expect(service.validateRefreshToken(rotated.refreshToken)).rejects.toMatchObject({
        response: { code: 'invalid-refresh-token' },
      })
    })

    it('logoutAll: revokes every refresh token for the user', async () => {
      await service.logoutAll('u1')
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    })
  })

  /* ============================= verifyEmail ============================== */

  describe('verifyEmail', () => {
    it('sets emailVerified=true and clears the verification rows for a valid token', async () => {
      prisma.emailVerification.findUnique.mockResolvedValue({
        id: 'ev1',
        userId: 'u1',
        expiresAt: new Date(Date.now() + 60_000),
        pendingPasswordHash: null,
        pendingUsername: null,
      })

      const res = await service.verifyEmail('raw')

      expect(prisma.emailVerification.findUnique).toHaveBeenCalledWith({ where: { token: hashToken('raw') } })
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { emailVerified: true } })
      expect(prisma.emailVerification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
      expect(prisma.$transaction).toHaveBeenCalled() // update + delete run atomically
      expect(res).toEqual({ message: 'email-verified' })
    })

    it('applies PENDING credentials from a reclaim atomically with verification', async () => {
      prisma.emailVerification.findUnique.mockResolvedValue({
        id: 'ev1',
        userId: 'u5',
        expiresAt: new Date(Date.now() + 60_000),
        pendingPasswordHash: 'hashed-pending',
        pendingUsername: 'bob2',
      })

      await service.verifyEmail('raw')

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u5' },
        data: { emailVerified: true, passwordHash: 'hashed-pending', username: 'bob2' },
      })
    })

    it('rejects an unknown token and touches no user', async () => {
      prisma.emailVerification.findUnique.mockResolvedValue(null)
      await expect(service.verifyEmail('bad')).rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('rejects an expired token', async () => {
      prisma.emailVerification.findUnique.mockResolvedValue({
        id: 'ev1',
        userId: 'u1',
        expiresAt: new Date(Date.now() - 1000),
      })
      await expect(service.verifyEmail('stale')).rejects.toMatchObject({ response: { code: 'invalid-token' } })
    })
  })

  /* ======================= forgot / reset password ======================== */

  describe('forgotPassword', () => {
    it('creates a hashed reset token and emails it when the account exists', async () => {
      seedUsers([makeUser({ email: 'alice@x.io' })])

      const res = await service.forgotPassword('alice@x.io')

      expect(res).toEqual({ message: 'reset-email-sent' })
      const created = lastCall(prisma.passwordReset.create) as { data: { token: string } }
      expect(created.data.token).toMatch(SHA256_HEX)
      const [, rawSent] = mail.sendPasswordResetEmail.mock.calls[0]
      expect(hashToken(rawSent)).toBe(created.data.token)
    })

    it('is a no-op for an unknown email but returns the SAME response (no enumeration)', async () => {
      seedUsers([])

      const res = await service.forgotPassword('ghost@x.io')

      expect(res).toEqual({ message: 'reset-email-sent' })
      expect(prisma.passwordReset.create).not.toHaveBeenCalled()
      expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled()
    })

    it('returns the SAME generic response even when the reset email fails (no delivery leak)', async () => {
      seedUsers([makeUser({ email: 'alice@x.io' })])
      mail.sendPasswordResetEmail.mockResolvedValue(false) // SMTP failed for a real account

      const res = await service.forgotPassword('alice@x.io')

      // Must NOT expose an emailDelivery flag — that would reveal the account exists.
      expect(res).toEqual({ message: 'reset-email-sent' })
      expect(res).not.toHaveProperty('emailDelivery')
    })

    it('does not throw if the reset email send rejects', async () => {
      seedUsers([makeUser({ email: 'alice@x.io' })])
      mail.sendPasswordResetEmail.mockRejectedValue(new Error('smtp boom'))

      await expect(service.forgotPassword('alice@x.io')).resolves.toEqual({ message: 'reset-email-sent' })
    })
  })

  describe('resetPassword', () => {
    it('rehashes the password, burns the token, and revokes all sessions', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue({
        id: 'pr1',
        userId: 'u1',
        used: false,
        expiresAt: new Date(Date.now() + 60_000),
      })

      const res = await service.resetPassword('raw', 'brand-new-pass')

      expect(res).toEqual({ message: 'password-reset' })
      // New hash written (real bcrypt, not the plaintext).
      const upd = prisma.user.update.mock.calls[0][0] as { data: { passwordHash: string } }
      expect(upd.data.passwordHash).not.toBe('brand-new-pass')
      expect(await bcrypt.compare('brand-new-pass', upd.data.passwordHash)).toBe(true)
      // Single-use: token marked used, and every session torn down.
      expect(prisma.passwordReset.update).toHaveBeenCalledWith({ where: { id: 'pr1' }, data: { used: true } })
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    })

    it('rejects an unknown token', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue(null)
      await expect(service.resetPassword('bad', 'x')).rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('rejects an already-used token (no replay)', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue({
        id: 'pr1',
        userId: 'u1',
        used: true, // already consumed
        expiresAt: new Date(Date.now() + 60_000),
      })
      await expect(service.resetPassword('raw', 'x')).rejects.toMatchObject({ response: { code: 'invalid-token' } })
    })

    it('rejects an expired token', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue({
        id: 'pr1',
        userId: 'u1',
        used: false,
        expiresAt: new Date(Date.now() - 1000),
      })
      await expect(service.resetPassword('raw', 'x')).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  /* ============================ changePassword ============================ */

  describe('changePassword', () => {
    it('rehashes on a correct current password, revokes sessions, and returns a fresh pair', async () => {
      seedUsers([makeUser({ id: 'u1', passwordHash: PW_HASH })])

      const res = await service.changePassword('u1', 'secret123', 'the-new-one')

      const upd = prisma.user.update.mock.calls[0][0] as { data: { passwordHash: string } }
      expect(await bcrypt.compare('the-new-one', upd.data.passwordHash)).toBe(true)
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
      // Current device stays signed in via a new token pair.
      expect(res.accessToken).toBeDefined()
      expect(res.refreshToken).toBeDefined()
    })

    it('rejects a wrong current password and changes nothing', async () => {
      seedUsers([makeUser({ id: 'u1', passwordHash: PW_HASH })])

      await expect(service.changePassword('u1', 'wrong', 'the-new-one')).rejects.toMatchObject({
        response: { code: 'wrong-password' },
      })
      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('rejects when the account has no password (Google-only)', async () => {
      seedUsers([makeUser({ id: 'u1', passwordHash: null, googleId: 'g1' })])

      await expect(service.changePassword('u1', 'anything', 'the-new-one')).rejects.toMatchObject({
        response: { code: 'no-password-set' },
      })
    })
  })

  /* ============================ loginWithGoogle =========================== */

  describe('loginWithGoogle', () => {
    const profile = { googleId: 'g1', email: 'g@x.io', emailVerified: true, displayName: 'G' }

    it('issues tokens for an existing Google-linked user without creating anything', async () => {
      seedUsers([makeUser({ id: 'u1', googleId: 'g1', email: 'g@x.io', emailVerified: true })])

      const res = await service.loginWithGoogle(profile)

      expect(res.user.id).toBe('u1')
      expect(prisma.user.create).not.toHaveBeenCalled()
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1)
    })

    it('links Google onto an existing local account (by email) and marks it verified', async () => {
      seedUsers([makeUser({ id: 'u2', googleId: null, email: 'g@x.io', emailVerified: false })])

      await service.loginWithGoogle(profile)

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u2' },
        data: { googleId: 'g1', emailVerified: true },
      })
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('creates a new, already-verified user when the Google profile is unseen', async () => {
      seedUsers([]) // no google id, no email match, username candidate free

      await service.loginWithGoogle(profile)

      const created = lastCall(prisma.user.create) as { data: { emailVerified: boolean; googleId: string } }
      expect(created.data.googleId).toBe('g1')
      expect(created.data.emailVerified).toBe(true)
    })
  })
})
