-- AlterTable: add optional description to Monitor
ALTER TABLE "Monitor" ADD COLUMN "description" TEXT;

-- AlterTable: add optional customCss to PublicStatusPage
ALTER TABLE "PublicStatusPage" ADD COLUMN "customCss" TEXT;
