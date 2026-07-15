import { NotFoundException } from '@nestjs/common'
import { FileKind } from '@prisma/client'
import { FilesService } from './files.service'

// P0 Security — IDOR guard. Every single-file operation funnels through the
// private `requireFile(projectId, fileId)`, which MUST scope the lookup by both
// the fileId AND the projectId derived from the caller's membership. If it ever
// queried by fileId alone, a member of project A could read/mutate a file in
// project B. These tests assert the scoping filter and the not-found behaviour
// through every public entry point that calls requireFile.
describe('FilesService — IDOR scoping (requireFile)', () => {
  let prisma: {
    file: {
      findFirst: jest.Mock
      update: jest.Mock
      updateMany: jest.Mock
      findMany: jest.Mock
      create: jest.Mock
    }
  }
  let service: FilesService

  const fakeFile = (over: Record<string, unknown> = {}) => ({
    id: 'f1',
    projectId: 'p1',
    name: 'Doc',
    kind: FileKind.Document,
    orientation: 'portrait',
    parentId: null,
    content: 'body',
    order: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    deletedAt: null,
    ...over,
  })

  beforeEach(() => {
    prisma = {
      file: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
    }
    service = new FilesService(prisma as never)
  })

  it('scopes get() to id + projectId + not-deleted (the core IDOR filter)', async () => {
    prisma.file.findFirst.mockResolvedValue(fakeFile())
    await service.get('p1', 'f1')

    expect(prisma.file.findFirst).toHaveBeenCalledWith({
      where: { id: 'f1', projectId: 'p1', deletedAt: null },
    })
  })

  it('throws 404 file-not-found when the file belongs to another project (cross-project access)', async () => {
    // Real Prisma returns null because the (id, projectId) pair matches no row.
    prisma.file.findFirst.mockResolvedValue(null)

    const promise = service.get('attacker-project', 'victim-file')
    await expect(promise).rejects.toBeInstanceOf(NotFoundException)
    await expect(promise).rejects.toMatchObject({ response: { code: 'file-not-found' } })
    // Passed the attacker's own projectId into the filter — never the victim's.
    expect(prisma.file.findFirst).toHaveBeenCalledWith({
      where: { id: 'victim-file', projectId: 'attacker-project', deletedAt: null },
    })
  })

  it('update() refuses a cross-project file before issuing any write', async () => {
    prisma.file.findFirst.mockResolvedValue(null)

    await expect(service.update('p2', 'f1', { name: 'hacked' })).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.file.update).not.toHaveBeenCalled()
  })

  it('saveContent() refuses a cross-project file before issuing any write', async () => {
    prisma.file.findFirst.mockResolvedValue(null)

    await expect(service.saveContent('p2', 'f1', 'x')).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.file.update).not.toHaveBeenCalled()
  })

  it('remove() refuses a cross-project file before any soft-delete', async () => {
    prisma.file.findFirst.mockResolvedValue(null)

    await expect(service.remove('p2', 'f1')).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.file.updateMany).not.toHaveBeenCalled()
  })

  it('returns the document only after the scoped lookup succeeds', async () => {
    prisma.file.findFirst.mockResolvedValue(fakeFile())
    const doc = await service.get('p1', 'f1')

    expect(doc).toMatchObject({ id: 'f1', projectId: 'p1', content: 'body' })
  })
})

// Templates (Sprint 4) — create() seeds File.content from the chosen template.
// A Document with no template stays blank (''), and content never leaks onto a Folder.
describe('FilesService — create() content seeding', () => {
  let prisma: { file: { create: jest.Mock } }
  let service: FilesService

  const created = (over: Record<string, unknown> = {}) => ({
    id: 'f1', projectId: 'p1', name: 'Doc', kind: FileKind.Document,
    orientation: 'portrait', parentId: null, content: '', order: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null, ...over,
  })

  beforeEach(() => {
    prisma = { file: { create: jest.fn() } }
    service = new FilesService(prisma as never)
  })

  it('seeds a Document with the provided template content', async () => {
    prisma.file.create.mockResolvedValue(created({ content: '<h1>Report</h1>' }))
    await service.create('p1', { name: 'R', kind: 'Document', content: '<h1>Report</h1>' } as never)
    expect(prisma.file.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: 'p1', content: '<h1>Report</h1>' }) }),
    )
  })

  it('defaults a blank Document (no content) to an empty string', async () => {
    prisma.file.create.mockResolvedValue(created({ content: '' }))
    await service.create('p1', { name: 'R', kind: 'Document' } as never)
    expect(prisma.file.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ content: '' }) }),
    )
  })

  it('keeps content null on a Folder even if content is passed', async () => {
    prisma.file.create.mockResolvedValue(created({ kind: FileKind.Folder, orientation: null, content: null }))
    await service.create('p1', { name: 'F', kind: 'Folder', content: 'ignored' } as never)
    expect(prisma.file.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ content: null }) }),
    )
  })
})
