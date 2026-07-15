import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '@nestjs/passport'

/**
 * Wraps the passport 'google' strategy. When Google OAuth isn't fully configured
 * it short-circuits with 503 instead of letting the request reach an unregistered
 * strategy (which would surface as a confusing 500 "Unknown authentication
 * strategy 'google'").
 *
 * The configured/unconfigured check mirrors googleStrategyFactory exactly (both
 * client id AND secret, both read through ConfigService) so the guard's verdict
 * and the strategy's registration can never disagree.
 */
@Injectable()
export class GoogleGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET')

    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException({
        code: 'google-oauth-unconfigured',
        message: 'Google OAuth ยังไม่ได้ตั้งค่า (ต้องมี GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET)',
      })
    }

    return super.canActivate(context)
  }
}
