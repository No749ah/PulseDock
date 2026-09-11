CREATE TYPE "DeploymentStatus" AS ENUM ('STARTED', 'SUCCESS', 'FAILED', 'ROLLBACK');

CREATE TABLE "DeploymentEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "version" TEXT,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'STARTED',
    "deployedBy" TEXT,
    "commitSha" TEXT,
    "commitMessage" TEXT,
    "branch" TEXT,
    "sourceUrl" TEXT,
    "notes" TEXT,
    "durationMs" INTEGER,
    "monitorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suppressAlerts" BOOLEAN NOT NULL DEFAULT false,
    "suppressUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeploymentEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DeploymentEvent" ADD CONSTRAINT "DeploymentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deployToken" TEXT UNIQUE;

CREATE INDEX "DeploymentEvent_userId_createdAt_idx" ON "DeploymentEvent"("userId", "createdAt" DESC);
CREATE INDEX "DeploymentEvent_userId_service_idx" ON "DeploymentEvent"("userId", "service");
