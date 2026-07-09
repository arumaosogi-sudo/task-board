import { ConfigService } from '@nestjs/config'
import { assertStrongSecret, validateAuthSecrets, MIN_SECRET_LENGTH } from './validate-secrets'

// P2 Hardening — fail-fast on a weak/default JWT secret. A forgeable JWT_SECRET
// lets an attacker mint access tokens (and the collab WS auth shares the secret),
// so the app must refuse to boot rather than run insecure. These tests pin the
// exact accept/reject boundary the bootstrap relies on.
describe('validate-secrets', () => {
  const strong = 'x'.repeat(MIN_SECRET_LENGTH) // 32 chars, non-default

  // Minimal ConfigService stand-in: only `get` is exercised by the validators.
  const cfg = (map: Record<string, string | undefined>): ConfigService =>
    ({ get: (key: string) => map[key] }) as unknown as ConfigService

  describe('assertStrongSecret', () => {
    it('throws when the secret is undefined', () => {
      expect(() => assertStrongSecret('JWT_SECRET', undefined)).toThrow(/JWT_SECRET/)
    })

    it('throws when the secret is shorter than the minimum length', () => {
      expect(() => assertStrongSecret('JWT_SECRET', 'x'.repeat(MIN_SECRET_LENGTH - 1))).toThrow()
    })

    it('throws when the secret is the "change-me…" placeholder even if long enough', () => {
      expect(() => assertStrongSecret('JWT_SECRET', 'change-me-please-this-is-long-enough-32')).toThrow()
    })

    it('accepts a secret at exactly the minimum length', () => {
      expect(() => assertStrongSecret('JWT_SECRET', strong)).not.toThrow()
    })
  })

  describe('validateAuthSecrets', () => {
    it('passes when JWT_SECRET is strong and no refresh secret is set', () => {
      expect(() => validateAuthSecrets(cfg({ JWT_SECRET: strong }))).not.toThrow()
    })

    it('throws when JWT_SECRET is missing', () => {
      expect(() => validateAuthSecrets(cfg({}))).toThrow(/JWT_SECRET/)
    })

    it('validates JWT_REFRESH_SECRET only when it is set — weak value is rejected', () => {
      expect(() => validateAuthSecrets(cfg({ JWT_SECRET: strong, JWT_REFRESH_SECRET: 'short' }))).toThrow(
        /JWT_REFRESH_SECRET/,
      )
    })

    it('passes when both secrets are strong', () => {
      expect(() =>
        validateAuthSecrets(cfg({ JWT_SECRET: strong, JWT_REFRESH_SECRET: 'y'.repeat(40) })),
      ).not.toThrow()
    })

    it('ignores an unset refresh secret (opaque refresh tokens are not JWTs)', () => {
      // undefined must skip validation; only a *present* refresh secret is checked.
      expect(() =>
        validateAuthSecrets(cfg({ JWT_SECRET: strong, JWT_REFRESH_SECRET: undefined })),
      ).not.toThrow()
    })
  })
})
