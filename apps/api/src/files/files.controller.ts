import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { JwtGuard } from '../auth/guards/jwt.guard'
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator'
import { ProjectRoleGuard } from '../projects/guards/project-role.guard'
import { MinRole } from '../projects/decorators/min-role.decorator'
import { FilesService } from './files.service'
import { RevisionsService } from './revisions.service'
import { CreateFileDto, SaveContentDto, UpdateFileDto } from './dto/file.dto'
import { CreateRevisionDto } from './dto/revision.dto'

// Nested under a project so ProjectRoleGuard (which reads :id) enforces membership/role.
@Controller('projects/:id/files')
@UseGuards(JwtGuard, ProjectRoleGuard)
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly revisions: RevisionsService,
  ) {}

  @Get()
  @MinRole(Role.Viewer)
  tree(@Param('id') projectId: string) {
    return this.files.tree(projectId)
  }

  @Post()
  @MinRole(Role.Editor)
  create(@Param('id') projectId: string, @Body() dto: CreateFileDto) {
    return this.files.create(projectId, dto)
  }

  @Get(':fileId')
  @MinRole(Role.Viewer)
  get(@Param('id') projectId: string, @Param('fileId') fileId: string) {
    return this.files.get(projectId, fileId)
  }

  @Patch(':fileId')
  @MinRole(Role.Editor)
  update(@Param('id') projectId: string, @Param('fileId') fileId: string, @Body() dto: UpdateFileDto) {
    return this.files.update(projectId, fileId, dto)
  }

  @Put(':fileId/content')
  @MinRole(Role.Editor)
  @HttpCode(HttpStatus.OK)
  saveContent(@Param('id') projectId: string, @Param('fileId') fileId: string, @Body() dto: SaveContentDto) {
    return this.files.saveContent(projectId, fileId, dto.content)
  }

  @Delete(':fileId')
  @MinRole(Role.Editor)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') projectId: string, @Param('fileId') fileId: string) {
    return this.files.remove(projectId, fileId)
  }

  /* --------------------------- version history (4.5) --------------------------- */

  @Post(':fileId/revisions')
  @MinRole(Role.Editor)
  createRevision(
    @CurrentUser() user: AuthUser,
    @Param('id') projectId: string,
    @Param('fileId') fileId: string,
    @Body() dto: CreateRevisionDto,
  ) {
    return this.revisions.create(projectId, fileId, user.id, dto)
  }

  @Get(':fileId/revisions')
  @MinRole(Role.Viewer)
  listRevisions(@Param('id') projectId: string, @Param('fileId') fileId: string) {
    return this.revisions.list(projectId, fileId)
  }

  @Get(':fileId/revisions/:revisionId')
  @MinRole(Role.Viewer)
  getRevision(
    @Param('id') projectId: string,
    @Param('fileId') fileId: string,
    @Param('revisionId') revisionId: string,
  ) {
    return this.revisions.get(projectId, fileId, revisionId)
  }
}
