import { Logger, ServiceUnavailableException } from '@nestjs/common'
import { AppController } from './app.controller'

// P2 Hardening — readiness probe semantics. `/health/ready` must reflect real DB
// reachability: 200 when a trivial round-trip succeeds, 503 when it fails, so an
// orchestrator stops routing to a broken instance. `/health` (liveness) must NOT
// touch the DB. Prisma's $queryRaw is mocked to simulate both states.
describe('AppController — health probes', () => {
  let prisma: { $queryRaw: jest.Mock }
  let controller: AppController

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() }
    controller = new AppController(prisma as never)
    // Silence the intentional error log on the DB-down path.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  describe('/health (liveness)', () => {
    it('reports ok without touching the database', () => {
      const res = controller.health()
      expect(res).toMatchObject({ status: 'ok', service: 'task-board-api' })
      expect(prisma.$queryRaw).not.toHaveBeenCalled()
    })
  })

  describe('/health/ready (readiness)', () => {
    it('returns 200-style payload with database "up" when the DB round-trips', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
      const res = await controller.ready()

      expect(res).toMatchObject({ status: 'ok', checks: { database: 'up' } })
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
    })

    it('throws 503 ServiceUnavailable with database "down" when the DB is unreachable', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException)
    })

    it('exposes database "down" in the 503 response body', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'))

      try {
        await controller.ready()
        fail('expected ready() to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceUnavailableException)
        expect((err as ServiceUnavailableException).getResponse()).toMatchObject({
          status: 'error',
          checks: { database: 'down' },
        })
      }
    })
  })
})
