-- Backfill the two `EmailVerification` columns that `schema.prisma` has always
-- declared but no migration ever created (see model EmailVerification:
-- `pendingPasswordHash` / `pendingUsername`).
--
-- Why this was invisible until now: a database built with `prisma db push` or
-- `prisma migrate dev` picks the columns up straight from the schema, so every
-- long-lived local/dev database already had them. Any database built the
-- documented way — `prisma migrate deploy`, which is also what the API container
-- runs on boot — did not, and `AuthService.sendVerification()` writes both fields
-- on every registration, so `POST /auth/register` failed with Prisma P2022
-- ("column does not exist") → HTTP 500 on a freshly migrated database.
--
-- `IF NOT EXISTS` keeps this a no-op on the databases that already drifted ahead,
-- so it is safe to apply everywhere.

ALTER TABLE public."EmailVerification" ADD COLUMN IF NOT EXISTS "pendingPasswordHash" TEXT;
ALTER TABLE public."EmailVerification" ADD COLUMN IF NOT EXISTS "pendingUsername" TEXT;
