import { Module } from '@nestjs/common'
import { UsersModule } from '../users/users.module'
import { MailModule } from '../mail/mail.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'
import { ProjectRoleGuard } from './guards/project-role.guard'

@Module({
  imports: [UsersModule, MailModule, NotificationsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectRoleGuard],
})
export class ProjectsModule {}
