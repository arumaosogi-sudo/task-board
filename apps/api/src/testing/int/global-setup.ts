// globalSetup for the integration project — runs ONCE before the whole suite.
//
// Prepares the test database so specs can run against a real, migrated schema:
//   1. Create the Supabase-specific roles `anon` / `authenticated` if missing.
//      The RLS migration (20260708000000_enable_rls_all_tables) does
//      `REVOKE ... FROM anon, authenticated`, which ERRORS on a vanilla Postgres
//      (e.g. the CI `postgres:16` service) where those roles don't exist. Supabase
//      ships them by default; here we create them so `migrate deploy` succeeds AND
//      so the RLS role-block test can `SET ROLE authenticated`.
//   2. `prisma migrate deploy` — apply all migrations to the test DB.
//
// Everything is scoped to TEST_DATABASE_URL; DATABASE_URL / DIRECT_URL are
// overridden for the migrate subprocess so it can never touch the app database.
import { execSync } from 'node:child_process'
import * as path from 'node:path'
import { PrismaClient } from '@prisma/client'

export default async function globalSetup(): Promise<void> {
  const testUrl = process.env.TEST_DATABASE_URL
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is not set — cannot prepare the integration test database.')
  }
  if (/supabase\.(co|com)/i.test(testUrl)) {
    throw new Error('Refusing to migrate a Supabase host from the integration test setup — use a disposable Postgres.')
  }

  // 1. Ensure the roles the RLS migration references exist (idempotent).
  const bootstrap = new PrismaClient({ datasources: { db: { url: testUrl } } })
  try {
    await bootstrap.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
      END
      $$;
    `)
  } finally {
    await bootstrap.$disconnect()
  }

  // 2. Apply migrations to the test DB. `migrate deploy` is idempotent.
  const schema = path.resolve(__dirname, '../../../prisma/schema.prisma')
  execSync(`npx prisma migrate deploy --schema "${schema}"`, {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl },
  })
}
