import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class RegisterDto {
  @IsString()
  @MinLength(3, { message: 'Username ต้องมีอย่างน้อย 3 ตัวอักษร' })
  @MaxLength(30, { message: 'Username ต้องไม่เกิน 30 ตัวอักษร' })
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'Username ใช้ได้เฉพาะตัวอักษร ตัวเลข และ _ . -',
  })
  username!: string

  @IsEmail({}, { message: 'อีเมลไม่ถูกต้อง' })
  email!: string

  @IsString()
  @MinLength(8, { message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' })
  @MaxLength(128)
  password!: string
}
