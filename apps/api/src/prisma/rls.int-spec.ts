// P0 Security — Row-Level Security smoke test (real PostgreSQL).
//
// Migration 20260708000000_enable_rls_all_tables locks the database down so that
// only the app's superuser connection can read/write; the Supabase PostgREST
// roles (anon / authenticated) are fully revoked. Nothing in the unit suite can
// verify this — it's enforced by the DB, not by application code. This spec
// asserts it two ways:
//   1. Catalog: every domain table has RLS both ENABLED and FORCED.
//   2. Behaviour: dropping to the non-superuser `authenticated` role and selecting
//      from a table is denied.
import { prisma } from '../testing/int/prisma-test-client'

// The exact set the migration hardens. Kept as a literal so a NEW table that
// someone forgets to add to the RLS migration makes this test fail loudly.
const RLS_TABLES = [
  'User',
  'UserSetting',
  'RefreshToken',
  'EmailVerification',
  'PasswordReset',
  'Project',
  'Membership',
  'Invitation',
  'ProjectPin',
  'File',
  'Revision',
  'Notification',
] as const

describe('RLS — database-level lockdown', () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('has RLS ENABLED and FORCED on every domain table', async () => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >(
      `SELECT relname, relrowsecurity, relforcerowsecurity
         FROM pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relkind = 'r'
          AND relname = ANY($1::text[])`,
      RLS_TABLES as unknown as string[],
    )

    // Every expected table must be present…
    const found = new Set(rows.map((r) => r.relname))
    for (const t of RLS_TABLES) {
      expect(found.has(t)).toBe(true)
    }
    // …and each must be both enabled and forced.
    for (const r of rows) {
      expect(r.relrowsecurity).toBe(true)
      expect(r.relforcerowsecurity).toBe(true)
    }
  })

  it('denies direct reads to the non-superuser `authenticated` role', async () => {
    // SET LOCAL keeps the role change on this single connection inside the tx, so
    // the pooled client can't leak it to other queries. The REVOKE in the RLS
    // migration means even a plain SELECT is "permission denied" for this role.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated')
        return tx.$queryRawUnsafe('SELECT id FROM "public"."User" LIMIT 1')
      }),
    ).rejects.toThrow(/permission denied/i)
  })
})
