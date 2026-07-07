import { Module } from '@nestjs/common'
import { UpdatesController } from './updates.controller'
import { UpdatesService } from './updates.service'

// PrismaService comes from the global PrismaModule; no local imports needed.
@Module({
  controllers: [UpdatesController],
  providers: [UpdatesService],
})
export class UpdatesModule {}
