import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20'

export interface GoogleProfile {
  googleId: string
  email: string
  emailVerified: boolean
  displayName?: string
}

/**
 * Only instantiated when GOOGLE_CLIENT_SECRET is configured (see AuthModule).
 * passport-google-oauth20 throws on construction if clientID/secret are empty.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: config.get<string>(
        'GOOGLE_CALLBACK_URL',
        'http://localhost:3001/auth/google/callback',
      ),
      scope: ['email', 'profile'],
    })
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback): void {
    const email = profile.emails?.[0]?.value
    if (!email) {
      done(new Error('Google account has no email'), undefined)
      return
    }
    const user: GoogleProfile = {
      googleId: profile.id,
      email,
      emailVerified: profile.emails?.[0]?.verified === true,
      displayName: profile.displayName,
    }
    done(null, user)
  }
}
