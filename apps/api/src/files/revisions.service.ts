import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { File, FileKind, Revision } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CreateRevisionDto } from './dto/revision.dto'

/** Revision metadata (no body) — for the version-history list. */
export interface RevisionMeta {
  id: string
  label: string | null
  authorId: string
  authorName: string
  createdAt: string
}

/** Full revision including the HTML snapshot — for diffing / restoring. */
export interface RevisionDetail extends RevisionMeta {
  content: string
}

/**
 * Phase 4.5 — document version history.
 *
 * Snapshots are plain HTML captured on demand. Restore is intentionally NOT a
 * server operation: while a document is open, the Yjs CRDT (File.ydoc) is the
 * source of truth, so restoring is done client-side by writing the snapshot back
 * into the live editor (a normal collaborative edit that syncs + persists). This
 * service therefore only creates, lists, and reads snapshots.
 */
@Injectable()
export class RevisionsService {
  // Keep history bounded so a busy document can't grow the table without limit.
  private readonly MAX_PER_FILE = 50

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    projectId: string,
    fileId: string,
    authorId: string,
    dto: CreateRevisionDto,
  ): Promise<RevisionMeta> {
    const file = await this.requireDocument(projectId, fileId)
    const content = dto.content ?? file.content ?? ''

    // Capture the previous snapshot's content BEFORE inserting so mention
    // notifications only fire for @mentions newly added since the last version.
    const prev = await this.prisma.revision.findFirst({
      where: { fileId },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    })

    const rev = await this.prisma.revision.create({
      data: { fileId, authorId, content, label: dto.label?.trim() || null },
      include: { author: { select: { username: true } } },
    })
    await this.prune(fileId)

    // Fan-out notifications as a side effect (never blocks/breaks the save).
    this.fanOut(projectId, file.name, rev.author.username, authorId, content, prev?.content ?? '').catch(
      () => undefined,
    )

    return this.toMeta(rev, rev.author.username)
  }

  /**
   * Notify project members about a new version, plus anyone newly @mentioned
   * in the document body. Mentions are diffed against the previous snapshot so
   * re-saving an unchanged mention never re-pings the same person.
   */
  private async fanOut(
    projectId: string,
    fileName: string,
    authorName: string,
    authorId: string,
    newContent: string,
    prevContent: string,
  ): Promise<void> {
    const members = await this.prisma.membership.findMany({
      where: { projectId },
      select: { userId: true, user: { select: { username: true } } },
    })
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    })
    const projectName = project?.name ?? ''
    const payload = { actorName: authorName, projectId, projectName, fileName }

    // Revision: everyone in the project except the author.
    const revisionTargets = members.filter((m) => m.userId !== authorId).map((m) => m.userId)
    await this.notifications.notify(revisionTargets, 'Revision', payload)

    // Mentions: members whose @username appears in the new content but not the old.
    const newlyMentioned = members.filter(
      (m) =>
        m.userId !== authorId &&
        mentions(newContent, m.user.username) &&
        !mentions(prevContent, m.user.username),
    )
    if (newlyMentioned.length > 0) {
      await this.notifications.notify(
        newlyMentioned.map((m) => m.userId),
        'Mention',
        payload,
      )
    }
  }

  async list(projectId: string, fileId: string): Promise<RevisionMeta[]> {
    await this.requireDocument(projectId, fileId)
    const revs = await this.prisma.revision.findMany({
      where: { fileId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { username: true } } },
    })
    return revs.map((r) => this.toMeta(r, r.author.username))
  }

  async get(projectId: string, fileId: string, revisionId: string): Promise<RevisionDetail> {
    await this.requireDocument(projectId, fileId)
    const rev = await this.prisma.revision.findFirst({
      where: { id: revisionId, fileId },
      include: { author: { select: { username: true } } },
    })
    if (!rev) throw new NotFoundException({ code: 'revision-not-found', message: 'ไม่พบเวอร์ชันนี้' })
    return { ...this.toMeta(rev, rev.author.username), content: rev.content }
  }

  /* ------------------------------- helpers -------------------------------- */

  private toMeta(r: Revision, authorName: string): RevisionMeta {
    return {
      id: r.id,
      label: r.label,
      authorId: r.authorId,
      authorName,
      createdAt: r.createdAt.toISOString(),
    }
  }

  private async requireDocument(projectId: string, fileId: string): Promise<File> {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, projectId, deletedAt: null } })
    if (!file) throw new NotFoundException({ code: 'file-not-found', message: 'ไม่พบไฟล์นี้' })
    if (file.kind !== FileKind.Document) {
      throw new BadRequestException({ code: 'not-a-document', message: 'สร้างเวอร์ชันได้เฉพาะไฟล์เอกสาร' })
    }
    return file
  }

  /** Trim the oldest snapshots beyond MAX_PER_FILE for this file. */
  private async prune(fileId: string): Promise<void> {
    const keep = await this.prisma.revision.findMany({
      where: { fileId },
      orderBy: { createdAt: 'desc' },
      skip: this.MAX_PER_FILE,
      select: { id: true },
    })
    if (keep.length === 0) return
    await this.prisma.revision.deleteMany({ where: { id: { in: keep.map((r) => r.id) } } })
  }
}

/** True if the HTML/text `content` contains an `@username` mention token. */
function mentions(content: string, username: string): boolean {
  if (!content || !username) return false
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // `@name` not immediately followed by another identifier char (so @bob ≠ @bobby).
  return new RegExp(`@${escaped}(?![\\w.-])`, 'i').test(content)
}
