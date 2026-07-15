import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Role } from '@prisma/client'
import { ProjectRoleGuard } from './project-role.guard'

// P0 Security — the server-side authorization gate (system rule #1: never trust
// the client). These tests pin the two properties every project endpoint relies on:
//   1. Non-members get 404 (not 403) so project existence is never leaked.
//   2. @MinRole is enforced by the Owner > Editor > Viewer hierarchy.
// Prisma is mocked — we test the *decision logic*, no DB needed.
describe('ProjectRoleGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock }
  let prisma: { membership: { findUnique: jest.Mock } }
  let guard: ProjectRoleGuard

  const makeContext = (req: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    }) as unknown as ExecutionContext

  const authedReq = (role?: Role) => {
    const req: Record<string, unknown> = { user: { id: 'u1' }, params: { id: 'p1' } }
    if (role) prisma.membership.findUnique.mockResolvedValue({ id: 'm1', projectId: 'p1', userId: 'u1', role })
    return req
  }

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() }
    prisma = { membership: { findUnique: jest.fn() } }
    guard = new ProjectRoleGuard(reflector as unknown as Reflector, prisma as never)
  })

  it('allows an Owner through an Editor-gated route and attaches req.membership', async () => {
    reflector.getAllAndOverride.mockReturnValue(Role.Editor)
    const req = authedReq(Role.Owner)

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true)
    expect((req as { membership?: { role: Role } }).membership?.role).toBe(Role.Owner)
  })

  it('allows an exact role match (Editor meets @MinRole Editor)', async () => {
    reflector.getAllAndOverride.mockReturnValue(Role.Editor)
    await expect(guard.canActivate(makeContext(authedReq(Role.Editor)))).resolves.toBe(true)
  })

  it('rejects a role below @MinRole with 403 insufficient-role (does NOT 404)', async () => {
    reflector.getAllAndOverride.mockReturnValue(Role.Editor)
    const promise = guard.canActivate(makeContext(authedReq(Role.Viewer)))

    await expect(promise).rejects.toBeInstanceOf(ForbiddenException)
    await expect(promise).rejects.toMatchObject({ response: { code: 'insufficient-role' } })
  })

  it('treats a non-member as 404 project-not-found (never leaks existence via 403)', async () => {
    reflector.getAllAndOverride.mockReturnValue(Role.Viewer)
    prisma.membership.findUnique.mockResolvedValue(null)

    const promise = guard.canActivate(makeContext({ user: { id: 'u1' }, params: { id: 'p1' } }))
    await expect(promise).rejects.toBeInstanceOf(NotFoundException)
    await expect(promise).rejects.toMatchObject({ response: { code: 'project-not-found' } })
  })

  it('defaults to Viewer when no @MinRole is set, so a Viewer passes', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined)
    await expect(guard.canActivate(makeContext(authedReq(Role.Viewer)))).resolves.toBe(true)
  })

  it('scopes the membership lookup to the exact (projectId, userId) composite key', async () => {
    reflector.getAllAndOverride.mockReturnValue(Role.Viewer)
    await guard.canActivate(makeContext(authedReq(Role.Viewer)))

    expect(prisma.membership.findUnique).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 'p1', userId: 'u1' } },
    })
  })

  it('404s without hitting the DB when the request has no authenticated user', async () => {
    reflector.getAllAndOverride.mockReturnValue(Role.Viewer)
    await expect(
      guard.canActivate(makeContext({ params: { id: 'p1' } })),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.membership.findUnique).not.toHaveBeenCalled()
  })

  it('404s without hitting the DB when the route has no :id param', async () => {
    reflector.getAllAndOverride.mockReturnValue(Role.Viewer)
    await expect(
      guard.canActivate(makeContext({ user: { id: 'u1' }, params: {} })),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.membership.findUnique).not.toHaveBeenCalled()
  })
})
