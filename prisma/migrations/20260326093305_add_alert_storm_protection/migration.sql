-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "alertStormNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "alertStormProtection" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "alertStormThreshold" INTEGER NOT NULL DEFAULT 10;
