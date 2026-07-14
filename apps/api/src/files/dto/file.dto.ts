import { IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

const KINDS = ['Folder', 'Document'] as const
const ORIENTATIONS = ['portrait', 'landscape'] as const

export class CreateFileDto {
  @IsString()
  @MinLength(1, { message: 'กรุณาตั้งชื่อไฟล์' })
  @MaxLength(200)
  name!: string

  @IsIn(KINDS, { message: 'kind ต้องเป็น Folder หรือ Document' })
  kind!: (typeof KINDS)[number]

  @IsOptional()
  @IsString()
  parentId?: string | null

  @IsOptional()
  @IsIn(ORIENTATIONS)
  orientation?: (typeof ORIENTATIONS)[number]

  // Initial document body (used to seed a file created from a template). When omitted the
  // service falls back to '' — keeping the "blank document" path byte-for-byte backward
  // compatible. Ignored unless `kind === 'Document'`. Same 5MB cap as SaveContentDto.
  @IsOptional()
  @IsString()
  @MaxLength(5_000_000)
  content?: string
}

export class UpdateFileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string

  // `null` moves the file to the project root.
  @IsOptional()
  @IsString()
  parentId?: string | null

  @IsOptional()
  @IsIn(ORIENTATIONS)
  orientation?: (typeof ORIENTATIONS)[number]

  @IsOptional()
  @IsInt()
  order?: number
}

export class SaveContentDto {
  // Document body (HTML/JSON string). Allow empty string (cleared document).
  @IsString()
  @MaxLength(5_000_000) // ~5MB safety cap
  content!: string
}
