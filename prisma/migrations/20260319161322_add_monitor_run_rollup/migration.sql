-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "rollupEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MonitorRunRollup" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "granularity" TEXT NOT NULL,
    "bucketAt" TIMESTAMP(3) NOT NULL,
    "totalChecks" INTEGER NOT NULL,
    "okChecks" INTEGER NOT NULL,
    "avgLatencyMs" INTEGER,
    "p95LatencyMs" INTEGER,
    "maxLatencyMs" INTEGER,
    "minLatencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorRunRollup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitorRunRollup_userId_granularity_bucketAt_idx" ON "MonitorRunRollup"("userId", "granularity", "bucketAt");

-- CreateIndex
CREATE INDEX "MonitorRunRollup_monitorId_granularity_bucketAt_idx" ON "MonitorRunRollup"("monitorId", "granularity", "bucketAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorRunRollup_monitorId_granularity_bucketAt_key" ON "MonitorRunRollup"("monitorId", "granularity", "bucketAt");

-- AddForeignKey
ALTER TABLE "MonitorRunRollup" ADD CONSTRAINT "MonitorRunRollup_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorRunRollup" ADD CONSTRAINT "MonitorRunRollup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
