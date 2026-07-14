import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AppController } from './app.controller'
import { PrismaModule } from './prisma/prisma.module'
import { UsersModule } from './users/users.module'
import { MailModule } from './mail/mail.module'
import { AuthModule } from './auth/auth.module'
import { ProjectsModule } from './projects/projects.module'
import { FilesModule } from './files/files.module'
import { CommentsModule } from './comments/comments.module'
import { CollabModule } from './collab/collab.module'
import { NotificationsModule } from './notifications/notifications.module'
import { SearchModule } from './search/search.module'
import { UpdatesModule } from './updates/updates.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // App-wide DoS guard: 100 req/min/IP. Sensitive auth routes set much stricter
    // per-route limits via @Throttle (login/register 5/min, resend-verify 1/min).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    UsersModule,
    MailModule,
    AuthModule,
    ProjectsModule,
    FilesModule,
    CommentsModule,
    CollabModule,
    NotificationsModule,
    SearchModule,
    UpdatesModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
