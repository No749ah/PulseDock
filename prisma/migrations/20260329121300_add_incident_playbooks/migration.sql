-- AlterTable (idempotent)
ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "playbookId" TEXT,
ADD COLUMN IF NOT EXISTS "playbookSteps" JSONB;

-- AlterTable (idempotent)
ALTER TABLE "Monitor" ADD COLUMN IF NOT EXISTS "playbookId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "playbooks" TEXT;

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "IncidentPlaybook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" JSONB NOT NULL,
    "forSeverities" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentPlaybook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "IncidentPlaybook_userId_idx" ON "IncidentPlaybook"("userId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Monitor_playbookId_fkey'
  ) THEN
    ALTER TABLE "Monitor" ADD CONSTRAINT "Monitor_playbookId_fkey"
      FOREIGN KEY ("playbookId") REFERENCES "IncidentPlaybook"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'IncidentPlaybook_userId_fkey'
  ) THEN
    ALTER TABLE "IncidentPlaybook" ADD CONSTRAINT "IncidentPlaybook_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
