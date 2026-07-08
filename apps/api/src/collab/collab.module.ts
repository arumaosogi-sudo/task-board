import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { CollabService } from './collab.service'
import { NotificationsModule } from '../notifications/notifications.module'

/**
 * Phase 4.1 — wires the Hocuspocus collaboration server into the app.
 * PrismaModule and ConfigModule are @Global, so only JwtModule (for verifying
 * access tokens on WS connect) and NotificationsModule (Revision fan-out on save)
 * need to be imported here.
 */
@Module({
  imports: [ConfigModule, JwtModule.register({}), NotificationsModule],
  providers: [CollabService],
})
export class CollabModule {}
