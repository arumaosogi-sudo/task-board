import { NotFoundException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { ShareLinkGuard } from './share-link.guard'
import { hashToken } from '../../auth/token.util'

const ctxFor = (token: string, req: any = {}) =>
  ({
    switchToHttp: () => ({ getRequest: () => Object.assign(req, { params: { token } }) }),
  }) as unknown as ExecutionContext

const validLink = (over: Record<string, unknown> = {}) => ({
  id: 'sl1',
  fileId: 'f1',
  projectId: 'p1',
  revokedAt: null,
  expiresAt: null,
  publishedContent: '<p>hi</p>',
  publishedAt: new Date('2026-07-17T00:00:00Z'),
  file: { id: 'f1', name: 'Doc', deletedAt: null },
  project: { deletedAt: null },
  ...over,
})

describe('ShareLinkGuard', () => {
  let prisma: any
  let guard: ShareLinkGuard

  beforeEach(() => {
    prisma = { shareLink: { findUnique: jest.fn() } }
    guard = new ShareLinkGuard(prisma)
  })

  it('looks the token up by its SHA-256 hash, never the plaintext', async () => {
    prisma.shareLink.findUnique.mockResolvedValue(validLink())
    await guard.canActivate(ctxFor('rawtoken'))
    expect(prisma.shareLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: hashToken('rawtoken') } }),
    )
  })

  it('attaches a minimal shareLink on success (no members/owner/comments)', async () => {
    prisma.shareLink.findUnique.mockResolvedValue(validLink())
    const req: any = {}
    await guard.canActivate(ctxFor('rawtoken', req))
    expect(req.shareLink).toEqual({
      id: 'sl1', fileId: 'f1', projectId: 'p1', fileName: 'Doc',
      publishedContent: '<p>hi</p>', publishedAt: new Date('2026-07-17T00:00:00Z'),
    })
  })

  // Every failure mode must be an IDENTICAL generic 404 (no enumeration leak).
  it.each([
    ['missing token record', null],
    ['revoked', validLink({ revokedAt: new Date() })],
    ['expired', validLink({ expiresAt: new Date('2000-01-01') })],
    ['never published', validLink({ publishedContent: null, publishedAt: null })],
    ['file trashed', validLink({ file: { id: 'f1', name: 'Doc', deletedAt: new Date() } })],
    ['project trashed', validLink({ project: { deletedAt: new Date() } })],
  ])('rejects with a generic 404: %s', async (_label, row) => {
    prisma.shareLink.findUnique.mockResolvedValue(row)
    await expect(guard.canActivate(ctxFor('rawtoken'))).rejects.toBeInstanceOf(NotFoundException)
    await expect(guard.canActivate(ctxFor('rawtoken'))).rejects.toMatchObject({
      response: { code: 'share-not-found' },
    })
  })

  it('rejects when no token is present in the path', async () => {
    await expect(guard.canActivate(ctxFor(''))).rejects.toBeInstanceOf(NotFoundException)
  })
})
