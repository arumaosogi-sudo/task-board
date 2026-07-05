import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

// Roles assignable via the API. 'Owner' is never set directly — only via transfer.
const ASSIGNABLE_ROLES = ['Editor', 'Viewer'] as const

export class CreateProjectDto {
  @IsString()
  @MinLength(1, { message: 'กรุณาตั้งชื่อ Project' })
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string
}

export class InviteDto {
  @IsEmail({}, { message: 'อีเมลไม่ถูกต้อง' })
  email!: string

  @IsIn(ASSIGNABLE_ROLES, { message: 'role ต้องเป็น Editor หรือ Viewer' })
  role!: (typeof ASSIGNABLE_ROLES)[number]
}

export class UpdateMemberRoleDto {
  @IsIn(ASSIGNABLE_ROLES, { message: 'role ต้องเป็น Editor หรือ Viewer' })
  role!: (typeof ASSIGNABLE_ROLES)[number]
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(1)
  token!: string
}

export class TransferOwnershipDto {
  @IsString()
  @MinLength(1)
  userId!: string
}
