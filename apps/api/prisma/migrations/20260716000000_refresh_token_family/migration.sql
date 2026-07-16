-- Refresh-token family + rotation marker for reuse (theft) detection.
-- On rotation the old token row is kept and stamped `rotatedAt`; presenting an
-- already-rotated token later is a replay signal and revokes the whole family.

ALTER TABLE public."RefreshToken" ADD COLUMN "familyId" TEXT;
ALTER TABLE public."RefreshToken" ADD COLUMN "rotatedAt" TIMESTAMP(3);

-- Backfill existing rows: each pre-existing token is its own single-member family.
UPDATE public."RefreshToken" SET "familyId" = "id" WHERE "familyId" IS NULL;

ALTER TABLE public."RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;

CREATE INDEX "RefreshToken_familyId_idx" ON public."RefreshToken"("familyId");
