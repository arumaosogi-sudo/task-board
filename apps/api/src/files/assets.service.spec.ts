import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FileKind } from '@prisma/client'
import { AssetsService, MAX_IMAGE_BYTES, sniffImageMime } from './assets.service'

// Minimal magic-byte fixtures (padded to 12 bytes so sniffImageMime accepts them).
const pad = (bytes: number[]) => Buffer.from([...bytes, ...new Array(Math.max(0, 12 - bytes.length)).fill(0)])
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0])
const GIF = pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

const file = (over: Partial<{ buffer: Buffer; mimetype: string; size: number }> = {}) => ({
  buffer: PNG,
  mimetype: 'image/png',
  size: 1024,
  originalname: 'x.png',
  ...over,
})

describe('sniffImageMime', () => {
  it('detects each supported raster format from magic bytes', () => {
    expect(sniffImageMime(PNG)).toBe('image/png')
    expect(sniffImageMime(JPEG)).toBe('image/jpeg')
    expect(sniffImageMime(GIF)).toBe('image/gif')
    expect(sniffImageMime(WEBP)).toBe('image/webp')
  })
  it('returns null for non-image / truncated buffers', () => {
    expect(sniffImageMime(Buffer.from('not an image!'))).toBeNull()
    expect(sniffImageMime(Buffer.from([0x00, 0x01]))).toBeNull()
  })
})

describe('AssetsService.upload', () => {
  let prisma: { file: { findFirst: jest.Mock }; fileAsset: { create: jest.Mock } }
  let storage: { upload: jest.Mock }
  let service: AssetsService

  const doc = { id: 'f1', projectId: 'p1', kind: FileKind.Document, deletedAt: null }

  beforeEach(() => {
    prisma = { file: { findFirst: jest.fn().mockResolvedValue(doc) }, fileAsset: { create: jest.fn().mockResolvedValue({}) } }
    storage = { upload: jest.fn().mockResolvedValue({ url: 'https://signed/url.png' }) }
    service = new AssetsService(prisma as never, storage as never)
  })

  it('uploads a valid image, scopes the file lookup by project, and persists the row', async () => {
    const res = await service.upload('p1', 'f1', 'u1', file())

    expect(res).toEqual({ url: 'https://signed/url.png' })
    expect(prisma.file.findFirst).toHaveBeenCalledWith({ where: { id: 'f1', projectId: 'p1', deletedAt: null } })
    expect(storage.upload).toHaveBeenCalledWith(expect.stringMatching(/^p1\/f1\/.+\.png$/), PNG, 'image/png')
    expect(prisma.fileAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fileId: 'f1', projectId: 'p1', createdBy: 'u1', mimeType: 'image/png', sizeBytes: 1024 }),
    })
  })

  it('rejects a missing file', async () => {
    await expect(service.upload('p1', 'f1', 'u1', undefined)).rejects.toThrow(BadRequestException)
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('rejects an oversized file before touching storage', async () => {
    await expect(service.upload('p1', 'f1', 'u1', file({ size: MAX_IMAGE_BYTES + 1 }))).rejects.toThrow(/3MB|too-large/i)
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('rejects a spoofed content-type whose magic bytes disagree (png bytes labelled as gif)', async () => {
    await expect(service.upload('p1', 'f1', 'u1', file({ mimetype: 'image/gif' }))).rejects.toThrow(BadRequestException)
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('rejects an unsupported type (svg)', async () => {
    await expect(
      service.upload('p1', 'f1', 'u1', file({ buffer: Buffer.from('<svg></svg>'), mimetype: 'image/svg+xml' })),
    ).rejects.toThrow(BadRequestException)
  })

  it('404s when the file is not in the project (IDOR scope)', async () => {
    prisma.file.findFirst.mockResolvedValue(null)
    await expect(service.upload('p1', 'f1', 'u1', file())).rejects.toThrow(NotFoundException)
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('rejects uploading to a folder', async () => {
    prisma.file.findFirst.mockResolvedValue({ ...doc, kind: FileKind.Folder })
    await expect(service.upload('p1', 'f1', 'u1', file())).rejects.toThrow(BadRequestException)
  })
})
