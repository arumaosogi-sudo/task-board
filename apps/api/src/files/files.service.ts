import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { File, FileKind } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateFileDto, UpdateFileDto } from './dto/file.dto'

export interface FileNode {
  id: string
  name: string
  kind: FileKind
  orientation: string | null
  parentId: string | null
  order: number
  updatedAt: string
  children: FileNode[]
}

export interface FileDocument {
  id: string
  projectId: string
  name: string
  kind: FileKind
  orientation: string | null
  parentId: string | null
  content: string
  updatedAt: string
}

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  private toDocument(f: File): FileDocument {
    return {
      id: f.id,
      projectId: f.projectId,
      name: f.name,
      kind: f.kind,
      orientation: f.orientation,
      parentId: f.parentId,
      content: f.content ?? '',
      updatedAt: f.updatedAt.toISOString(),
    }
  }

  /** Returns the project's files as a nested tree (content omitted). */
  async tree(projectId: string): Promise<FileNode[]> {
    const files = await this.prisma.file.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, kind: true, orientation: true, parentId: true, order: true, updatedAt: true },
    })

    const byId = new Map<string, FileNode>()
    for (const f of files) {
      byId.set(f.id, { ...f, updatedAt: f.updatedAt.toISOString(), children: [] })
    }
    const roots: FileNode[] = []
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node)
      else roots.push(node)
    }
    return roots
  }

  async get(projectId: string, fileId: string): Promise<FileDocument> {
    const file = await this.requireFile(projectId, fileId)
    return this.toDocument(file)
  }

  async create(projectId: string, dto: CreateFileDto): Promise<FileDocument> {
    if (dto.parentId) await this.assertFolder(projectId, dto.parentId)
    const file = await this.prisma.file.create({
      data: {
        projectId,
        parentId: dto.parentId ?? null,
        name: dto.name,
        kind: dto.kind as FileKind,
        orientation: dto.kind === 'Document' ? (dto.orientation ?? 'portrait') : null,
        // Seed from the template body when provided; blank documents still get '' (and
        // folders stay null). `content` is ignored for non-Document kinds by this branch.
        content: dto.kind === 'Document' ? (dto.content ?? '') : null,
      },
    })
    return this.toDocument(file)
  }

  async update(projectId: string, fileId: string, dto: UpdateFileDto): Promise<FileDocument> {
    await this.requireFile(projectId, fileId)

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === fileId) throw new BadRequestException({ code: 'invalid-move', message: 'ย้ายไฟล์เข้าไปในตัวเองไม่ได้' })
      await this.assertFolder(projectId, dto.parentId)
      await this.assertNotDescendant(projectId, fileId, dto.parentId)
    }

    const file = await this.prisma.file.update({
      where: { id: fileId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.orientation !== undefined ? { orientation: dto.orientation } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    })
    return this.toDocument(file)
  }

  async saveContent(projectId: string, fileId: string, content: string): Promise<{ updatedAt: string }> {
    const file = await this.requireFile(projectId, fileId)
    if (file.kind !== FileKind.Document) {
      throw new BadRequestException({ code: 'not-a-document', message: 'บันทึกเนื้อหาได้เฉพาะไฟล์เอกสาร' })
    }
    const updated = await this.prisma.file.update({ where: { id: fileId }, data: { content } })
    return { updatedAt: updated.updatedAt.toISOString() }
  }

  /** Soft-deletes the file and its whole subtree. */
  async remove(projectId: string, fileId: string): Promise<{ message: string }> {
    await this.requireFile(projectId, fileId)
    const ids = await this.collectSubtree(projectId, fileId)
    await this.prisma.file.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } })
    return { message: 'file-trashed' }
  }

  /* ------------------------------- helpers -------------------------------- */

  private async requireFile(projectId: string, fileId: string): Promise<File> {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, projectId, deletedAt: null } })
    if (!file) throw new NotFoundException({ code: 'file-not-found', message: 'ไม่พบไฟล์นี้' })
    return file
  }

  private async assertFolder(projectId: string, folderId: string): Promise<void> {
    const folder = await this.prisma.file.findFirst({ where: { id: folderId, projectId, deletedAt: null } })
    if (!folder) throw new NotFoundException({ code: 'parent-not-found', message: 'ไม่พบโฟลเดอร์ปลายทาง' })
    if (folder.kind !== FileKind.Folder) throw new BadRequestException({ code: 'parent-not-folder', message: 'ปลายทางต้องเป็นโฟลเดอร์' })
  }

  /** Prevents moving a folder into one of its own descendants (cycle). */
  private async assertNotDescendant(projectId: string, fileId: string, newParentId: string): Promise<void> {
    const descendants = await this.collectSubtree(projectId, fileId)
    if (descendants.includes(newParentId)) {
      throw new BadRequestException({ code: 'invalid-move', message: 'ย้ายโฟลเดอร์เข้าไปในโฟลเดอร์ลูกของตัวเองไม่ได้' })
    }
  }

  /** BFS over the (non-deleted) subtree rooted at fileId, inclusive. */
  private async collectSubtree(projectId: string, fileId: string): Promise<string[]> {
    const all = await this.prisma.file.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, parentId: true },
    })
    const childrenOf = new Map<string, string[]>()
    for (const f of all) {
      if (!f.parentId) continue
      const arr = childrenOf.get(f.parentId) ?? []
      arr.push(f.id)
      childrenOf.set(f.parentId, arr)
    }
    const result: string[] = []
    const queue = [fileId]
    while (queue.length) {
      const id = queue.shift()!
      result.push(id)
      queue.push(...(childrenOf.get(id) ?? []))
    }
    return result
  }
}
