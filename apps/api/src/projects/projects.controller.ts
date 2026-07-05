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
import { ProjectsService } from './projects.service'
import { ProjectRoleGuard } from './guards/project-role.guard'
import { MinRole } from './decorators/min-role.decorator'
import {
  AcceptInviteDto,
  CreateProjectDto,
  InviteDto,
  TransferOwnershipDto,
  UpdateMemberRoleDto,
  UpdateProjectDto,
} from './dto/project.dto'

// Every route requires a valid access token. Project-scoped routes (with :id)
// additionally pass ProjectRoleGuard, which enforces @MinRole server-side.
@Controller('projects')
@UseGuards(JwtGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /* ----------------------------- collection ------------------------------- */

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.id, dto)
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.listMine(user.id)
  }

  @Get('trash')
  trash(@CurrentUser() user: AuthUser) {
    return this.projects.listTrash(user.id)
  }

  // Accepting an invite is not project-scoped by role (the token is the authority).
  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  acceptInvite(@CurrentUser() user: AuthUser, @Body() dto: AcceptInviteDto) {
    return this.projects.acceptInvite(user.id, dto.token)
  }

  /* ------------------------------- single --------------------------------- */

  @Get(':id')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Viewer)
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.getDetail(id, user.id)
  }

  @Patch(':id')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Editor)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, user.id, dto)
  }

  @Delete(':id')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Owner)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.projects.softDelete(id)
  }

  @Post(':id/restore')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Owner)
  @HttpCode(HttpStatus.OK)
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.restore(id, user.id)
  }

  @Delete(':id/permanent')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Owner)
  @HttpCode(HttpStatus.OK)
  permanent(@Param('id') id: string) {
    return this.projects.permanentDelete(id)
  }

  /* ------------------------------- members -------------------------------- */

  @Get(':id/members')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Viewer)
  members(@Param('id') id: string) {
    return this.projects.listMembers(id)
  }

  @Post(':id/invitations')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Owner)
  @HttpCode(HttpStatus.OK)
  invite(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: InviteDto) {
    return this.projects.invite(id, { id: user.id, username: user.username }, dto)
  }

  @Patch(':id/members/:userId')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Owner)
  updateRole(@Param('id') id: string, @Param('userId') userId: string, @Body() dto: UpdateMemberRoleDto) {
    return this.projects.updateMemberRole(id, userId, dto.role as Role)
  }

  @Delete(':id/members/:userId')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Owner)
  @HttpCode(HttpStatus.OK)
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.removeMember(id, userId)
  }

  @Post(':id/leave')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Viewer)
  @HttpCode(HttpStatus.OK)
  leave(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request & { membership: Membership },
  ) {
    return this.projects.leave(id, user.id, req.membership.role)
  }

  @Post(':id/transfer')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Owner)
  @HttpCode(HttpStatus.OK)
  transfer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransferOwnershipDto) {
    return this.projects.transferOwnership(id, user.id, dto.userId)
  }

  /* --------------------------------- pins --------------------------------- */

  @Post(':id/pin')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Viewer)
  @HttpCode(HttpStatus.OK)
  pin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.pin(id, user.id)
  }

  @Delete(':id/pin')
  @UseGuards(ProjectRoleGuard)
  @MinRole(Role.Viewer)
  @HttpCode(HttpStatus.OK)
  unpin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.unpin(id, user.id)
  }
}
