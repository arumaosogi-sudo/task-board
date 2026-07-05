import { Module } from '@nestjs/common'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'

@Module({
  // PrismaService is provided by the @Global() PrismaModule.
  controllers: [NotificationsController],
  providers: [NotificationsService],
  // Exported so ProjectsModule / FilesModule can fan-out notifications.
  exports: [NotificationsService],
})
export class NotificationsModule {}
