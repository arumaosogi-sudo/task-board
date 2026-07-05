import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'

const THEME_COLORS = ['violet', 'ocean', 'forest', 'sunset', 'rose', 'amber'] as const
const THEME_MODES = ['light', 'dark'] as const
const LANGUAGES = ['th', 'en'] as const

export class UpdateSettingDto {
  @IsOptional()
  @IsIn(THEME_COLORS, { message: 'themeColor ไม่ถูกต้อง' })
  themeColor?: string

  @IsOptional()
  @IsIn(THEME_MODES, { message: 'themeMode ไม่ถูกต้อง' })
  themeMode?: string

  @IsOptional()
  @IsIn(LANGUAGES, { message: 'language ไม่ถูกต้อง' })
  language?: string

  @IsOptional()
  @IsInt()
  @Min(12)
  @Max(20)
  fontSize?: number

  @IsOptional()
  @IsBoolean()
  notifyInvite?: boolean

  @IsOptional()
  @IsBoolean()
  notifyMention?: boolean

  @IsOptional()
  @IsBoolean()
  notifyRevision?: boolean
}
