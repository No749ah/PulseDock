-- AlterTable: add flap detection fields to Monitor
ALTER TABLE "Monitor" ADD COLUMN IF NOT EXISTS "isFlapping" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Monitor" ADD COLUMN IF NOT EXISTS "flapDetectionEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Monitor" ADD COLUMN IF NOT EXISTS "flapAlertedAt" TIMESTAMP(3);
