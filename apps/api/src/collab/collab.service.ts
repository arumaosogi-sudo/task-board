import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Role } from '@prisma/client'
import {
  Hocuspocus,
  onAuthenticatePayload,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
} from '@hocuspocus/server'
import * as net from 'net'
import * as Y from 'yjs'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { JwtPayload } from '../auth/strategies/jwt.strategy'
import { ROLE_RANK } from '../projects/decorators/min-role.decorator'

// Don't spam a Revision notification on every 2s Hocuspocus store — collapse repeated
// saves of the same file by the same author into at most one notification per window.
const REVISION_NOTIFY_THROTTLE_MS = 5 * 60_000

/**
 * Context returned by onAuthenticate and threaded into every later hook for a
 * connection. Lets us know *who* is connected and at what role without re-querying.
 */
interface CollabContext {
  userId: string
  username: string
  projectId: string
  fileId: string
  role: Role
}

/**
 * Phase 4.1 — Real-time collaboration backend (Hocuspocus / Yjs).
 *
 * Runs a dedicated WebSocket server (separate port) inside the Nest lifecycle so
 * it can reuse Nest DI (Prisma, JWT, config). The Yjs binary state is the source
 * of truth while a document is open; it is persisted to `File.ydoc`.
 *
 * Security (system rule #1 — never trust the client): every connection is
 * authenticated (JWT) and authorized (project membership) server-side in
 * onAuthenticate before any document data flows. Viewers are forced read-only.
 */
