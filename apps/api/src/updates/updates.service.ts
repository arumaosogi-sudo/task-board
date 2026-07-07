import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UpdatesRange } from './dto/updates-query.dto'

/**
 * Phase 5 — cross-project revision feeds.
 *
 * Two views over the same Revision table, both scoped to projects the caller is a
 * member of (owner membership included, since the creator joins as Owner):
 *   • myUpdates      — revisions the caller authored
 *   • projectChanges — revisions by anyone, optionally filtered by author
 *
 * Feeds return metadata only (no HTML body). The diff drawer fetches individual
 * revision bodies through the existing per-file revision endpoint, so these
 * queries stay cheap even for busy projects.
 */

export interface MyUpdateItem {
  id: string
  projectId: string
  projectName: string
  fileId: string
  fileName: string
  scope: 'owner' | 'member'
  label: string | null
  createdAt: string
}

export interface ProjectChangeItem {
  id: string
  projectId: string
  projectName: string
  fileId: string
  fileName: string
  authorId: string
  authorName: string
  label: string | null
  createdAt: string
}

// Cap the feed so a heavily-edited account can't pull an unbounded result set.
const MAX_FEED = 200

/** Translate a range token into a `createdAt >= since` lower bound (undefined = no bound). */
function rangeToDate(range: UpdatesRange | undefined): Date | undefined {
  if (range === '7d') return new Date(Date.now() - 7 * 86_400_000)
  if (range === '30d') return new Date(Date.now() - 30 * 86_400_000)
  return undefined // 'all' (or unset → default handled by caller)
}

@Injectable()
export class UpdatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Revisions authored by `userId`, newest first, across their (non-trashed) projects. */
  async myUpdates(
    userId: string,
    range: UpdatesRange = '30d',
    projectId?: string,
  ): Promise<MyUpdateItem[]> {
    const since = rangeToDate(range)
    const revisions = await this.prisma.revision.findMany({
      where: {
        authorId: userId,
        ...(since ? { createdAt: { gte: since } } : {}),
        file: {
          deletedAt: null,
          ...(projectId ? { projectId } : {}),
          // Membership check both authorises the read and defines "my projects".
          project: { deletedAt: null, memberships: { some: { userId } } },
        },
      },
      select: {
        id: true,
        label: true,
        createdAt: true,
        file: {
          select: {
            id: true,
            name: true,
            project: { select: { id: true, name: true, ownerId: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_FEED,
    })

    return revisions.map((r) => ({
      id: r.id,
      projectId: r.file.project.id,
      projectName: r.file.project.name,
      fileId: r.file.id,
      fileName: r.file.name,
      scope: r.file.project.ownerId === userId ? 'owner' : 'member',
      label: r.label,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  /** All revisions in the caller's projects, newest first (optionally by one author). */
  async projectChanges(
    userId: string,
    range: UpdatesRange = '30d',
    projectId?: string,
    authorId?: string,
  ): Promise<ProjectChangeItem[]> {
    const since = rangeToDate(range)
    const revisions = await this.prisma.revision.findMany({
      where: {
        ...(since ? { createdAt: { gte: since } } : {}),
        ...(authorId ? { authorId } : {}),
        file: {
          deletedAt: null,
          ...(projectId ? { projectId } : {}),
          project: { deletedAt: null, memberships: { some: { userId } } },
        },
      },
      select: {
        id: true,
        label: true,
        createdAt: true,
        authorId: true,
        author: { select: { username: true } },
        file: {
          select: {
            id: true,
            name: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_FEED,
    })

    return revisions.map((r) => ({
      id: r.id,
      projectId: r.file.project.id,
      projectName: r.file.project.name,
      fileId: r.file.id,
      fileName: r.file.name,
      authorId: r.authorId,
      authorName: r.author.username,
      label: r.label,
      createdAt: r.createdAt.toISOString(),
    }))
  }
}
