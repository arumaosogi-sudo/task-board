import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { CollabService } from './collab.service'

/**
 * Phase 4.1 — wires the Hocuspocus collaboration server into the app.
 * PrismaModule and ConfigModule are @Global, so only JwtModule (for verifying
 * access tokens on WS connect) needs to be imported here.
 */
@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [CollabService],
})
export class CollabModule {}
