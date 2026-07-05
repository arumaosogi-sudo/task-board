import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '@nestjs/passport'

/**
 * Wraps the passport 'google' strategy. If GOOGLE_CLIENT_SECRET is not configured,
 * short-circuits with 503 instead of failing with "Unknown authentication strategy"
 * (the strategy isn't registered when unconfigured).
 */
@Injectable()
export class GoogleGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super()
  }

  canActivate(context: ExecutionContext) {
    if (!this.config.get<string>('GOOGLE_CLIENT_SECRET')) {
      throw new ServiceUnavailableException({
        code: 'google-oauth-unconfigured',
        message: 'Google OAuth ยังไม่ได้ตั้งค่า (ขาด GOOGLE_CLIENT_SECRET)',
      })
    }
    return super.canActivate(context)
  }
}
