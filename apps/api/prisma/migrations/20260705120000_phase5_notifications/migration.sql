-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ProjectInvite', 'Mention', 'Revision');

-- AlterTable (per-type notification opt-in on UserSetting)
ALTER TABLE "UserSetting" ADD COLUMN     "notifyInvite" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyMention" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyRevision" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
