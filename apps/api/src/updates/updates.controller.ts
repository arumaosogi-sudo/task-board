import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { JwtGuard } from '../auth/guards/jwt.guard'
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator'
import { UpdatesService } from './updates.service'
import { ProjectChangesQuery, UpdatesQuery } from './dto/updates-query.dto'

// `/me/*` cross-project feeds. Distinct from AuthController's `/auth/me`.
@Controller('me')
@UseGuards(JwtGuard)
export class UpdatesController {
  constructor(private readonly updates: UpdatesService) {}

  @Get('updates')
  myUpdates(@CurrentUser() user: AuthUser, @Query() q: UpdatesQuery) {
    return this.updates.myUpdates(user.id, q.range, q.projectId)
  }

  @Get('project-changes')
  projectChanges(@CurrentUser() user: AuthUser, @Query() q: ProjectChangesQuery) {
    return this.updates.projectChanges(user.id, q.range, q.projectId, q.authorId)
  }
}
