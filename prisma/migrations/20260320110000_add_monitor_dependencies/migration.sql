-- CreateTable
CREATE TABLE "MonitorDependency" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitorDependency_monitorId_idx" ON "MonitorDependency"("monitorId");

-- CreateIndex
CREATE INDEX "MonitorDependency_dependsOnId_idx" ON "MonitorDependency"("dependsOnId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorDependency_monitorId_dependsOnId_key" ON "MonitorDependency"("monitorId", "dependsOnId");

-- AddForeignKey
ALTER TABLE "MonitorDependency" ADD CONSTRAINT "MonitorDependency_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorDependency" ADD CONSTRAINT "MonitorDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
