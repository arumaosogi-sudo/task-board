import { AuthController } from './auth.controller'

// P2 Hardening — rate-limit metadata on the auth surface. The @Throttle decorator
// blunts username enumeration (feeds credential-stuffing) and brute force. We
// verify the *declared* limits via the reflection metadata @nestjs/throttler
// writes onto each handler, so a future edit that loosens or drops a limit fails
// the suite. (Exercising the live 429 needs a booted app + real limiter, deferred
// to the integration/E2E tier — see docs/test-plan.md P2 #13.)
//
// @nestjs/throttler v6 stores per-config-name metadata on the handler function:
//   `THROTTLER:LIMIT<name>` and `THROTTLER:TTL<name>` (default config name = "default").
const LIMIT_KEY = 'THROTTLER:LIMITdefault'
const TTL_KEY = 'THROTTLER:TTLdefault'

const readThrottle = (handler: unknown) => ({
  limit: Reflect.getMetadata(LIMIT_KEY, handler as object),
  ttl: Reflect.getMetadata(TTL_KEY, handler as object),
})

describe('AuthController — @Throttle rate limits', () => {
  it('throttles check-username to 20 requests / 60s (enumeration guard)', () => {
    expect(readThrottle(AuthController.prototype.checkUsername)).toEqual({ limit: 20, ttl: 60_000 })
  })

  it('throttles register to 5 requests / 60s', () => {
    expect(readThrottle(AuthController.prototype.register)).toEqual({ limit: 5, ttl: 60_000 })
  })

  it('throttles login to 5 requests / 60s', () => {
    expect(readThrottle(AuthController.prototype.login)).toEqual({ limit: 5, ttl: 60_000 })
  })

  it('throttles resend-verify to 1 request / 60s', () => {
    expect(readThrottle(AuthController.prototype.resendVerify)).toEqual({ limit: 1, ttl: 60_000 })
  })
})
