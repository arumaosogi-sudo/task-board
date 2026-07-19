import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FileKind } from '@prisma/client'
import { ShareService } from './share.service'
import { hashToken } from '../auth/token.util'
import { ASSET_PLACEHOLDER_SCHEME } from './share-content.util'
import type { ResolvedShareLink } from './guards/share-link.guard'

const linkRow = (over: Record<string, unknown> = {}) => ({
  id: 'sl1',
  fileId: 'f1',
  projectId: 'p1',
  token: 'hash',
  createdById: 'u1',
  publishedContent: null,
  publishedAt: null,
  expiresAt: null,
  revokedAt: null,
  lastAccessedAt: null,
  accessCount: 0,
  createdAt: new Date('2026-07-17T00:00:00Z'),
  createdBy: { username: 'alice' },
  ...over,
})

describe('ShareService', () => {
  let prisma: {
    file: { findFirst: jest.Mock }
    shareLink: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock }
    fileAsset: { findMany: jest.Mock; findFirst: jest.Mock }
  }
  let storage: { download: jest.Mock }
  let config: { get: jest.Mock }
  let service: ShareService

  beforeEach(() => {
    prisma = {
      file: { findFirst: jest.fn() },
      shareLink: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      fileAsset: { findMany: jest.fn(), findFirst: jest.fn() },
    }
    storage = { download: jest.fn() }
    config = { get: jest.fn().mockReturnValue('http://localhost:5173') }
    service = new ShareService(
      prisma as unknown as ConstructorParameters<typeof ShareService>[0],
      storage as unknown as ConstructorParameters<typeof ShareService>[1],
      config as unknown as ConstructorParameters<typeof ShareService>[2],
    )
  })

  describe('create', () => {
    beforeEach(() => {
      prisma.file.findFirst.mockResolvedValue({ id: 'f1', projectId: 'p1', kind: FileKind.Document, deletedAt: null })
      prisma.shareLink.create.mockResolvedValue(linkRow())
    })

    it('rejects an ambiguous request (neither TTL nor noExpiry)', async () => {
      await expect(service.create('p1', 'f1', 'u1', {})).rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.shareLink.create).not.toHaveBeenCalled()
    })

    it('stores only the SHA-256 hash and returns the raw token once', async () => {
      const res = await service.create('p1', 'f1', 'u1', { expiresInDays: 30 })
      const stored = prisma.shareLink.create.mock.calls[0][0].data.token
      // Raw token is a 256-bit base64url string; DB holds its hash, not the plaintext.
      expect(res.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(stored).toBe(hashToken(res.token))
      expect(stored).not.toBe(res.token)
      expect(res.url).toBe(`http://localhost:5173/share/${res.token}`)
    })

    it('sets a null expiry only when noExpiry is explicitly chosen', async () => {
      await service.create('p1', 'f1', 'u1', { noExpiry: true })
      expect(prisma.shareLink.create.mock.calls[0][0].data.expiresAt).toBeNull()
    })

    it('computes expiresAt from expiresInDays', async () => {
      await service.create('p1', 'f1', 'u1', { expiresInDays: 7 })
      const exp = prisma.shareLink.create.mock.calls[0][0].data.expiresAt as Date
      const days = (exp.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      expect(days).toBeGreaterThan(6.9)
      expect(days).toBeLessThan(7.1)
    })

    it('refuses a non-document target', async () => {
      prisma.file.findFirst.mockResolvedValue({ id: 'f1', projectId: 'p1', kind: FileKind.Folder, deletedAt: null })
      await expect(service.create('p1', 'f1', 'u1', { expiresInDays: 30 })).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('publish', () => {
    it('sanitizes the file content and rewrites image sources before storing', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: 'f1', projectId: 'p1', kind: FileKind.Document, deletedAt: null,
        content: `<p onclick="x()">hi</p><img src="https://sb/obj/a.png"><script>bad()</script>`,
      })
      prisma.shareLink.findFirst.mockResolvedValue(linkRow())
      prisma.fileAsset.findMany.mockResolvedValue([{ id: 'a1', url: 'https://sb/obj/a.png', path: 'obj/a.png' }])
      prisma.shareLink.update.mockResolvedValue(linkRow({ publishedAt: new Date(), publishedContent: 'x' }))

      await service.publish('p1', 'f1', 'sl1')
      const stored = prisma.shareLink.update.mock.calls[0][0].data.publishedContent as string
      expect(stored).not.toMatch(/script|onclick/i)
      expect(stored).toContain(`${ASSET_PLACEHOLDER_SCHEME}:a1`)
      expect(prisma.shareLink.update.mock.calls[0][0].data.publishedAt).toBeInstanceOf(Date)
    })
  })

  describe('revoke', () => {
    it('sets revokedAt when live', async () => {
      prisma.shareLink.findFirst.mockResolvedValue(linkRow())
      prisma.shareLink.update.mockResolvedValue(linkRow())
      await service.revoke('p1', 'f1', 'sl1')
      expect(prisma.shareLink.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sl1' }, data: { revokedAt: expect.any(Date) } }),
      )
    })

    it('is idempotent on an already-revoked link (no second write)', async () => {
      prisma.shareLink.findFirst.mockResolvedValue(linkRow({ revokedAt: new Date() }))
      await service.revoke('p1', 'f1', 'sl1')
      expect(prisma.shareLink.update).not.toHaveBeenCalled()
    })

    it('scopes the link lookup by project AND file (IDOR)', async () => {
      prisma.shareLink.findFirst.mockResolvedValue(null)
      await expect(service.revoke('p1', 'f1', 'sl1')).rejects.toBeInstanceOf(NotFoundException)
      expect(prisma.shareLink.findFirst).toHaveBeenCalledWith({
        where: { id: 'sl1', projectId: 'p1', fileId: 'f1' },
      })
    })
  })

  describe('getAsset', () => {
    const link: ResolvedShareLink = {
      id: 'sl1', fileId: 'f1', projectId: 'p1', fileName: 'Doc',
      publishedContent: '', publishedAt: new Date(),
    }

    it('scopes the asset to the link’s own fileId (blocks cross-file IDOR)', async () => {
      prisma.fileAsset.findFirst.mockResolvedValue({ path: 'obj/a.png', mimeType: 'image/png' })
      storage.download.mockResolvedValue(Buffer.from('img'))
      const res = await service.getAsset(link, 'a1')
      expect(prisma.fileAsset.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a1', fileId: 'f1' } }),
      )
      expect(res.mimeType).toBe('image/png')
    })

    it('404s when the asset belongs to another file', async () => {
      prisma.fileAsset.findFirst.mockResolvedValue(null)
      await expect(service.getAsset(link, 'aX')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('404s (never 500) when storage is unreachable', async () => {
      prisma.fileAsset.findFirst.mockResolvedValue({ path: 'obj/a.png', mimeType: 'image/png' })
      storage.download.mockResolvedValue(null)
      await expect(service.getAsset(link, 'a1')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('getPublicContent', () => {
    it('returns only fileName/contentHtml/publishedAt and counts the access', () => {
      prisma.shareLink.update.mockResolvedValue(linkRow())
      const link: ResolvedShareLink = {
        id: 'sl1', fileId: 'f1', projectId: 'p1', fileName: 'Doc',
        publishedContent: '<p>hi</p>', publishedAt: new Date('2026-07-17T00:00:00Z'),
      }
      const res = service.getPublicContent(link)
      expect(res).toEqual({ fileName: 'Doc', contentHtml: '<p>hi</p>', publishedAt: '2026-07-17T00:00:00.000Z' })
      expect(prisma.shareLink.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { accessCount: { increment: 1 }, lastAccessedAt: expect.any(Date) } }),
      )
    })
  })
})
