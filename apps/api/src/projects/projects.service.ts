import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, Project, Role, User } from '@prisma/client'
import type { ProjectDetail, ProjectMember, ProjectSummary } from '@task-board/shared'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { MailService } from '../mail/mail.service'
import { NotificationsService } from '../notifications/notifications.service'
import { generateOpaqueToken, hashToken } from '../auth/token.util'
import { CreateProjectDto, InviteDto, UpdateProjectDto } from './dto/project.dto'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Bare project fields shared by summary/detail mappers.
type ProjectCore = Pick<
  Project,
  'id' | 'name' | 'description' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & { owner: Pick<User, 'id' | 'username' | 'email'> }

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ------------------------------- mappers -------------------------------- */

  private summary(p: ProjectCore, myRole: Role, memberCount: number, pinned: boolean): ProjectSummary {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      owner: { id: p.owner.id, username: p.owner.username, email: p.owner.email },
      myRole,
      memberCount,
      pinned,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
    }
  }

  /** Loads a full project + members, computing the viewer's role/pin. */
  private async loadDetail(projectId: string, viewerId: string): Promise<ProjectDetail> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        owner: true,
        memberships: { include: { user: true }, orderBy: { createdAt: 'asc' } },
        pins: { where: { userId: viewerId } },
      },
    })
    if (!project) throw new NotFoundException({ code: 'project-not-found' })

    const mine = project.memberships.find((m) => m.userId === viewerId)
    const members: ProjectMember[] = project.memberships.map((m) => ({
      userId: m.userId,
      username: m.user.username,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
    }))

    return {
      ...this.summary(project, mine?.role ?? Role.Viewer, members.length, project.pins.length > 0),
      members,
    }
  }

  /* ----------------------------- create / read ---------------------------- */

  async create(userId: string, dto: CreateProjectDto): Promise<ProjectDetail> {
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description ?? '',
        ownerId: userId,
        // Creator is the Owner member from the start.
        memberships: { create: { userId, role: Role.Owner } },
      },
    })
    return this.loadDetail(project.id, userId)
  }

  /** Projects the user belongs to (excludes trashed). */
  async listMine(userId: string): Promise<ProjectSummary[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, project: { deletedAt: null } },
      include: {
        project: {
          include: {
            owner: true,
            _count: { select: { memberships: true } },
            pins: { where: { userId } },
          },
        },
      },
      orderBy: { project: { updatedAt: 'desc' } },
    })

    return memberships.map((m) =>
      this.summary(m.project, m.role, m.project._count.memberships, m.project.pins.length > 0),
    )
  }

  /** Trashed projects the user owns (only the owner sees trash). Matches on an Owner
   *  membership rather than `ownerId` alone — robust against any ownerId drift and
   *  consistent with how listMine resolves the viewer's role. */
  async listTrash(userId: string): Promise<ProjectSummary[]> {
    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: { not: null },
        memberships: { some: { userId, role: Role.Owner } },
      },
      include: { owner: true, _count: { select: { memberships: true } } },
      orderBy: { deletedAt: 'desc' },
    })
    return projects.map((p) => this.summary(p, Role.Owner, p._count.memberships, false))
  }

  getDetail(projectId: string, viewerId: string): Promise<ProjectDetail> {
    return this.loadDetail(projectId, viewerId)
  }

  /* -------------------------------- update -------------------------------- */

  async update(projectId: string, viewerId: string, dto: UpdateProjectDto): Promise<ProjectDetail> {
    const data: Prisma.ProjectUpdateInput = {}
    if (dto.name !== undefined) data.name = dto.name
    if (dto.description !== undefined) data.description = dto.description
    await this.prisma.project.update({ where: { id: projectId }, data })
    return this.loadDetail(projectId, viewerId)
  }

  /* ----------------------------- soft delete ------------------------------ */

  async softDelete(projectId: string): Promise<{ message: string }> {
    await this.prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } })
    return { message: 'project-trashed' }
  }

  async restore(projectId: string, viewerId: string): Promise<ProjectDetail> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new NotFoundException({ code: 'project-not-found' })
    if (!project.deletedAt) throw new BadRequestException({ code: 'not-trashed', message: 'Project นี้ไม่ได้อยู่ในถังขยะ' })
    await this.prisma.project.update({ where: { id: projectId }, data: { deletedAt: null } })
    return this.loadDetail(projectId, viewerId)
  }

  async permanentDelete(projectId: string): Promise<{ message: string }> {
    // Cascade removes memberships, invitations and pins.
    await this.prisma.project.delete({ where: { id: projectId } })
    return { message: 'project-deleted' }
  }

  /* -------------------------------- members ------------------------------- */

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { projectId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })
    return memberships.map((m) => ({
      userId: m.userId,
      username: m.user.username,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
    }))
  }

  async updateMemberRole(projectId: string, targetUserId: string, role: Role): Promise<ProjectMember> {
    const membership = await this.prisma.membership.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      include: { user: true },
    })
    if (!membership) throw new NotFoundException({ code: 'member-not-found', message: 'ไม่พบสมาชิกนี้' })
    if (membership.role === Role.Owner) {
      throw new BadRequestException({ code: 'cannot-change-owner', message: 'เปลี่ยนสิทธิ์ Owner ตรง ๆ ไม่ได้ ใช้การโอนสิทธิ์แทน' })
    }
    const updated = await this.prisma.membership.update({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      data: { role },
      include: { user: true },
    })
    return {
      userId: updated.userId,
      username: updated.user.username,
      email: updated.user.email,
      role: updated.role,
      joinedAt: updated.createdAt.toISOString(),
    }
  }

  async removeMember(projectId: string, targetUserId: string): Promise<{ message: string }> {
    const membership = await this.prisma.membership.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    })
    if (!membership) throw new NotFoundException({ code: 'member-not-found' })
    if (membership.role === Role.Owner) {
      throw new BadRequestException({ code: 'cannot-remove-owner', message: 'ลบ Owner ไม่ได้' })
    }
    await this.prisma.membership.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    })
    return { message: 'member-removed' }
  }

  async leave(projectId: string, userId: string, role: Role): Promise<{ message: string }> {
    if (role === Role.Owner) {
      throw new BadRequestException({
        code: 'owner-must-transfer',
        message: 'Owner ต้องโอนสิทธิ์ให้คนอื่นก่อนออกจาก Project',
      })
    }
    await this.prisma.membership.delete({ where: { projectId_userId: { projectId, userId } } })
    return { message: 'left-project' }
  }

  async transferOwnership(projectId: string, currentOwnerId: string, targetUserId: string): Promise<ProjectDetail> {
    if (targetUserId === currentOwnerId) {
      throw new BadRequestException({ code: 'already-owner', message: 'ผู้ใช้นี้เป็น Owner อยู่แล้ว' })
    }
    const target = await this.prisma.membership.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    })
    if (!target) throw new NotFoundException({ code: 'member-not-found', message: 'ผู้รับโอนต้องเป็นสมาชิกของ Project' })

    const now = new Date()
    await this.prisma.$transaction([
      this.prisma.membership.update({
        where: { projectId_userId: { projectId, userId: currentOwnerId } },
        data: { role: Role.Editor },
      }),
      this.prisma.membership.update({
        where: { projectId_userId: { projectId, userId: targetUserId } },
        data: { role: Role.Owner },
      }),
      this.prisma.project.update({ where: { id: projectId }, data: { ownerId: targetUserId } }),
      // Auto-revoke every still-live public share link the outgoing Owner created for
      // this project — in the SAME transaction, so there is no window where a link
      // stays valid after its creator stops being Owner (ADR 0006 §7 #3 / SRS §6).
      this.prisma.shareLink.updateMany({
        where: { projectId, createdById: currentOwnerId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ])
    return this.loadDetail(projectId, currentOwnerId)
  }

  /* ------------------------------ invitations ----------------------------- */

  async invite(
    projectId: string,
    inviter: Pick<User, 'id' | 'username'>,
    dto: InviteDto,
  ): Promise<{ message: string }> {
    const email = dto.email.toLowerCase()

    // Already a member? (only relevant if the invitee has an account)
    const existingUser = await this.users.findByEmail(email)
    if (existingUser) {
      const member = await this.prisma.membership.findUnique({
        where: { projectId_userId: { projectId, userId: existingUser.id } },
      })
      if (member) throw new ConflictException({ code: 'already-member', message: 'ผู้ใช้นี้เป็นสมาชิกอยู่แล้ว' })
    }

    const project = await this.prisma.project.findUnique({ where: { id: projectId } })
    if (!project || project.deletedAt) throw new NotFoundException({ code: 'project-not-found' })

    const raw = generateOpaqueToken()
    await this.prisma.$transaction([
      // Supersede any pending invite for the same email on this project.
      this.prisma.invitation.deleteMany({ where: { projectId, email, acceptedAt: null } }),
      this.prisma.invitation.create({
        data: {
          projectId,
          email,
          role: dto.role as Role,
          token: hashToken(raw),
          invitedById: inviter.id,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      }),
    ])

    // Fire-and-forget the email: the invitation row (created above) is the source
    // of truth and the accept link works immediately, so blocking the HTTP response
    // on the Gmail API round-trip (1-3s) just made "invite" feel slow for no gain —
    // the boolean result was already ignored. Delivery is best-effort and never
    // throws; log a failure for operators without stalling the request.
    void this.mail
      .sendInvitationEmail(email, raw, project.name, inviter.username)
      .then((ok) => {
        if (!ok) this.logger.warn(`Invitation email delivery failed for ${email} (project ${project.id})`)
      })
      .catch((err) => this.logger.error(`Invitation email threw for ${email}: ${err}`))

    // If the invitee already has an account, surface an in-app notification too
    // (users without an account are reached by the invitation email only).
    if (existingUser) {
      await this.notifications.notify([existingUser.id], 'ProjectInvite', {
        actorName: inviter.username,
        projectId: project.id,
        projectName: project.name,
      })
    }
    return { message: 'invite-sent' }
  }

  async acceptInvite(userId: string, rawToken: string): Promise<ProjectDetail> {
    const user = await this.users.findById(userId)
    if (!user) throw new NotFoundException()

    const invitation = await this.prisma.invitation.findUnique({
      where: { token: hashToken(rawToken) },
      include: { project: true },
    })
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'invalid-invite', message: 'คำเชิญไม่ถูกต้องหรือหมดอายุ' })
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException({ code: 'invite-email-mismatch', message: 'คำเชิญนี้ออกให้อีเมลอื่น' })
    }
    if (invitation.project.deletedAt) {
      throw new BadRequestException({ code: 'project-not-found', message: 'Project นี้ถูกลบไปแล้ว' })
    }

    await this.prisma.$transaction([
      // Idempotent join: if already a member, keep existing role.
      this.prisma.membership.upsert({
        where: { projectId_userId: { projectId: invitation.projectId, userId } },
        update: {},
        create: { projectId: invitation.projectId, userId, role: invitation.role },
      }),
      this.prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
    ])

    return this.loadDetail(invitation.projectId, userId)
  }

  /* --------------------------------- pins --------------------------------- */

  async pin(projectId: string, userId: string): Promise<{ pinned: boolean }> {
    await this.prisma.projectPin.upsert({
      where: { userId_projectId: { userId, projectId } },
      update: {},
      create: { userId, projectId },
    })
    return { pinned: true }
  }

  async unpin(projectId: string, userId: string): Promise<{ pinned: boolean }> {
    await this.prisma.projectPin.deleteMany({ where: { userId, projectId } })
    return { pinned: false }
  }
}
