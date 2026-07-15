-- Supabase RLS Fix — Enable Row-Level Security on all public tables
-- Run this in the Supabase Dashboard SQL Editor.
--
-- Context: NestJS/Prisma connects as the postgres (superuser) role and bypasses
-- RLS automatically, so the application is unaffected. This script blocks all
-- direct access via the Supabase PostgREST API (anon / authenticated roles),
-- which is what the CRITICAL alert flagged (anon key could read passwordHash,
-- email, tokens, etc.).

-- ── 1. Enable + force RLS on every table ──────────────────────────────────────

ALTER TABLE public."User"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserSetting"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RefreshToken"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EmailVerification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PasswordReset"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Project"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Membership"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Invitation"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProjectPin"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."File"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Revision"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notification"      ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."User"              FORCE ROW LEVEL SECURITY;
ALTER TABLE public."UserSetting"       FORCE ROW LEVEL SECURITY;
ALTER TABLE public."RefreshToken"      FORCE ROW LEVEL SECURITY;
ALTER TABLE public."EmailVerification" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."PasswordReset"     FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Project"           FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Membership"        FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Invitation"        FORCE ROW LEVEL SECURITY;
ALTER TABLE public."ProjectPin"        FORCE ROW LEVEL SECURITY;
ALTER TABLE public."File"              FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Revision"          FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Notification"      FORCE ROW LEVEL SECURITY;

-- ── 2. Revoke all API-role grants (current + future objects) ──────────────────

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ── VERIFICATION — run after apply to confirm ─────────────────────────────────

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
-- Expect: every row rls_enabled = t, rls_forced = t

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
-- Expect: 0 rows
