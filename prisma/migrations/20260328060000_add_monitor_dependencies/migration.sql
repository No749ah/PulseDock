-- Migration: add_monitor_dependencies
-- Note: The MonitorDependency table was first created in migration 20260320110000.
-- This migration ensures the table exists with all required constraints (idempotent).
CREATE TABLE IF NOT EXISTS "MonitorDependency" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonitorDependency_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MonitorDependency_monitorId_fkey'
  ) THEN
    ALTER TABLE "MonitorDependency" ADD CONSTRAINT "MonitorDependency_monitorId_fkey"
      FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MonitorDependency_dependsOnId_fkey'
  ) THEN
    ALTER TABLE "MonitorDependency" ADD CONSTRAINT "MonitorDependency_dependsOnId_fkey"
      FOREIGN KEY ("dependsOnId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'MonitorDependency_monitorId_dependsOnId_key'
  ) THEN
    ALTER TABLE "MonitorDependency" ADD CONSTRAINT "MonitorDependency_monitorId_dependsOnId_key"
      UNIQUE ("monitorId", "dependsOnId");
  END IF;
END $$;
