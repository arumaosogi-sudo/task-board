import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  async onModuleInit() {
    try {
      await this.$connect()
      this.logger.log('Connected to PostgreSQL')
    } catch (err) {
      // Don't crash the whole app at boot if the DB isn't up yet — log clearly.
      this.logger.error(
        'Failed to connect to PostgreSQL. Is the database running? ' +
          '(docker compose up -d db)',
        err instanceof Error ? err.stack : String(err),
      )
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
