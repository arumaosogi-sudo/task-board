import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { FilesController } from './files.controller'
import { FilesService } from './files.service'
import { RevisionsService } from './revisions.service'
import { ProjectRoleGuard } from '../projects/guards/project-role.guard'

@Module({
  imports: [NotificationsModule],
  controllers: [FilesController],
  // ProjectRoleGuard depends only on Reflector + the global PrismaService.
  providers: [FilesService, RevisionsService, ProjectRoleGuard],
})
export class FilesModule {}
