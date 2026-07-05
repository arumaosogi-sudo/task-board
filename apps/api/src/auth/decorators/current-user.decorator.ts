import { createParamDecorator, ExecutionContext } from '@nestjs/common'

/** Shape attached to req.user by JwtStrategy / RefreshTokenGuard. */
export interface AuthUser {
  id: string
  username: string
  email: string
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | string => {
    const req = ctx.switchToHttp().getRequest()
    const user = req.user as AuthUser
    return data ? user[data] : user
  },
)
