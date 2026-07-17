import { Module } from '@nestjs/common'
import { PublicShareController } from './public-share.controller'
import { ShareManagementController } from './share-management.controller'
import { ShareService } from './share.service'
import { ShareLinkGuard } from './guards/share-link.guard'
import { SupabaseStorageService } from '../storage/supabase-storage.service'
import { ProjectRoleGuard } from '../projects/guards/project-role.guard'

@Module({
  controllers: [PublicShareController, ShareManagementController],
  // ShareLinkGuard + ProjectRoleGuard depend only on the global PrismaService (+ Reflector).
  providers: [ShareService, ShareLinkGuard, SupabaseStorageService, ProjectRoleGuard],
})
export class ShareModule {}
