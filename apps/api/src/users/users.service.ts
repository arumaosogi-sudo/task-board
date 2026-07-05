import { Injectable } from '@nestjs/common'
import { Prisma, User, UserSetting } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } })
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  }

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } })
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleId } })
  }

  /** Find by username OR email — used by login (identity field). */
  findByIdentity(identity: string): Promise<User | null> {
    const value = identity.trim()
    return this.prisma.user.findFirst({
      where: { OR: [{ email: value.toLowerCase() }, { username: value }] },
    })
  }

  /** Returns the user together with their settings row (used by /auth/me). */
  findByIdWithSetting(id: string): Promise<(User & { setting: UserSetting | null }) | null> {
    return this.prisma.user.findUnique({ where: { id }, include: { setting: true } })
  }

  /** Creates a user and its default settings row in one transaction. */
  create(data: {
    username: string
    email: string
    passwordHash?: string | null
    googleId?: string | null
    emailVerified?: boolean
  }): Promise<User & { setting: UserSetting | null }> {
    return this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash ?? null,
        googleId: data.googleId ?? null,
        emailVerified: data.emailVerified ?? false,
        setting: { create: {} },
      },
      include: { setting: true },
    })
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data })
  }

  /** Upserts the settings row for a user (1:1). */
  updateSetting(
    userId: string,
    data: Partial<
      Pick<
        UserSetting,
        | 'themeColor'
        | 'themeMode'
        | 'language'
        | 'fontSize'
        | 'notifyInvite'
        | 'notifyMention'
        | 'notifyRevision'
      >
    >,
  ): Promise<UserSetting> {
    return this.prisma.userSetting.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    })
  }
}
