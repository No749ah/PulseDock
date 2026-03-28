-- Migration: add_monitor_status_webhook
-- Adds statusWebhookUrl to Monitor: a per-monitor webhook that fires on every status change.
-- Useful for CI/CD integrations, custom dashboards, and automation.

ALTER TABLE "Monitor" ADD COLUMN "statusWebhookUrl" TEXT;
ALTER TABLE "Monitor" ADD COLUMN "statusWebhookSecret" TEXT;
