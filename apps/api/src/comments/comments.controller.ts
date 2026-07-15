import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Membership, Role } from '@prisma/client'
import { Request } from 'express'
import { JwtGuard } from '../auth/guards/jwt.guard'
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator'
import { ProjectRoleGuard } from '../projects/guards/project-role.guard'
import { MinRole } from '../projects/decorators/min-role.decorator'
import { CommentsService } from './comments.service'
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto'

// Nested under a project + file so ProjectRoleGuard (which reads :id) enforces
// membership/role, and every service method re-scopes file→project→comment (IDOR).
@Controller('projects/:id/files/:fileId/comments')
@UseGuards(JwtGuard, ProjectRoleGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @MinRole(Role.Viewer)
  list(@Param('id') projectId: string, @Param('fileId') fileId: string) {
    return this.comments.list(projectId, fileId)
  }

  @Post()
  @MinRole(Role.Editor)
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') projectId: string,
    @Param('fileId') fileId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.create(projectId, fileId, user.id, dto)
  }

  @Patch(':commentId')
  @MinRole(Role.Editor)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') projectId: string,
    @Param('fileId') fileId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.comments.update(projectId, fileId, commentId, user.id, dto)
  }

  @Delete(':commentId')
  @MinRole(Role.Editor)
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') projectId: string,
    @Param('fileId') fileId: string,
    @Param('commentId') commentId: string,
    @Req() req: Request & { membership: Membership },
  ) {
    return this.comments.remove(projectId, fileId, commentId, user.id, req.membership.role)
  }

  @Patch(':commentId/resolve')
  @MinRole(Role.Editor)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id') projectId: string,
    @Param('fileId') fileId: string,
    @Param('commentId') commentId: string,
    @Req() req: Request & { membership: Membership },
  ) {
    return this.comments.resolve(projectId, fileId, commentId, user.id, req.membership.role)
  }

  @Patch(':commentId/reopen')
  @MinRole(Role.Editor)
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id') projectId: string,
    @Param('fileId') fileId: string,
    @Param('commentId') commentId: string,
    @Req() req: Request & { membership: Membership },
  ) {
    return this.comments.reopen(projectId, fileId, commentId, user.id, req.membership.role)
  }
}
