-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "headerBaseline" JSONB,
ADD COLUMN     "headerBaselineSetAt" TIMESTAMP(3),
ADD COLUMN     "trackedHeaders" TEXT;
