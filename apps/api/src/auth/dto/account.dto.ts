import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

/** PATCH /auth/me/profile — change username and/or email (both optional). */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Username ต้องมีอย่างน้อย 3 ตัวอักษร' })
  @MaxLength(30, { message: 'Username ต้องไม่เกิน 30 ตัวอักษร' })
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'Username ใช้ได้เฉพาะตัวอักษร ตัวเลข และ _ . -' })
  username?: string

  @IsOptional()
  @IsEmail({}, { message: 'อีเมลไม่ถูกต้อง' })
  email?: string
}

/** POST /auth/me/change-password — requires the current password. */
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string

  @IsString()
  @MinLength(8, { message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' })
  @MaxLength(128)
  newPassword!: string
}

/** DELETE /auth/me — password confirmation (required only for password accounts). */
export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  password?: string
}
