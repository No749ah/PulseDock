-- Migration: add_alert_channel_schedule
ALTER TABLE "AlertChannel" ADD COLUMN "scheduleJson" JSONB;
