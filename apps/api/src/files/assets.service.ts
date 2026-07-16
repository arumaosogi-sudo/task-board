import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { FileKind } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { SupabaseStorageService } from '../storage/supabase-storage.service'

/** 3MB — mirrors the client-side MAX_IMAGE_BYTES cap. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024

/** Raster whitelist (per Sprint-4 spec). Extension is derived from the mime. */
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

type UploadedFile = { buffer: Buffer; mimetype: string; size: number; originalname: string }

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  /**
   * Validate → upload to Supabase Storage → persist a FileAsset row → return the URL.
   * The mime is sniffed from the file's magic bytes (never trust the client-declared
   * content-type) and cross-checked against the declared type.
   */
  async upload(projectId: string, fileId: string, createdBy: string, file?: UploadedFile): Promise<{ url: string }> {
    if (!file) throw new BadRequestException({ code: 'no-file', message: 'ไม่พบไฟล์ที่อัปโหลด' })
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException({ code: 'file-too-large', message: 'รูปภาพต้องไม่เกิน 3MB' })
    }

    const sniffed = sniffImageMime(file.buffer)
    // Both the declared mime and the magic-byte mime must be an allowed raster type,
    // and they must agree — blocks a .png-labelled payload that is really something else.
    if (!sniffed || !ALLOWED[sniffed] || !ALLOWED[file.mimetype] || sniffed !== file.mimetype) {
      throw new BadRequestException({
        code: 'unsupported-type',
        message: 'รองรับเฉพาะรูปภาพ JPG, PNG, WEBP หรือ GIF',
      })
    }

    // Ensure the file exists in this project (IDOR scope) and is a document.
    const target = await this.prisma.file.findFirst({ where: { id: fileId, projectId, deletedAt: null } })
    if (!target) throw new NotFoundException({ code: 'file-not-found', message: 'ไม่พบไฟล์นี้' })
    if (target.kind !== FileKind.Document) {
      throw new BadRequestException({ code: 'not-a-document', message: 'แนบรูปภาพได้เฉพาะไฟล์เอกสาร' })
    }

    const ext = ALLOWED[sniffed]
    const path = `${projectId}/${fileId}/${randomUUID()}.${ext}`
    const { url } = await this.storage.upload(path, file.buffer, sniffed)

    await this.prisma.fileAsset.create({
      data: { fileId, projectId, path, url, mimeType: sniffed, sizeBytes: file.size, createdBy },
    })
    return { url }
  }
}

/** Detect an image mime from magic bytes. Returns null for anything unrecognised. */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  // GIF: "GIF87a" / "GIF89a"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  // WEBP: "RIFF"...."WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}
