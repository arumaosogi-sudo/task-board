import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { FileKind, Role } from '@prisma/client'
import { CommentsService } from './comments.service'

// The Comments service is the last line of defence for authorization and tenant
// isolation. These unit tests pin the three rules that a mis-wired controller,
// guard, or client could otherwise bypass:
//   1. IDOR — a comment is only ever reachable through file→project scoping.
//   2. resolve/reopen is Owner/Editor only (a Viewer is rejected in the service).
//   3. replies are capped at a single level.
describe('CommentsService', () => {
  let prisma: {
    file: { findFirst: jest.Mock }
    comment: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock }
    membership: { findMany: jest.Mock }
    project: { findUnique: jest.Mock }
  }
  let notifications: { notify: jest.Mock }
  let service: CommentsService

  const doc = (over: Record<string, unknown> = {}) => ({
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

  const comment = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    fileId: 'f1',
    authorId: 'u1',
    parentId: null,
    body: 'hi',
    anchorFrom: null,
    anchorTo: null,
    anchorText: null,
    sourceRevisionId: null,
    resolvedAt: null,
    resolvedById: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    author: { username: 'alice' },
    resolvedBy: null,
    ...over,
  })

  beforeEach(() => {
    prisma = {
      file: { findFirst: jest.fn() },
      comment: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      membership: { findMany: jest.fn() },
      project: { findUnique: jest.fn() },
    }
    notifications = { notify: jest.fn().mockResolvedValue(undefined) }
    service = new CommentsService(prisma as never, notifications as never)
  })

  /* ------------------------------ IDOR scoping ----------------------------- */

  describe('IDOR scoping', () => {
    it('list() scopes the file lookup by id + projectId + not-deleted', async () => {
      prisma.file.findFirst.mockResolvedValue(doc())
      prisma.comment.findMany.mockResolvedValue([])
      await service.list('p1', 'f1')
      expect(prisma.file.findFirst).toHaveBeenCalledWith({
        where: { id: 'f1', projectId: 'p1', deletedAt: null },
      })
    })

    it('rejects a file that belongs to another project before touching comments', async () => {
      // Attacker (member of their own project) passes a victim file id — the
      // (fileId, attackerProjectId) pair matches no row, so Prisma returns null.
      prisma.file.findFirst.mockResolvedValue(null)

      await expect(service.list('attacker-project', 'victim-file')).rejects.toBeInstanceOf(NotFoundException)
      expect(prisma.comment.findMany).not.toHaveBeenCalled()
      expect(prisma.file.findFirst).toHaveBeenCalledWith({
        where: { id: 'victim-file', projectId: 'attacker-project', deletedAt: null },
      })
    })

    it('scopes the comment lookup by the project-scoped fileId (cross-project comment → 404)', async () => {
      prisma.file.findFirst.mockResolvedValue(doc())
      // A comment id from another project does not belong to this file → null.
      prisma.comment.findFirst.mockResolvedValue(null)

      await expect(
        service.update('p1', 'f1', 'foreign-comment', 'u1', { body: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(prisma.comment.findFirst).toHaveBeenCalledWith({
        where: { id: 'foreign-comment', fileId: 'f1' },
      })
      expect(prisma.comment.update).not.toHaveBeenCalled()
    })

    it('resolve() refuses a cross-project comment before any write', async () => {
      prisma.file.findFirst.mockResolvedValue(doc())
      prisma.comment.findFirst.mockResolvedValue(null)

      await expect(
        service.resolve('p1', 'f1', 'foreign-comment', 'u1', Role.Owner),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(prisma.comment.update).not.toHaveBeenCalled()
    })
  })

  /* ---------------------------- resolve authz ------------------------------ */

  describe('resolve/reopen authorization', () => {
    it('rejects a Viewer trying to resolve (Owner/Editor only) before any lookup or write', async () => {
      await expect(
        service.resolve('p1', 'f1', 'c1', 'viewer', Role.Viewer),
      ).rejects.toBeInstanceOf(ForbiddenException)
      // Fails fast on the role check — never reaches the DB.
      expect(prisma.file.findFirst).not.toHaveBeenCalled()
      expect(prisma.comment.update).not.toHaveBeenCalled()
    })

    it('rejects a Viewer trying to reopen as well', async () => {
      await expect(
        service.reopen('p1', 'f1', 'c1', 'viewer', Role.Viewer),
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(prisma.comment.update).not.toHaveBeenCalled()
    })

    it('lets an Editor resolve a root thread (sets resolvedAt + resolvedById)', async () => {
      prisma.file.findFirst.mockResolvedValue(doc())
      prisma.comment.findFirst.mockResolvedValue(comment())
      prisma.comment.update.mockResolvedValue(comment({ resolvedAt: new Date('2026-02-01T00:00:00Z'), resolvedById: 'ed', resolvedBy: { username: 'ed' } }))

      const res = await service.resolve('p1', 'f1', 'c1', 'ed', Role.Editor)
      expect(res.resolved).toBe(true)
      expect(res.resolvedById).toBe('ed')
      expect(prisma.comment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          data: expect.objectContaining({ resolvedById: 'ed' }),
        }),
      )
    })

    it('refuses to resolve a reply (state lives on the thread root only)', async () => {
      prisma.file.findFirst.mockResolvedValue(doc())
      prisma.comment.findFirst.mockResolvedValue(comment({ id: 'r1', parentId: 'c1' }))

      await expect(
        service.resolve('p1', 'f1', 'r1', 'ed', Role.Editor),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.comment.update).not.toHaveBeenCalled()
    })
  })

  /* ----------------------------- reply depth ------------------------------- */

  describe('reply depth (max 1 level)', () => {
    it('allows a reply to a root comment', async () => {
      prisma.file.findFirst.mockResolvedValue(doc())
      prisma.comment.findFirst.mockResolvedValue(comment({ id: 'c1', parentId: null, authorId: 'u1' }))
      prisma.comment.create.mockResolvedValue(comment({ id: 'r1', parentId: 'c1', authorId: 'u2', author: { username: 'bob' } }))
      prisma.membership.findMany.mockResolvedValue([])
      prisma.project.findUnique.mockResolvedValue({ name: 'P' })

      const res = await service.create('p1', 'f1', 'u2', { body: 'reply', parentId: 'c1' })
      expect(res.parentId).toBe('c1')
      expect(prisma.comment.create).toHaveBeenCalled()
    })

    it('rejects a reply to a reply (depth > 1) before any write', async () => {
      prisma.file.findFirst.mockResolvedValue(doc())
      // The parent is itself a reply (has a parentId) → depth would exceed 1.
      prisma.comment.findFirst.mockResolvedValue(comment({ id: 'r1', parentId: 'c1' }))

      await expect(
        service.create('p1', 'f1', 'u3', { body: 'nested', parentId: 'r1' }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.comment.create).not.toHaveBeenCalled()
    })
  })

  /* --------------------------- notification fan-out ------------------------ */

  describe('create() notifications', () => {
    it('notifies project members (except the author) of a new root comment', async () => {
      prisma.file.findFirst.mockResolvedValue(doc())
      prisma.comment.create.mockResolvedValue(comment({ authorId: 'u1', author: { username: 'alice' } }))
      prisma.membership.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }])
      prisma.project.findUnique.mockResolvedValue({ name: 'P' })

      await service.create('p1', 'f1', 'u1', { body: 'hello' })
      // Fan-out runs as a detached side effect — flush the microtask queue.
      await new Promise((r) => setImmediate(r))

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.arrayContaining(['u2', 'u3']),
        'Comment',
        expect.objectContaining({ projectId: 'p1', fileId: 'f1' }),
      )
      const commentCall = notifications.notify.mock.calls.find((c) => c[1] === 'Comment')
      expect(commentCall?.[0]).not.toContain('u1')
    })

    it('sends CommentReply to the root author and excludes them from the plain fan-out', async () => {
      prisma.file.findFirst.mockResolvedValue(doc())
      prisma.comment.findFirst.mockResolvedValue(comment({ id: 'c1', parentId: null, authorId: 'u1' }))
      prisma.comment.create.mockResolvedValue(comment({ id: 'r1', parentId: 'c1', authorId: 'u2', author: { username: 'bob' } }))
      prisma.membership.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }])
      prisma.project.findUnique.mockResolvedValue({ name: 'P' })

      await service.create('p1', 'f1', 'u2', { body: 'reply', parentId: 'c1' })
      await new Promise((r) => setImmediate(r))

      const replyCall = notifications.notify.mock.calls.find((c) => c[1] === 'CommentReply')
      const commentCall = notifications.notify.mock.calls.find((c) => c[1] === 'Comment')
      expect(replyCall?.[0]).toEqual(['u1']) // root author gets the specific one
      // Plain fan-out excludes both the actor (u2) and the root author (u1).
      expect(commentCall?.[0]).toEqual(['u3'])
    })
  })

  /* ----------------------------- delete authz ------------------------------ */

  describe('remove() authorization', () => {
    it('lets the author delete their own comment', async () => {
      prisma.file.findFirst.mockResolvedValue(doc())
      prisma.comment.findFirst.mockResolvedValue(comment({ authorId: 'u1' }))
      prisma.comment.delete.mockResolvedValue(comment())

      await expect(service.remove('p1', 'f1', 'c1', 'u1', Role.Editor)).resolves.toEqual({ message: 'comment-deleted' })
      expect(prisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'c1' } })
    })

    it('lets a project Owner delete another user’s comment', async () => {
      prisma.file.findFirst.mockResolvedValue(doc())
      prisma.comment.findFirst.mockResolvedValue(comment({ authorId: 'someone-else' }))
      prisma.comment.delete.mockResolvedValue(comment())

      await expect(service.remove('p1', 'f1', 'c1', 'owner', Role.Owner)).resolves.toEqual({ message: 'comment-deleted' })
    })

    it('forbids a non-owner Editor from deleting another user’s comment', async () => {
      prisma.file.findFirst.mockResolvedValue(doc())
      prisma.comment.findFirst.mockResolvedValue(comment({ authorId: 'someone-else' }))

      await expect(service.remove('p1', 'f1', 'c1', 'editor', Role.Editor)).rejects.toBeInstanceOf(ForbiddenException)
      expect(prisma.comment.delete).not.toHaveBeenCalled()
    })
  })
})
