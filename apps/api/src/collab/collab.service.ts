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
import * as Y from 'yjs'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/strategies/jwt.strategy'
import { ROLE_RANK } from '../projects/decorators/min-role.decorator'

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const port = parseInt(this.config.get<string>('COLLAB_PORT', '3002'), 10)

    this.server = new Hocuspocus()
    this.server.configure({
      port,
      // Bind hooks as arrows so `this` stays the service instance.
      onAuthenticate: (data) => this.authenticate(data),
      onLoadDocument: (data) => this.loadDocument(data),
      onStoreDocument: (data) => this.storeDocument(data),
    })
    this.server.listen()
    this.logger.log(`Hocuspocus collaboration server listening on ws://localhost:${port}`)
  }

  async onModuleDestroy(): Promise<void> {
    await this.server?.destroy()
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
  }
}