@Injectable()
export class CollabService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollabService.name)
  private server?: Hocuspocus
  // Per (fileId:actorId) timestamp of the last Revision notification we fanned out,
  // used to throttle repeated autosaves into one notification per window. In-memory is
  // fine: the collab server is a single process and over-notifying is harmless anyway.
  private readonly notifyThrottle = new Map<string, number>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const port = parseInt(this.config.get<string>('COLLAB_PORT', '3002'), 10)

    // Hocuspocus's own listen() doesn't attach an 'error' handler to its internal
    // httpServer, so a bind failure (e.g. a still-terminating previous deployment
    // holding the port during a platform restart) throws an *uncaught* exception
    // that kills the whole process — taking the REST API down with it, not just
    // collab. Probe the port ourselves first and back off/retry, since the
    // previous holder is expected to release it shortly on a graceful redeploy.
    await this.waitForPortAvailable(port)

    this.server = new Hocuspocus()
    this.server.configure({
      port,
      // Bind hooks as arrows so `this` stays the service instance.
      onAuthenticate: (data) => this.authenticate(data),
      onLoadDocument: (data) => this.loadDocument(data),
      onStoreDocument: (data) => this.storeDocument(data),
    })
    await this.server.listen()
    this.logger.log(`Hocuspocus collaboration server listening on ws://localhost:${port}`)
  }

  async onModuleDestroy(): Promise<void> {
    await this.server?.destroy()
  }

  /**
   * Probes `port` with a throwaway server before handing it to Hocuspocus.
   * Retries with backoff instead of letting an EADDRINUSE crash the process —
   * see the comment in onModuleInit for why this is necessary at all. Gives up
   * (and lets Hocuspocus's own attempt fail loudly) after the deadline so a
   * genuinely stuck port doesn't hang startup forever.
   */
  private async waitForPortAvailable(
    port: number,
    { retries = 15, delayMs = 2000 }: { retries?: number; delayMs?: number } = {},
  ): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const available = await new Promise<boolean>((resolve) => {
        const probe = net.createServer()
        probe.once('error', () => resolve(false))
        probe.once('listening', () => probe.close(() => resolve(true)))
        probe.listen(port, '0.0.0.0')
      })
      if (available) return
      this.logger.warn(
        `Port ${port} still in use (likely a previous deployment finishing shutdown) — ` +
          `retry ${attempt}/${retries} in ${delayMs}ms`,
      )
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    this.logger.error(`Port ${port} still in use after ${retries} retries — attempting to bind anyway`)
  }

  /* --------------------------- lifecycle hooks ---------------------------- */

  /**
   * Gatekeeper for every connection. `documentName` is the File id the client
   * asked to open; `token` is the user's access JWT (passed via provider params).
   * Throwing here rejects the WebSocket connection before any data is exchanged.
   */
  private async authenticate(data: onAuthenticatePayload): Promise<CollabContext> {
    const { token, documentName } = data
    if (!token) throw new Error('missing-token')

    // 1) Verify signature + expiry with the same secret used to mint access tokens.
    let payload: JwtPayload
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      })
    } catch {
      throw new Error('invalid-token')
    }
    const userId = payload?.sub
    if (!userId) throw new Error('invalid-token')

    // 2) Resolve the file -> its project. Reject unknown/soft-deleted files.
    const file = await this.prisma.file.findFirst({
      where: { id: documentName, deletedAt: null },
      select: { id: true, projectId: true },
    })
    if (!file) throw new Error('file-not-found')

    // 3) Authorization: the caller must be a member of the file's project.
    const membership = await this.prisma.membership.findUnique({
      where: { projectId_userId: { projectId: file.projectId, userId } },
      select: { role: true },
    })
    if (!membership) throw new Error('forbidden')

    // 4) Viewers connect read-only; Hocuspocus rejects their document updates.
    if (ROLE_RANK[membership.role] < ROLE_RANK[Role.Editor]) {
      data.connection.readOnly = true
    }

    return {
      userId,
      username: payload.username,
      projectId: file.projectId,
      fileId: file.id,
      role: membership.role,
    }
  }

  /**
   * Seeds the in-memory Y.Doc from the persisted CRDT state when a document is
   * first opened. When `ydoc` is null (documents authored before Phase 4, which
   * only have HTML `content`), the doc starts empty and the first connecting
   * client seeds it from its initial HTML. HTML->Yjs conversion is client-side
   * (it needs the ProseMirror schema) and lands with the TipTap editor swap.
   * [tech debt: legacy-content seeding — resolve in the editor-migration sub-phase]
   */
  private async loadDocument(data: onLoadDocumentPayload): Promise<void> {
    const file = await this.prisma.file.findUnique({
      where: { id: data.documentName },
      select: { ydoc: true },
    })
    if (file?.ydoc) {
      Y.applyUpdate(data.document, new Uint8Array(file.ydoc))
    }
  }

  /**
   * Persists the live CRDT state back to Postgres. Hocuspocus debounces this
   * (default 2s debounce / 10s maxWait), which doubles as our interval-based
   * auto-save of the collaborative document.
   */
  private async storeDocument(data: onStoreDocumentPayload): Promise<void> {
    const state = Y.encodeStateAsUpdate(data.document)
    await this.prisma.file.update({
      where: { id: data.documentName },
      data: { ydoc: Buffer.from(state) },
    })

    // Fan out a throttled "Revision" notification to the other project members so the
    // saved-document activity surfaces in near-real-time. Fire-and-forget: the persist
    // above is the primary job of this hook, so we don't await (or fail on) the notify
    // side effect — that would needlessly delay Hocuspocus's store cycle.
    void this.notifyRevision(data.context as CollabContext | undefined, data.documentName)
  }

  /**
   * Notify co-members (not the author) that a document was updated. Throttled per
   * (fileId + author) so a burst of autosaves collapses to one notification per window.
   */
  private async notifyRevision(ctx: CollabContext | undefined, fileId: string): Promise<void> {
    if (!ctx?.userId || !ctx.projectId) return

    const throttleKey = `${fileId}:${ctx.userId}`
    const now = Date.now()
    if ((this.notifyThrottle.get(throttleKey) ?? 0) + REVISION_NOTIFY_THROTTLE_MS > now) return
    // Opportunistic cleanup so the Map doesn't grow unbounded across the process lifetime:
    // every time we set a fresh stamp, evict any entry whose window has fully elapsed.
    for (const [key, ts] of this.notifyThrottle) {
      if (ts + REVISION_NOTIFY_THROTTLE_MS <= now) this.notifyThrottle.delete(key)
    }
    this.notifyThrottle.set(throttleKey, now)

    try {
      const [members, file] = await Promise.all([
        this.prisma.membership.findMany({
          where: { projectId: ctx.projectId, userId: { not: ctx.userId } },
          select: { userId: true },
        }),
        this.prisma.file.findUnique({ where: { id: fileId }, select: { name: true } }),
      ])
      if (members.length === 0) return

      await this.notifications.notify(
        members.map((m) => m.userId),
        'Revision',
        {
          actorName: ctx.username,
          projectId: ctx.projectId,
          fileId,
          fileName: file?.name ?? '',
        },
      )
    } catch (err) {
      // Roll back the throttle stamp so a transient failure can retry on the next save.
      this.notifyThrottle.delete(throttleKey)
      this.logger.error(`notify revision failed: ${(err as Error).message}`)
    }
  }
}
