-- CreateTable
CREATE TABLE "MonitorAnnotation" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "annotatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitorAnnotation_monitorId_idx" ON "MonitorAnnotation"("monitorId");

-- CreateIndex
CREATE INDEX "MonitorAnnotation_monitorId_annotatedAt_idx" ON "MonitorAnnotation"("monitorId", "annotatedAt");

-- CreateIndex
CREATE INDEX "MonitorAnnotation_userId_idx" ON "MonitorAnnotation"("userId");

-- AddForeignKey
ALTER TABLE "MonitorAnnotation" ADD CONSTRAINT "MonitorAnnotation_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorAnnotation" ADD CONSTRAINT "MonitorAnnotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
