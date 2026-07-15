-- Migration: Enable Row-Level Security on all public tables
-- NestJS/Prisma connects as postgres (superuser) and bypasses RLS automatically.
-- This blocks all access via Supabase PostgREST API (anon/authenticated roles).

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

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
