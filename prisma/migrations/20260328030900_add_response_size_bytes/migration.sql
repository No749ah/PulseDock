-- Migration: add_response_size_bytes
-- Adds responseSizeBytes column to MonitorRun to track HTTP response body byte length

ALTER TABLE "MonitorRun" ADD COLUMN "responseSizeBytes" INTEGER;
