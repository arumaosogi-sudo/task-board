import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { JwtGuard } from '../auth/guards/jwt.guard'
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator'
import { ProjectRoleGuard } from '../projects/guards/project-role.guard'
import { MinRole } from '../projects/decorators/min-role.decorator'
import { ShareService } from './share.service'
import { CreateShareLinkDto } from './dto/share-link.dto'

/**
 * Owner-only management of a file's share links (ADR 0006 §5.2). Nested under a
 * project so the EXISTING `ProjectRoleGuard` (reads `:id`) enforces membership + role
 * — a different, authenticated authority than the public `ShareLinkGuard`. Opening
 * data to the public is a project-level decision, hence @MinRole(Owner).
 */
@Controller('projects/:id/files/:fileId/share-links')
@UseGuards(JwtGuard, ProjectRoleGuard)
@MinRole(Role.Owner)
export class ShareManagementController {
  constructor(private readonly share: ShareService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') projectId: string,
    @Param('fileId') fileId: string,
    @Body() dto: CreateShareLinkDto,
  ) {
    return this.share.create(projectId, fileId, user.id, dto)
  }

  @Get()
  list(@Param('id') projectId: string, @Param('fileId') fileId: string) {
    return this.share.list(projectId, fileId)
  }

  @Patch(':shareLinkId/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @Param('id') projectId: string,
    @Param('fileId') fileId: string,
    @Param('shareLinkId') shareLinkId: string,
  ) {
    return this.share.publish(projectId, fileId, shareLinkId)
  }

  @Delete(':shareLinkId')
  @HttpCode(HttpStatus.OK)
  revoke(
    @Param('id') projectId: string,
    @Param('fileId') fileId: string,
    @Param('shareLinkId') shareLinkId: string,
  ) {
    return this.share.revoke(projectId, fileId, shareLinkId)
  }
}
