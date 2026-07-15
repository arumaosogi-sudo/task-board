import { ServiceUnavailableException } from '@nestjs/common'
import type { ArgumentsHost, ExecutionContext } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import { googleStrategyFactory } from './auth.module'
import { GoogleStrategy } from './strategies/google.strategy'
import { GoogleGuard } from './guards/google.guard'
import { GoogleOAuthExceptionFilter } from './filters/google-oauth.filter'

// Build a fake ConfigService backed by a plain map (get supports a default arg,
// matching @nestjs/config's signature).
function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T>(key: string, def?: T) => (values[key] as unknown as T) ?? def,
  } as unknown as ConfigService
}

const FULL = {
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'super-secret',
}

/* -------------------------------------------------------------------------- */
/* Factory: decides whether the passport 'google' strategy is registered.     */
/* This is the root-cause fix — the decision reads ConfigService at DI time    */
/* (post-.env), not process.env at import time.                               */
/* -------------------------------------------------------------------------- */
describe('googleStrategyFactory', () => {
  it('registers the strategy when both client id and secret are present', () => {
    const strategy = googleStrategyFactory(fakeConfig(FULL))
    expect(strategy).toBeInstanceOf(GoogleStrategy)
  })

  it('returns null (leaves strategy unregistered) when the secret is missing', () => {
    const strategy = googleStrategyFactory(fakeConfig({ GOOGLE_CLIENT_ID: FULL.GOOGLE_CLIENT_ID }))
    expect(strategy).toBeNull()
  })

  it('returns null when the client id is missing (secret alone is not enough)', () => {
    // passport-google-oauth20 throws at construction without a clientID, so the
    // factory must refuse to build here — otherwise boot would crash.
    const strategy = googleStrategyFactory(fakeConfig({ GOOGLE_CLIENT_SECRET: FULL.GOOGLE_CLIENT_SECRET }))
    expect(strategy).toBeNull()
  })

  it('returns null when nothing is configured', () => {
    expect(googleStrategyFactory(fakeConfig({}))).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Guard: must 503 (never fall through to a 500) whenever the strategy would   */
/* be unregistered. Its condition mirrors the factory exactly.                 */
/* -------------------------------------------------------------------------- */
describe('GoogleGuard', () => {
  const ctx = {} as ExecutionContext

  it('throws 503 with a stable code when the secret is missing', () => {
    const guard = new GoogleGuard(fakeConfig({ GOOGLE_CLIENT_ID: FULL.GOOGLE_CLIENT_ID }))
    try {
      guard.canActivate(ctx)
      fail('expected ServiceUnavailableException')
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException)
      expect((err as ServiceUnavailableException).getResponse()).toMatchObject({
        code: 'google-oauth-unconfigured',
      })
    }
  })

  it('throws 503 when the client id is missing even though the secret is set', () => {
    const guard = new GoogleGuard(fakeConfig({ GOOGLE_CLIENT_SECRET: FULL.GOOGLE_CLIENT_SECRET }))
    expect(() => guard.canActivate(ctx)).toThrow(ServiceUnavailableException)
  })

  it('delegates to passport (no 503) when fully configured', () => {
    // Stub the passport AuthGuard.canActivate on the prototype chain so we assert
    // delegation without booting passport.
    const superProto = Object.getPrototypeOf(GoogleGuard.prototype)
    const spy = jest.spyOn(superProto, 'canActivate').mockReturnValue(true)
    try {
      const guard = new GoogleGuard(fakeConfig(FULL))
      expect(guard.canActivate(ctx)).toBe(true)
      expect(spy).toHaveBeenCalledWith(ctx)
    } finally {
      spy.mockRestore()
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Filter: turns any OAuth-route failure into a friendly web redirect instead  */
/* of raw API JSON.                                                            */
/* -------------------------------------------------------------------------- */
describe('GoogleOAuthExceptionFilter', () => {
  const WEB_URL = 'https://app.example.com'

  function run(exception: unknown, query: Record<string, string> = {}) {
    const filter = new GoogleOAuthExceptionFilter(fakeConfig({ WEB_URL }))
    const redirect = jest.fn()
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ query }) as unknown as Request,
        getResponse: () => ({ redirect }) as unknown as Response,
      }),
    } as unknown as ArgumentsHost
    filter.catch(exception, host)
    return redirect
  }

  it('redirects a 503 (unconfigured) to ?error=google-unconfigured', () => {
    const redirect = run(new ServiceUnavailableException({ code: 'google-oauth-unconfigured' }))
    expect(redirect).toHaveBeenCalledWith(`${WEB_URL}/login?error=google-unconfigured`)
  })

  it('redirects a declined consent (?error=access_denied) to ?error=google-cancelled', () => {
    // A generic passport failure surfaces as a 500, but the access_denied query
    // marker takes precedence so the user is told they cancelled, not that we broke.
    const redirect = run(new Error('passport failed'), { error: 'access_denied' })
    expect(redirect).toHaveBeenCalledWith(`${WEB_URL}/login?error=google-cancelled`)
  })

  it('redirects any other failure to a generic ?error=google-failed', () => {
    const redirect = run(new Error('unexpected'))
    expect(redirect).toHaveBeenCalledWith(`${WEB_URL}/login?error=google-failed`)
  })
})
