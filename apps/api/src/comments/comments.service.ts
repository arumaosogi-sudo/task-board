import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Comment, File, FileKind, Prisma, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto'

/** A comment row joined with the author/resolver display names. */
type CommentWithNames = Comment & {
  author: { username: string }
  resolvedBy: { username: string } | null
}

/** API shape returned to the client. Roots additionally carry their `replies`. */
export interface CommentDto {
  id: string
  fileId: string
  authorId: string
  authorName: string
  parentId: string | null
  body: string
  anchorFrom: unknown | null
  anchorTo: unknown | null
  anchorText: string | null
  sourceRevisionId: string | null
  resolved: boolean
  resolvedAt: string | null
  resolvedById: string | null
  resolvedByName: string | null
  createdAt: string
  updatedAt: string
  replies?: CommentDto[]
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /* --------------------------------- reads -------------------------------- */

  /** All comments for a file as threads (roots ordered oldest→newest, replies nested). */
  async list(projectId: string, fileId: string): Promise<CommentDto[]> {
    await this.requireDocument(projectId, fileId)
    const rows = await this.prisma.comment.findMany({
      where: { fileId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { username: true } }, resolvedBy: { select: { username: true } } },
    })

    const roots: CommentDto[] = []
    const repliesByParent = new Map<string, CommentDto[]>()
    for (const row of rows) {
      const dto = this.toDto(row)
      if (row.parentId) {
        const arr = repliesByParent.get(row.parentId) ?? []
        arr.push(dto)
        repliesByParent.set(row.parentId, arr)
      } else {
        dto.replies = []
        roots.push(dto)
      }
    }
    for (const root of roots) root.replies = repliesByParent.get(root.id) ?? []
    return roots
  }

  /* ------------------------------- mutations ------------------------------ */

  /** Create a root comment, or a reply when `parentId` is supplied (depth capped at 1). */
  async create(
    projectId: string,
    fileId: string,
    authorId: string,
    dto: CreateCommentDto,
  ): Promise<CommentDto> {
    const file = await this.requireDocument(projectId, fileId)
    const body = dto.body.trim()
    if (!body) throw new BadRequestException({ code: 'empty-comment', message: 'กรุณาพิมพ์ข้อความคอมเมนต์' })

    let rootAuthorId: string | null = null
    if (dto.parentId) {
      const parent = await this.requireComment(fileId, dto.parentId)
      // Enforce a single reply level: you can only reply to a root comment.
      if (parent.parentId) {
        throw new BadRequestException({
          code: 'reply-depth-exceeded',
          message: 'ตอบกลับได้เพียง 1 ระดับเท่านั้น',
        })
      }
      rootAuthorId = parent.authorId
    }

    const isReply = Boolean(dto.parentId)
    const row = await this.prisma.comment.create({
      data: {
        fileId,
        authorId,
        parentId: dto.parentId ?? null,
        body,
        // Replies inherit the root's anchor — only root comments carry their own.
        anchorFrom: isReply ? Prisma.DbNull : (dto.anchorFrom as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
        anchorTo: isReply ? Prisma.DbNull : (dto.anchorTo as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
        anchorText: isReply ? null : dto.anchorText ?? null,
        sourceRevisionId: isReply ? null : dto.sourceRevisionId ?? null,
      },
      include: { author: { select: { username: true } }, resolvedBy: { select: { username: true } } },
    })

    // Fan-out is a side effect: it must never break or block comment creation.
    this.fanOut(projectId, fileId, file.name, row.author.username, authorId, row.id, rootAuthorId).catch(
      () => undefined,
    )

    return this.toDto(row)
  }

  /** Edit a comment body. Only the author may edit their own comment. */
  async update(
    projectId: string,
    fileId: string,
    commentId: string,
    userId: string,
    dto: UpdateCommentDto,
  ): Promise<CommentDto> {
    await this.requireDocument(projectId, fileId)
    const comment = await this.requireComment(fileId, commentId)
    if (comment.authorId !== userId) {
      throw new ForbiddenException({ code: 'not-comment-author', message: 'แก้ไขได้เฉพาะคอมเมนต์ของตัวเอง' })
    }
    const body = dto.body.trim()
    if (!body) throw new BadRequestException({ code: 'empty-comment', message: 'กรุณาพิมพ์ข้อความคอมเมนต์' })

    const row = await this.prisma.comment.update({
      where: { id: commentId },
      data: { body },
      include: { author: { select: { username: true } }, resolvedBy: { select: { username: true } } },
    })
    return this.toDto(row)
  }

  /** Delete a comment. Allowed for the comment's author or a project Owner. */
  async remove(
    projectId: string,
    fileId: string,
    commentId: string,
    userId: string,
    role: Role,
  ): Promise<{ message: string }> {
    await this.requireDocument(projectId, fileId)
    const comment = await this.requireComment(fileId, commentId)
    if (comment.authorId !== userId && role !== Role.Owner) {
      throw new ForbiddenException({
        code: 'cannot-delete-comment',
        message: 'ลบได้เฉพาะคอมเมนต์ของตัวเอง หรือเจ้าของโปรเจกต์',
      })
    }
    // Deleting a root cascades to its replies via the self-relation FK.
    await this.prisma.comment.delete({ where: { id: commentId } })
    return { message: 'comment-deleted' }
  }

  /** Resolve a thread. Restricted to Owner/Editor (Viewers are rejected here too, defence in depth). */
  resolve(projectId: string, fileId: string, commentId: string, userId: string, role: Role) {
    return this.setResolved(projectId, fileId, commentId, userId, role, true)
  }

  /** Reopen a resolved thread. Same authorization as resolve. */
  reopen(projectId: string, fileId: string, commentId: string, userId: string, role: Role) {
    return this.setResolved(projectId, fileId, commentId, userId, role, false)
  }

  private async setResolved(
    projectId: string,
    fileId: string,
    commentId: string,
    userId: string,
    role: Role,
    resolved: boolean,
  ): Promise<CommentDto> {
    // Owner/Editor only. The @MinRole(Editor) guard is the primary gate; this
    // service-level check keeps the rule enforced even if a route is mis-wired.
    if (role !== Role.Owner && role !== Role.Editor) {
      throw new ForbiddenException({
        code: 'cannot-resolve-comment',
        message: 'เฉพาะเจ้าของโปรเจกต์หรือ Editor เท่านั้นที่ปิด/เปิด thread ได้',
      })
    }
    await this.requireDocument(projectId, fileId)
    const comment = await this.requireComment(fileId, commentId)
    // Resolve state lives on the thread root only; replies follow the root.
    if (comment.parentId) {
      throw new BadRequestException({
        code: 'resolve-target-not-root',
        message: 'ปิด/เปิดสถานะได้เฉพาะคอมเมนต์หลักของ thread',
      })
    }

    const row = await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        resolvedAt: resolved ? new Date() : null,
        resolvedById: resolved ? userId : null,
      },
      include: { author: { select: { username: true } }, resolvedBy: { select: { username: true } } },
    })
    return this.toDto(row)
  }

  /* ------------------------------- helpers -------------------------------- */

  /**
   * Notify project members about a new comment/reply. Root author of a replied-to
   * thread gets the more specific CommentReply; everyone else gets Comment. The
   * root author is excluded from the plain Comment fan-out so they never receive
   * two notifications for one reply. Per-type opt-in is honoured by notify().
   */
  private async fanOut(
    projectId: string,
    fileId: string,
    fileName: string,
    actorName: string,
    actorId: string,
    commentId: string,
    rootAuthorId: string | null,
  ): Promise<void> {
    const [members, project] = await Promise.all([
      this.prisma.membership.findMany({ where: { projectId }, select: { userId: true } }),
      this.prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    ])
    const payload = {
      actorName,
      projectId,
      projectName: project?.name ?? '',
      fileId,
      fileName,
      commentId,
    }

    if (rootAuthorId && rootAuthorId !== actorId) {
      await this.notifications.notify([rootAuthorId], 'CommentReply', payload)
    }
    const commentTargets = members
      .map((m) => m.userId)
      .filter((id) => id !== actorId && id !== rootAuthorId)
    await this.notifications.notify(commentTargets, 'Comment', payload)
  }

  private toDto(row: CommentWithNames): CommentDto {
    return {
      id: row.id,
      fileId: row.fileId,
      authorId: row.authorId,
      authorName: row.author.username,
      parentId: row.parentId,
      body: row.body,
      anchorFrom: row.anchorFrom ?? null,
      anchorTo: row.anchorTo ?? null,
      anchorText: row.anchorText,
      sourceRevisionId: row.sourceRevisionId,
      resolved: row.resolvedAt !== null,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      resolvedById: row.resolvedById,
      resolvedByName: row.resolvedBy?.username ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** IDOR guard #1: the file must belong to this project and be a live Document. */
  private async requireDocument(projectId: string, fileId: string): Promise<File> {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, projectId, deletedAt: null } })
    if (!file) throw new NotFoundException({ code: 'file-not-found', message: 'ไม่พบไฟล์นี้' })
    if (file.kind !== FileKind.Document) {
      throw new BadRequestException({ code: 'not-a-document', message: 'คอมเมนต์ได้เฉพาะไฟล์เอกสาร' })
    }
    return file
  }

  /** IDOR guard #2: the comment must belong to the (already project-scoped) file. */
  private async requireComment(fileId: string, commentId: string): Promise<Comment> {
    const comment = await this.prisma.comment.findFirst({ where: { id: commentId, fileId } })
    if (!comment) throw new NotFoundException({ code: 'comment-not-found', message: 'ไม่พบคอมเมนต์นี้' })
    return comment
  }
}
