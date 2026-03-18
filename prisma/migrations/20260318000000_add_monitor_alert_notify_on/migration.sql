-- Add notifyOn and lastNotifiedAt to MonitorAlert
ALTER TABLE "MonitorAlert" ADD COLUMN IF NOT EXISTS "notifyOn" TEXT NOT NULL DEFAULT 'ON_CHANGE';
ALTER TABLE "MonitorAlert" ADD COLUMN IF NOT EXISTS "lastNotifiedAt" TIMESTAMP(3);
