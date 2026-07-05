import { Logger, Module, Provider } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
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

// Only register the Google strategy when a client secret is present. The
// passport-google-oauth20 Strategy throws at construction with an empty secret,
// so registering it unconditionally would crash the whole app at boot.
const googleConfigured = !!process.env.GOOGLE_CLIENT_SECRET
const googleProviders: Provider[] = googleConfigured ? [GoogleStrategy] : []
if (!googleConfigured) {
  new Logger('AuthModule').warn(
    'GOOGLE_CLIENT_SECRET is not set — Google OAuth routes will respond 503 until configured.',
  )
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
  providers: [AuthService, JwtStrategy, JwtRefreshGuard, GoogleGuard, ...googleProviders],
})
export class AuthModule {}
