import { SetMetadata } from '@nestjs/common'
import { Role } from '@prisma/client'

export const MIN_ROLE_KEY = 'minRole'

/** Declares the minimum project role required to call a route (Owner > Editor > Viewer). */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE_KEY, role)

/** Higher number = more privilege. Used for comparisons by ProjectRoleGuard. */
export const ROLE_RANK: Record<Role, number> = {
  Viewer: 0,
  Editor: 1,
  Owner: 2,
}
