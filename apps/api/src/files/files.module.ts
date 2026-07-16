import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { FilesController } from './files.controller'
import { FilesService } from './files.service'
import { RevisionsService } from './revisions.service'
import { AssetsService } from './assets.service'
import { SupabaseStorageService } from '../storage/supabase-storage.service'
import { ProjectRoleGuard } from '../projects/guards/project-role.guard'

@Module({
  imports: [NotificationsModule],
  controllers: [FilesController],
  // ProjectRoleGuard depends only on Reflector + the global PrismaService.
  providers: [FilesService, RevisionsService, AssetsService, SupabaseStorageService, ProjectRoleGuard],
})
export class FilesModule {}
