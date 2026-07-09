// Integration-test Prisma client — talks to a REAL Postgres (TEST_DATABASE_URL).
//
// Unlike the unit suite (which mocks PrismaService entirely), integration specs
// run their queries against an actual database so they catch mock/schema drift:
// a renamed column, a dropped index, or a `where` clause that no longer matches
// the real schema fails here even though the mocked unit test stays green.
//
// SAFETY: this client is bound explicitly to TEST_DATABASE_URL and refuses to
// start if that points at the app/prod database (see the guards below and in
// env-setup.ts). It must never touch DATABASE_URL / Supabase.
import { PrismaClient } from '@prisma/client'

const url = process.env.TEST_DATABASE_URL
if (!url) {
  throw new Error(
    'TEST_DATABASE_URL is not set — integration tests require an isolated test database. ' +
      'See README “Integration tests (real Postgres)”.',
  )
}
if (/supabase\.(co|com)/i.test(url)) {
  throw new Error('Refusing to run integration tests against a Supabase host — use a disposable local/CI Postgres.')
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) {
  throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL — refusing to run against the app database.')
}

// Bind the datasource explicitly (schema datasource block is named `db`) so the
// client can never silently fall back to DATABASE_URL from the environment.
export const prisma = new PrismaClient({ datasources: { db: { url } } })

// Child-first order is not required because TRUNCATE ... CASCADE handles FK
// dependencies, but we deliberately exclude `_prisma_migrations` so migration
// state survives between tests.
const TABLES = [
  'Notification',
  'Revision',
  'File',
  'ProjectPin',
  'Invitation',
  'Membership',
  'Project',
  'PasswordReset',
  'EmailVerification',
  'RefreshToken',
  'UserSetting',
  'User',
] as const

/** Wipes all domain tables between tests. RESTART IDENTITY + CASCADE keeps it clean. */
export async function truncateAll(): Promise<void> {
  const list = TABLES.map((t) => `"public"."${t}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}
