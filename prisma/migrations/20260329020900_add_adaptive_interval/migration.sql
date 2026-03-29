-- AlterTable: add adaptive interval fields to Monitor
ALTER TABLE "Monitor" ADD COLUMN "adaptiveIntervalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Monitor" ADD COLUMN "adaptiveIntervalDownSec" INTEGER;
ALTER TABLE "Monitor" ADD COLUMN "adaptiveIntervalDegradedSec" INTEGER;
