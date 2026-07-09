import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from './prisma/prisma.service'

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness — is the process up and responding? Deliberately does NOT touch the
   * DB, so a transient DB blip doesn't cause the orchestrator to kill a healthy
   * process. Use /health/ready for dependency (DB) checks.
   */
  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'task-board-api',
      version: '0.1.0',
    }
  }

  /**
   * Readiness — can the app actually serve traffic? Verifies the DB connection
   * with a trivial round-trip. Returns 503 when the DB is unreachable so a load
   * balancer / orchestrator stops routing to this instance until it recovers.
   */
  @Get('health/ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'task-board-api',
        checks: { database: 'up' },
      }
    } catch (err) {
      this.logger.error(
        'Readiness check failed: database unreachable',
        err instanceof Error ? err.stack : String(err),
      )
      throw new ServiceUnavailableException({
        status: 'error',
        timestamp: new Date().toISOString(),
        service: 'task-board-api',
        checks: { database: 'down' },
      })
    }
  }
}
