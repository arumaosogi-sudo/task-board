import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import { Request } from 'express'
import { PrismaService } from '../../prisma/prisma.service'
import { hashToken } from '../../auth/token.util'

/**
 * The share link resolved from the URL token, attached to the request for the
 * public controllers. Carries only what the read surface needs — never members,
 * comments, revisions, or owner identity.
 */
export interface ResolvedShareLink {
  id: string
  fileId: string
  projectId: string
  fileName: string
  publishedContent: string
  publishedAt: Date
}

/**
 * Authority for the anonymous public read surface — completely independent of
 * `JwtGuard` / `ProjectRoleGuard` (ADR 0006 §4, E-1). It NEVER imports or extends
 * them, so adding public links cannot loosen the authenticated authz path.
 *
 * Validates the opaque path token by SHA-256 hash and enforces the full lifecycle:
 * exists, not revoked, not expired, published, and neither the file nor project is
 * trashed. EVERY failure is an identical generic 404 so a caller can't distinguish
 * "never existed" from "revoked/expired" (S-1 / I-2 enumeration defence).
 */
@Injectable()
export class ShareLinkGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { shareLink?: ResolvedShareLink }>()
    const rawToken = req.params.token
    if (!rawToken) throw new NotFoundException({ code: 'share-not-found' })

    const link = await this.prisma.shareLink.findUnique({
      where: { token: hashToken(rawToken) },
      include: {
        file: { select: { id: true, name: true, deletedAt: true } },
        project: { select: { deletedAt: true } },
      },
    })

    const now = new Date()
    const valid =
      link &&
      link.revokedAt === null &&
      (link.expiresAt === null || link.expiresAt > now) &&
      link.publishedContent !== null &&
      link.publishedAt !== null &&
      link.file.deletedAt === null &&
      link.project.deletedAt === null

    // One generic 404 for every failure mode — no leak of which condition failed.
    if (!valid) throw new NotFoundException({ code: 'share-not-found' })

    req.shareLink = {
      id: link.id,
      fileId: link.fileId,
      projectId: link.projectId,
      fileName: link.file.name,
      publishedContent: link.publishedContent as string,
      publishedAt: link.publishedAt as Date,
    }
    return true
  }
}
