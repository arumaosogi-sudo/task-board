import { Role } from '@prisma/client'
import { ProjectsService } from './projects.service'

// Auto-revoke on ownership transfer (ADR 0006 §7 #3 / SRS §6): every still-live share
// link the outgoing Owner created for this project must be revoked in the SAME
// transaction as the role swap — no window where a link outlives its creator's Owner
// status.
describe('ProjectsService.transferOwnership — share-link auto-revoke', () => {
  let prisma: any
  let service: ProjectsService

  beforeEach(() => {
    prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'target', role: Role.Editor }),
        update: jest.fn((args: unknown) => args),
      },
      project: {
        update: jest.fn((args: unknown) => args),
        findUnique: jest.fn().mockResolvedValue({
          id: 'p1', name: 'P', description: '', createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
          owner: { id: 'target', username: 'bob', email: 'b@x' },
          memberships: [], pins: [],
        }),
      },
      shareLink: { updateMany: jest.fn((args: unknown) => args) },
      $transaction: jest.fn().mockResolvedValue([]),
    }
    service = new ProjectsService(prisma, {} as never, {} as never, {} as never)
  })

  it('includes a scoped shareLink.updateMany in the transfer transaction', async () => {
    await service.transferOwnership('p1', 'currentOwner', 'target')

    expect(prisma.shareLink.updateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', createdById: 'currentOwner', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })

    // The revoke op must be part of the atomic $transaction array (not a separate write).
    const txArg = prisma.$transaction.mock.calls[0][0]
    expect(Array.isArray(txArg)).toBe(true)
    expect(txArg).toContain(prisma.shareLink.updateMany.mock.results[0].value)
  })

  it('only revokes links created by the OUTGOING owner in THIS project', async () => {
    await service.transferOwnership('p1', 'currentOwner', 'target')
    const where = prisma.shareLink.updateMany.mock.calls[0][0].where
    expect(where.projectId).toBe('p1')
    expect(where.createdById).toBe('currentOwner')
    expect(where.revokedAt).toBeNull()
  })
})
