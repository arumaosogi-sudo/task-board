import { Logger, Module, Provider } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { UsersModule } from '../users/users.module'
import { MailModule } from '../mail/mail.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './strategies/jwt.strategy'
import { GoogleStrategy } from './strategies/google.strategy'
import { JwtRefreshGuard } from './guards/jwt-refresh.guard'
import { GoogleGuard } from './guards/google.guard'
import { GoogleOAuthExceptionFilter } from './filters/google-oauth.filter'

/**
 * Builds the Google passport strategy — or leaves it unregistered.
 *
 * This runs as a DI factory (at `NestFactory.create` time), which is AFTER
 * ConfigModule has loaded `.env`. That timing is the whole point: the previous
 * implementation read `process.env.GOOGLE_CLIENT_SECRET` at module *import* time,
 * which executes while Node is still resolving the import graph — before dotenv
 * has populated `process.env`. So a secret set only in `.env` looked absent, the
 * strategy was never registered, yet GoogleGuard (which reads ConfigService, and
 * therefore *did* see the secret) let requests through to a passport strategy that
 * didn't exist → "Unknown authentication strategy 'google'" → HTTP 500.
 *
 * Reading through ConfigService here makes the factory and the guard agree on a
 * single source of truth, so an unconfigured deployment deterministically hits the
 * guard's 503 path instead of a 500.
 *
 * Both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required: passport-google-
 * oauth20 throws at construction if either is empty, which would crash boot.
 */
export function googleStrategyFactory(config: ConfigService): GoogleStrategy | null {
  const clientId = config.get<string>('GOOGLE_CLIENT_ID')
  const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    new Logger('AuthModule').warn(
      'Google OAuth is not fully configured (need GOOGLE_CLIENT_ID and ' +
        'GOOGLE_CLIENT_SECRET) — /auth/google routes will respond 503 until set.',
    )
    return null
  }

  return new GoogleStrategy(config)
}

// Provided under the GoogleStrategy token so Nest instantiates it eagerly at
// bootstrap (like any singleton provider). Instantiating a PassportStrategy is
// what registers it with passport; returning null simply skips registration.
const googleStrategyProvider: Provider = {
  provide: GoogleStrategy,
  useFactory: googleStrategyFactory,
  inject: [ConfigService],
}

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    UsersModule,
    MailModule,
    JwtModule.register({}), // secrets/expiry passed per-call in AuthService
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshGuard,
    GoogleGuard,
    GoogleOAuthExceptionFilter,
    googleStrategyProvider,
  ],
})
export class AuthModule {}
