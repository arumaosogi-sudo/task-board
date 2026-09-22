-- Idempotently create the Supabase-style `anon` / `authenticated` roles that
-- the RLS migration (apps/api/prisma/migrations/20260708000000_enable_rls_all_tables)
-- REVOKEs privileges from. Supabase ships these roles by default; a vanilla
-- Postgres (the dev/test containers, or CI's postgres:16 service) does not,
-- so `prisma migrate deploy` fails without this step first.
--
-- Kept in sync by hand with the same block in
-- apps/api/src/testing/int/global-setup.ts (that TS version does this for
-- `npm run test:int` in CI / when TEST_DATABASE_URL is already set by hand).
--
-- This .sql version has two consumers:
--   - docker-compose.yml's dev `db`, which mounts it into
--     /docker-entrypoint-initdb.d so a fresh dev database is migratable;
--   - the standalone docker-compose.test.yml sandbox, run via
--     `npx prisma db execute`, which needs a real .sql file, not TS.
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
