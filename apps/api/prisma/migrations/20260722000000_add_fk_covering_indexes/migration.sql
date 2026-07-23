-- Add covering indexes for foreign keys flagged by the Supabase performance
-- advisor (unindexed_foreign_keys). Without a covering index, lookups/joins on
-- these FKs and ON DELETE cascade/set-null checks fall back to sequential scans.
-- Index names follow Prisma's "<Table>_<column>_idx" convention so `prisma migrate`
-- sees no drift. IF NOT EXISTS keeps this safe to re-run. Tables are small, so a
-- brief write lock during CREATE INDEX is acceptable (no CONCURRENTLY — Prisma runs
-- each migration inside a transaction, which CONCURRENTLY forbids).

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invitation_invitedById_idx" ON "Invitation"("invitedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectPin_projectId_idx" ON "ProjectPin"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Revision_authorId_idx" ON "Revision"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Comment_resolvedById_idx" ON "Comment"("resolvedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Comment_sourceRevisionId_idx" ON "Comment"("sourceRevisionId");
