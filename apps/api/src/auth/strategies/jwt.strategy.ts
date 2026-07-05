import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { AuthUser } from '../decorators/current-user.decorator'

export interface JwtPayload {
  sub: string
  username: string
  email: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET')
    if (!secret) throw new Error('JWT_SECRET is not configured')
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    })
  }

  // Passport has already verified the signature + expiry by the time we get here.
  validate(payload: JwtPayload): AuthUser {
    if (!payload?.sub) throw new UnauthorizedException()
    return { id: payload.sub, username: payload.username, email: payload.email }
  }
}
