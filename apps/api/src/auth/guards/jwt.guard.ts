import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

/** Protects routes with a valid Bearer access token. */
@Injectable()
export class JwtGuard extends AuthGuard('jwt') {}
