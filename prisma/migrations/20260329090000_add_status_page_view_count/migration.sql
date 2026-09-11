-- AlterTable: add view tracking to PublicStatusPage
ALTER TABLE "PublicStatusPage" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PublicStatusPage" ADD COLUMN IF NOT EXISTS "lastViewedAt" TIMESTAMP(3);
