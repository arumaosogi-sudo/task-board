import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateCommentDto {
  // Plain-text comment body. Rendered as text (never HTML) so it carries no XSS
  // surface. Whitespace-only bodies are rejected in the service after trimming.
  @IsString()
  @MinLength(1, { message: 'กรุณาพิมพ์ข้อความคอมเมนต์' })
  @MaxLength(5000, { message: 'คอมเมนต์ยาวเกินไป (สูงสุด 5000 ตัวอักษร)' })
  body!: string

  // Present = this is a reply. The parent must be a root comment (reply depth is
  // capped at 1 level, enforced in the service).
  @IsOptional()
  @IsString()
  parentId?: string | null

  // Serialized Yjs RelativePosition of the highlight start/end. Arbitrary JSON —
  // @IsObject keeps it past the whitelist pipe without constraining its shape.
  @IsOptional()
  @IsObject()
  anchorFrom?: Record<string, unknown>

  @IsOptional()
  @IsObject()
  anchorTo?: Record<string, unknown>

  // Plain-text snapshot of the highlighted range (fallback label when the anchor
  // can no longer be resolved). Bounded so a tampered client can't store a novel.
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  anchorText?: string

  // Revision the document was on at creation (orphan detection after a restore).
  @IsOptional()
  @IsString()
  sourceRevisionId?: string
}

export class UpdateCommentDto {
  @IsString()
  @MinLength(1, { message: 'กรุณาพิมพ์ข้อความคอมเมนต์' })
  @MaxLength(5000, { message: 'คอมเมนต์ยาวเกินไป (สูงสุด 5000 ตัวอักษร)' })
  body!: string
}
