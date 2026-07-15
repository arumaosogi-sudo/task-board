import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { CommentsController } from './comments.controller'
import { CommentsService } from './comments.service'
import { ProjectRoleGuard } from '../projects/guards/project-role.guard'

@Module({
  imports: [NotificationsModule],
  controllers: [CommentsController],
  // ProjectRoleGuard depends only on Reflector + the global PrismaService.
  providers: [CommentsService, ProjectRoleGuard],
})
export class CommentsModule {}
