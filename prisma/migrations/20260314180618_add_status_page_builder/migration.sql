/*
  Warnings:

  - You are about to drop the column `configJson` on the `PublicStatusPage` table. All the data in the column will be lost.
  - You are about to drop the column `publishedAt` on the `PublicStatusPage` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "PublicStatusPage_publishedAt_idx";

-- AlterTable
ALTER TABLE "PublicStatusPage" DROP COLUMN "configJson",
DROP COLUMN "publishedAt",
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "layout" JSONB NOT NULL DEFAULT '{"widgets":[]}',
ADD COLUMN     "passwordHash" TEXT;

-- CreateIndex
CREATE INDEX "PublicStatusPage_slug_idx" ON "PublicStatusPage"("slug");

-- CreateIndex
CREATE INDEX "PublicStatusPage_isPublished_idx" ON "PublicStatusPage"("isPublished");
