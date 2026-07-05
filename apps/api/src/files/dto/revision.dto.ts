import { IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateRevisionDto {
  // Optional human label for the snapshot ("ก่อนรีวิว", "v1.0", …).
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string

  // Snapshot body. Client sends the editor's current HTML for accuracy; if omitted
  // the server falls back to the file's autosaved content mirror.
  @IsOptional()
  @IsString()
  @MaxLength(5_000_000) // ~5MB safety cap (matches SaveContentDto)
  content?: string
}
