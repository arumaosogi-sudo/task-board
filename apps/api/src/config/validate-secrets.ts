import { ConfigService } from '@nestjs/config'

export const MIN_SECRET_LENGTH = 32

/**
 * Reject a secret that is missing, too short, or still the shipped placeholder.
 * A weak/default JWT_SECRET lets an attacker forge access tokens (and the collab
 * WS auth uses the same secret), so we fail fast at boot rather than run insecure.
 */
export function assertStrongSecret(name: string, value: string | undefined): void {
  if (!value || value.length < MIN_SECRET_LENGTH || value.startsWith('change-me')) {
    throw new Error(
      `${name} must be a strong, non-default value ` +
        `(>= ${MIN_SECRET_LENGTH} chars, not the "change-me…" placeholder). ` +
        `Set a random secret in the environment before starting the API.`,
    )
  }
}

/**
 * Validate auth secrets before the app accepts traffic. Read via ConfigService
 * (not raw process.env) so values loaded from the .env file by ConfigModule are
 * seen — otherwise a local-dev secret in .env would look "missing".
 * JWT_SECRET is required (signs access tokens + collab auth). JWT_REFRESH_SECRET
 * is validated only when present — refresh tokens are opaque (not JWTs) so it is
 * not currently read, but if an operator sets it we still reject weak/default values.
 */
export function validateAuthSecrets(config: ConfigService): void {
  assertStrongSecret('JWT_SECRET', config.get<string>('JWT_SECRET'))
  const refresh = config.get<string>('JWT_REFRESH_SECRET')
  if (refresh !== undefined) {
    assertStrongSecret('JWT_REFRESH_SECRET', refresh)
  }
}
