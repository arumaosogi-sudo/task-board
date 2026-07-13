// P0 Security — IDOR guard, INTEGRATION edition (real PostgreSQL).
//
// The unit twin (files.service.spec.ts) mocks Prisma and asserts the exact
// `where` object passed to `findFirst`. That proves the *intent* but not that the
// query still matches the real schema — a renamed column, a changed relation, or
// a drifted `deletedAt` semantics would keep the mock green while breaking prod.
//
// This spec seeds two real users / two real projects / real files, then drives
// FilesService against a live database. `requireFile` is private, so we exercise
// it through the public `get` / `update` / `saveContent` / `remove` entry points,
// exactly as HTTP callers do. If the scoped lookup ever regresses to fileId-only,
// the cross-project cases below start returning data instead of 404.
import { NotFoundException } from '@nestjs/common'
import { FileKind } from '@prisma/client'
import { FilesService } from './files.service'
import type { PrismaService } from '../prisma/prisma.service'
import { prisma, truncateAll } from '../testing/int/prisma-test-client'

describe('FilesService — IDOR scoping against a real database', () => {
  // FilesService only needs the PrismaService surface; the concrete PrismaClient
  // is structurally compatible for the methods it calls.
  const service = new FilesService(prisma as unknown as PrismaService)

  let projectA: string
  let fileInA: string
  let fileInB: string
  let deletedFileInA: string

  beforeAll(async () => {
    // Fail loudly if the migrated schema is missing (e.g. globalSetup skipped).
    await prisma.$queryRawUnsafe('SELECT 1')
  })

  beforeEach(async () => {
    await truncateAll()

    const alice = await prisma.user.create({ data: { username: 'alice', email: 'alice@example.com' } })
    const bob = await prisma.user.create({ data: { username: 'bob', email: 'bob@example.com' } })

    const pa = await prisma.project.create({ data: { name: 'Alice Project', ownerId: alice.id } })
    const pb = await prisma.project.create({ data: { name: 'Bob Project', ownerId: bob.id } })
    projectA = pa.id

    await prisma.membership.create({ data: { projectId: pa.id, userId: alice.id, role: 'Owner' } })
    await prisma.membership.create({ data: { projectId: pb.id, userId: bob.id, role: 'Owner' } })

    const fa = await prisma.file.create({
      data: { projectId: pa.id, name: 'Alice Doc', kind: FileKind.Document, content: 'alice-secret' },
    })
    const fb = await prisma.file.create({
      data: { projectId: pb.id, name: 'Bob Doc', kind: FileKind.Document, content: 'bob-secret' },
    })
    const fad = await prisma.file.create({
      data: { projectId: pa.id, name: 'Alice Trashed', kind: FileKind.Document, content: 'gone', deletedAt: new Date() },
    })
    fileInA = fa.id
    fileInB = fb.id
    deletedFileInA = fad.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('returns a file when project + id match (baseline in-project access)', async () => {
    const doc = await service.get(projectA, fileInA)
    expect(doc).toMatchObject({ id: fileInA, projectId: projectA, content: 'alice-secret' })
  })

  it('THE IDOR CASE: reading a file from another project is a 404, not a leak', async () => {
    // Alice (projectA) asks for Bob's file (projectB). Real Prisma returns null
    // because no row matches (id=fileInB, projectId=projectA).
    const promise = service.get(projectA, fileInB)
    await expect(promise).rejects.toBeInstanceOf(NotFoundException)
    await expect(promise).rejects.toMatchObject({ response: { code: 'file-not-found' } })
  })

  it('does NOT return soft-deleted files (deletedAt filter holds at the DB level)', async () => {
    await expect(service.get(projectA, deletedFileInA)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('update() across projects is refused and writes nothing', async () => {
    await expect(service.update(projectA, fileInB, { name: 'hacked' })).rejects.toBeInstanceOf(NotFoundException)
    // Bob's file is untouched.
    const untouched = await prisma.file.findUnique({ where: { id: fileInB } })
    expect(untouched?.name).toBe('Bob Doc')
  })

  it('saveContent() across projects is refused and writes nothing', async () => {
    await expect(service.saveContent(projectA, fileInB, 'pwned')).rejects.toBeInstanceOf(NotFoundException)
    const untouched = await prisma.file.findUnique({ where: { id: fileInB } })
    expect(untouched?.content).toBe('bob-secret')
  })

  it('remove() across projects is refused and soft-deletes nothing', async () => {
    await expect(service.remove(projectA, fileInB)).rejects.toBeInstanceOf(NotFoundException)
    const untouched = await prisma.file.findUnique({ where: { id: fileInB } })
    expect(untouched?.deletedAt).toBeNull()
  })
})
