import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'

export class VerifyEmailDto {
  @IsString()
  @MinLength(1)
  token!: string
}

export class ResendVerifyDto {
  @IsEmail({}, { message: 'อีเมลไม่ถูกต้อง' })
  email!: string
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'อีเมลไม่ถูกต้อง' })
  email!: string
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token!: string

  @IsString()
  @MinLength(8, { message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' })
  @MaxLength(128)
  password!: string
}
