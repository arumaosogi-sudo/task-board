import { IsString, MinLength } from 'class-validator'

export class LoginDto {
  /** Username or email. */
  @IsString()
  @MinLength(1, { message: 'กรุณากรอก Username หรือ Email' })
  identity!: string

  @IsString()
  @MinLength(1, { message: 'กรุณากรอกรหัสผ่าน' })
  password!: string
}
