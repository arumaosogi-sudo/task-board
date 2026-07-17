import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FileKind, ShareLink } from '@prisma/client'
import type { CreateShareLinkResponse, PublicShareContent, ShareLinkDto } from '@task-board/shared'
import { randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { hashToken } from '../auth/token.util'
import { SupabaseStorageService } from '../storage/supabase-storage.service'
import { sanitizeShareContent } from './share-content.util'
import { CreateShareLinkDto } from './dto/share-link.dto'
import type { ResolvedShareLink } from './guards/share-link.guard'

const DAY_MS = 24 * 60 * 60 * 1000

type ShareLinkWithCreator = ShareLink & { createdBy: { username: string } }

@Injectable()
export class ShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
    private readonly config: ConfigService,
  ) {}

  /* ------------------------------- mappers -------------------------------- */

  private toDto(link: ShareLinkWithCreator): ShareLinkDto {
    return {
      id: link.id,
      fileId: link.fileId,
      createdByUsername: link.createdBy.username,
      publishedAt: link.publishedAt ? link.publishedAt.toISOString() : null,
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
      revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
      lastAccessedAt: link.lastAccessedAt ? link.lastAccessedAt.toISOString() : null,
      accessCount: link.accessCount,
      createdAt: link.createdAt.toISOString(),
    }
  }

  /** First configured web origin, mirroring main.ts CORS resolution. */
  private webOrigin(): string {
    const raw =
      this.config.get<string>('CORS_ORIGINS') ||
      this.config.get<string>('WEB_URL') ||
      'http://localhost:5173'
    return raw.split(',')[0].trim().replace(/\/$/, '')
  }

  /**
   * Scoped document lookup for management routes. Confirms the file belongs to the
   * project (IDOR), is a Document, and isn't trashed — before any share mutation.
   */
  private async requireDocument(projectId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, projectId, deletedAt: null },
    })
    if (!file) throw new NotFoundException({ code: 'file-not-found', message: 'ไม่พบไฟล์นี้' })
    if (file.kind !== FileKind.Document) {
      throw new BadRequestException({ code: 'not-a-document', message: 'สร้างลิงก์แชร์ได้เฉพาะไฟล์เอกสาร' })
    }
    return file
  }

  /* --------------------------- management (Owner) -------------------------- */

  async create(
    projectId: string,
    fileId: string,
    userId: string,
    dto: CreateShareLinkDto,
  ): Promise<CreateShareLinkResponse> {
    await this.requireDocument(projectId, fileId)

    // "No expiry" must be a deliberate choice — reject an ambiguous request so it can
    // never be a silent default (ADR 0006 §3.3 / SRS §4).
    if (!dto.noExpiry && !dto.expiresInDays) {
      throw new BadRequestException({ code: 'choose-ttl', message: 'กรุณาเลือกอายุของลิงก์ก่อน' })
    }
    const expiresAt = dto.noExpiry ? null : new Date(Date.now() + dto.expiresInDays! * DAY_MS)

    // 256-bit opaque token → stored only as its SHA-256 hash (RefreshToken/Invitation
    // pattern). base64url keeps it URL-path-safe.
    const rawToken = randomBytes(32).toString('base64url')

    const link = await this.prisma.shareLink.create({
      data: {
        fileId,
        projectId,
        token: hashToken(rawToken),
        createdById: userId,
        expiresAt,
      },
      include: { createdBy: { select: { username: true } } },
    })

    const origin = this.webOrigin()
    return {
      link: this.toDto(link),
      token: rawToken,
      url: `${origin}/share/${rawToken}`,
    }
  }

  async list(projectId: string, fileId: string): Promise<ShareLinkDto[]> {
    await this.requireDocument(projectId, fileId)
    const links = await this.prisma.shareLink.findMany({
      where: { projectId, fileId },
      include: { createdBy: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return links.map((l) => this.toDto(l))
  }

  /**
   * Manual publish: snapshot the file's current HTML mirror into `publishedContent`,
   * sanitized and with image sources rewritten to the opaque asset placeholder. This
   * is the ONLY thing an anonymous viewer ever sees — never the live document.
   */
  async publish(projectId: string, fileId: string, shareLinkId: string): Promise<ShareLinkDto> {
    const file = await this.requireDocument(projectId, fileId)
    await this.requireLink(projectId, fileId, shareLinkId)

    const assets = await this.prisma.fileAsset.findMany({
      where: { fileId, projectId },
      select: { id: true, url: true, path: true },
    })
    const sanitized = sanitizeShareContent(file.content ?? '', assets)

    const updated = await this.prisma.shareLink.update({
      where: { id: shareLinkId },
      data: { publishedContent: sanitized, publishedAt: new Date() },
      include: { createdBy: { select: { username: true } } },
    })
    return this.toDto(updated)
  }

  async revoke(projectId: string, fileId: string, shareLinkId: string): Promise<{ message: string }> {
    const link = await this.requireLink(projectId, fileId, shareLinkId)
    // Idempotent: re-revoking a revoked link is a no-op, not an error.
    if (!link.revokedAt) {
      await this.prisma.shareLink.update({
        where: { id: shareLinkId },
        data: { revokedAt: new Date() },
      })
    }
    return { message: 'share-revoked' }
  }

  private async requireLink(projectId: string, fileId: string, shareLinkId: string): Promise<ShareLink> {
    // Scoped by projectId AND fileId so an Owner of project A can't touch a link on
    // project B by guessing its id.
    const link = await this.prisma.shareLink.findFirst({
      where: { id: shareLinkId, projectId, fileId },
    })
    if (!link) throw new NotFoundException({ code: 'share-not-found', message: 'ไม่พบลิงก์แชร์นี้' })
    return link
  }

  /* ------------------------------ public read ----------------------------- */

  getPublicContent(link: ResolvedShareLink): PublicShareContent {
    // Aggregate, privacy-preserving access accounting only (no IP/PII). Fire-and-forget
    // so a counter write never blocks or fails the read.
    this.prisma.shareLink
      .update({ where: { id: link.id }, data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() } })
      .catch(() => undefined)

    return {
      fileName: link.fileName,
      contentHtml: link.publishedContent,
      publishedAt: link.publishedAt.toISOString(),
    }
  }

  /**
   * Resolve a published asset for the proxy. The assetId is scoped to the link's own
   * fileId (IDOR I-1/E-2) — a token for file A can never fetch an asset of file B.
   * Returns bytes streamed from the private bucket, or throws 404 (missing asset OR
   * storage unreachable) so the viewer shows a broken image, never a 500.
   */
  async getAsset(link: ResolvedShareLink, assetId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const asset = await this.prisma.fileAsset.findFirst({
      where: { id: assetId, fileId: link.fileId },
      select: { path: true, mimeType: true },
    })
    if (!asset) throw new NotFoundException({ code: 'asset-not-found' })

    const buffer = await this.storage.download(asset.path)
    if (!buffer) throw new NotFoundException({ code: 'asset-unavailable' })
    return { buffer, mimeType: asset.mimeType }
  }
}
