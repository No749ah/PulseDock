-- Migration: add userId to MonitorDependency and update relation names

-- Add userId column with a default (backfill from the monitor owner)
ALTER TABLE "MonitorDependency" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- Backfill userId from the monitor owner
UPDATE "MonitorDependency" md
SET "userId" = m."userId"
FROM "Monitor" m
WHERE m."id" = md."monitorId"
  AND md."userId" IS NULL;

-- Delete rows that couldn't be backfilled (orphaned)
DELETE FROM "MonitorDependency" WHERE "userId" IS NULL;

-- Make userId NOT NULL
ALTER TABLE "MonitorDependency" ALTER COLUMN "userId" SET NOT NULL;

-- Add foreign key to User
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MonitorDependency_userId_fkey'
  ) THEN
    ALTER TABLE "MonitorDependency" ADD CONSTRAINT "MonitorDependency_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Add index on userId
CREATE INDEX IF NOT EXISTS "MonitorDependency_userId_idx" ON "MonitorDependency"("userId");
