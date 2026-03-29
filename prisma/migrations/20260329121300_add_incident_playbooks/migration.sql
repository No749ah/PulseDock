-- AlterTable
ALTER TABLE "Incident" ADD COLUMN "playbookId" TEXT,
ADD COLUMN "playbookSteps" JSONB;

-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN "playbookId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "playbooks" TEXT;

-- CreateTable
CREATE TABLE "IncidentPlaybook" (
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

-- CreateIndex
CREATE INDEX "IncidentPlaybook_userId_idx" ON "IncidentPlaybook"("userId");

-- AddForeignKey
ALTER TABLE "Monitor" ADD CONSTRAINT "Monitor_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "IncidentPlaybook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentPlaybook" ADD CONSTRAINT "IncidentPlaybook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
