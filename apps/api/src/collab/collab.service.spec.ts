import { Role } from '@prisma/client'
import { CollabService } from './collab.service'

// P0 Security — real-time collab WebSocket auth. `authenticate` is the single
// gatekeeper Hocuspocus runs before any Yjs data flows for a connection. Throwing
// rejects the socket. It must: reject missing/invalid JWTs, reject non-members of
// the file's project, and force Viewers to read-only. Prisma + JwtService mocked
// so we exercise the decision logic directly (no DB, no live WS server).
describe('CollabService.authenticate', () => {
  let prisma: {
    file: { findFirst: jest.Mock }
    membership: { findUnique: jest.Mock }
  }
  let jwt: { verifyAsync: jest.Mock }
  let config: { get: jest.Mock }
  let service: CollabService

  // The private hook is invoked via bracket access — same as Hocuspocus calls it.
  const authenticate = (data: unknown) =>
    (service as unknown as { authenticate: (d: unknown) => Promise<unknown> }).authenticate(data)

  const payload = { sub: 'u1', username: 'alice', email: 'a@x.io' }

  const makeData = (over: Record<string, unknown> = {}) => ({
    token: 'valid.jwt',
    documentName: 'f1',
    connection: { readOnly: false },
    ...over,
  })

  const asMember = (role: Role) => {
    jwt.verifyAsync.mockResolvedValue(payload)
    prisma.file.findFirst.mockResolvedValue({ id: 'f1', projectId: 'p1' })
    prisma.membership.findUnique.mockResolvedValue({ role })
  }

  beforeEach(() => {
    prisma = { file: { findFirst: jest.fn() }, membership: { findUnique: jest.fn() } }
    jwt = { verifyAsync: jest.fn() }
    config = { get: jest.fn().mockReturnValue('test-secret') }
    service = new CollabService(prisma as never, jwt as never, config as never, {} as never)
  })

  it('rejects a connection with no token', async () => {
    await expect(authenticate(makeData({ token: undefined }))).rejects.toThrow('missing-token')
    expect(jwt.verifyAsync).not.toHaveBeenCalled()
  })

  it('rejects an invalid / expired token (verifyAsync throws)', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'))
    await expect(authenticate(makeData())).rejects.toThrow('invalid-token')
    expect(prisma.file.findFirst).not.toHaveBeenCalled()
  })

  it('rejects a token whose payload has no subject', async () => {
    jwt.verifyAsync.mockResolvedValue({ username: 'x' })
    await expect(authenticate(makeData())).rejects.toThrow('invalid-token')
  })

  it('rejects when the target document does not exist / is soft-deleted', async () => {
    jwt.verifyAsync.mockResolvedValue(payload)
    prisma.file.findFirst.mockResolvedValue(null)
    await expect(authenticate(makeData())).rejects.toThrow('file-not-found')
  })

  it('rejects a valid user who is not a member of the file’s project (forbidden)', async () => {
    jwt.verifyAsync.mockResolvedValue(payload)
    prisma.file.findFirst.mockResolvedValue({ id: 'f1', projectId: 'p1' })
    prisma.membership.findUnique.mockResolvedValue(null)

    await expect(authenticate(makeData())).rejects.toThrow('forbidden')
  })

  it('forces a Viewer connection to read-only', async () => {
    asMember(Role.Viewer)
    const data = makeData()
    const ctx = (await authenticate(data)) as { role: Role; projectId: string }

    expect(data.connection.readOnly).toBe(true)
    expect(ctx).toMatchObject({ userId: 'u1', projectId: 'p1', fileId: 'f1', role: Role.Viewer })
  })

  it('lets an Editor connect writable (read-only stays false)', async () => {
    asMember(Role.Editor)
    const data = makeData()
    await authenticate(data)

    expect(data.connection.readOnly).toBe(false)
  })

  it('lets an Owner connect writable', async () => {
    asMember(Role.Owner)
    const data = makeData()
    await authenticate(data)

    expect(data.connection.readOnly).toBe(false)
  })

  it('authorizes membership against the file’s project, not a client-supplied one', async () => {
    asMember(Role.Editor)
    await authenticate(makeData())

    expect(prisma.membership.findUnique).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 'p1', userId: 'u1' } },
      select: { role: true },
    })
  })
})
