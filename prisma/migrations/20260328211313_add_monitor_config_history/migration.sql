-- CreateTable
CREATE TABLE "MonitorConfigChange" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorConfigChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitorConfigChange_monitorId_createdAt_idx" ON "MonitorConfigChange"("monitorId", "createdAt");

-- CreateIndex
CREATE INDEX "MonitorConfigChange_userId_idx" ON "MonitorConfigChange"("userId");

-- AddForeignKey
ALTER TABLE "MonitorConfigChange" ADD CONSTRAINT "MonitorConfigChange_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorConfigChange" ADD CONSTRAINT "MonitorConfigChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
