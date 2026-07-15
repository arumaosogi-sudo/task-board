import { Injectable, Logger } from '@nestjs/common'
import { NotificationType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/** Shape of the denormalised payload we store per notification kind. */
export interface NotificationPayload {
  actorName?: string
  projectId?: string
  projectName?: string
  fileId?: string
  fileName?: string
  revisionLabel?: string | null
  commentId?: string
}

export interface NotificationDto {
  id: string
  type: NotificationType
  payload: NotificationPayload
  read: boolean
  createdAt: string
}

// Maps a notification type to the UserSetting opt-in column that gates it.
const OPT_IN_FIELD: Record<
  NotificationType,
  'notifyInvite' | 'notifyMention' | 'notifyRevision' | 'notifyComment'
> = {
  ProjectInvite: 'notifyInvite',
  Mention: 'notifyMention',
  Revision: 'notifyRevision',
  // A single opt-in gates both comment kinds in v1 (see UserSetting.notifyComment).
  Comment: 'notifyComment',
  CommentReply: 'notifyComment',
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)
  private readonly PAGE_SIZE = 30

  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------- creation ------------------------------- */

  /**
   * Fan-out a notification to many recipients at once, honouring each user's
   * per-type opt-in. Never throws into the caller's flow: notification delivery
   * is a side effect and must not break the primary action (invite, save, …).
   */
  async notify(
    recipientIds: string[],
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<void> {
    const uniqueIds = [...new Set(recipientIds)].filter(Boolean)
    if (uniqueIds.length === 0) return

    try {
      // Deliver only to recipients opted-in to this type. Every user gets a
      // UserSetting row at creation with all opt-ins defaulting to true, so an
      // opted-in recipient is exactly one whose column is true.
      const field = OPT_IN_FIELD[type]
      const settings = await this.prisma.userSetting.findMany({
        where: { userId: { in: uniqueIds }, [field]: true },
        select: { userId: true },
      })
      const deliverTo = settings.map((s) => s.userId)
      if (deliverTo.length === 0) return

      await this.prisma.notification.createMany({
        data: deliverTo.map((userId) => ({
          userId,
          type,
          payload: payload as unknown as Prisma.InputJsonValue,
        })),
      })
    } catch (err) {
      this.logger.warn(`notify(${type}) failed: ${(err as Error).message}`)
    }
  }

  /* --------------------------------- reads -------------------------------- */

  async list(userId: string, unreadOnly = false): Promise<NotificationDto[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: this.PAGE_SIZE,
    })
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      payload: (n.payload ?? {}) as NotificationPayload,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    }))
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null } })
    return { count }
  }

  /* -------------------------------- writes -------------------------------- */

  /** Mark one notification read — scoped to the owner so users can't touch others'. */
  async markRead(userId: string, id: string): Promise<{ ok: boolean }> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    })
    return { ok: true }
  }

  async markAllRead(userId: string): Promise<{ ok: boolean }> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
    return { ok: true }
  }
}
