import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import { AuthService, REFRESH_COOKIE } from '../auth.service'

/**
 * Validates the opaque refresh token carried in the httpOnly `tb_refresh` cookie.
 * On success attaches `req.user` and `req.refreshTokenId` for rotation/logout.
 */
@Injectable()
export class JwtRefreshGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown; refreshTokenId?: string }>()
    const raw = req.cookies?.[REFRESH_COOKIE]
    if (!raw || typeof raw !== 'string') {
      throw new UnauthorizedException({ code: 'no-refresh-token', message: 'ไม่พบ refresh token' })
    }

    const result = await this.authService.validateRefreshToken(raw)
    req.user = { id: result.user.id, username: result.user.username, email: result.user.email }
    req.refreshTokenId = result.tokenId
    return true
  }
}
