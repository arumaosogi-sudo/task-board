import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Membership, Role } from '@prisma/client'
import { Request } from 'express'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthUser } from '../../auth/decorators/current-user.decorator'
import { MIN_ROLE_KEY, ROLE_RANK } from '../decorators/min-role.decorator'

/**
 * Server-side authorization (system rule #1: never trust the client).
 * Runs AFTER JwtGuard. Loads the caller's membership for the :id project and
 * enforces the route's @MinRole. Attaches `req.membership` for handlers.
 *
 * Non-members get 404 (not 403) so project existence isn't leaked to outsiders.
 */
@Injectable()
export class ProjectRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Role | undefined>(MIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? Role.Viewer

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser; membership?: Membership }>()
    const user = req.user
    const projectId = req.params.id
    if (!user || !projectId) throw new NotFoundException({ code: 'project-not-found' })

    const membership = await this.prisma.membership.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    })
    if (!membership) throw new NotFoundException({ code: 'project-not-found', message: 'ไม่พบ Project นี้' })

    if (ROLE_RANK[membership.role] < ROLE_RANK[required]) {
      throw new ForbiddenException({
        code: 'insufficient-role',
        message: `ต้องมีสิทธิ์อย่างน้อยระดับ ${required}`,
      })
    }

    req.membership = membership
    return true
  }
}
