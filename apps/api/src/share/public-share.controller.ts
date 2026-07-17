import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import type { PublicShareContent } from '@task-board/shared'
import { ShareService } from './share.service'
import { ShareLinkGuard, type ResolvedShareLink } from './guards/share-link.guard'

/**
 * The anonymous public read surface (ADR 0006 §3.4). Every route is GET-only and
 * guarded SOLELY by `ShareLinkGuard` — no `JwtGuard`, no `ProjectRoleGuard`, no
 * mutation. The opaque path token is the only authority.
 *
 * Rate limits are per-IP and stricter than the global 100/min. Content is capped
 * tightly; the asset proxy allows more because a single page view legitimately loads
 * many images (SRS §6 last edge case).
 */
@Controller('public/share')
@UseGuards(ShareLinkGuard)
export class PublicShareController {
  constructor(private readonly share: ShareService) {}

  private harden(res: Response): void {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  }

  @Get(':token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  content(
    @Req() req: Request & { shareLink: ResolvedShareLink },
    @Res({ passthrough: true }) res: Response,
  ): PublicShareContent {
    this.harden(res)
    return this.share.getPublicContent(req.shareLink)
  }

  @Get(':token/assets/:assetId')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async asset(
    @Req() req: Request & { shareLink: ResolvedShareLink },
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType } = await this.share.getAsset(req.shareLink, assetId)
    this.harden(res)
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Length', buffer.length)
    res.end(buffer)
  }
}
