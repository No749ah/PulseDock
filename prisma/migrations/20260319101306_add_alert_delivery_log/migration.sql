-- CreateTable
CREATE TABLE "AlertDeliveryLog" (
    "id" TEXT NOT NULL,
    "alertChannelId" TEXT NOT NULL,
    "monitorId" TEXT,
    "monitorName" TEXT,
    "status" TEXT NOT NULL,
    "trigger" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertDeliveryLog_alertChannelId_idx" ON "AlertDeliveryLog"("alertChannelId");

-- CreateIndex
CREATE INDEX "AlertDeliveryLog_alertChannelId_createdAt_idx" ON "AlertDeliveryLog"("alertChannelId", "createdAt");

-- AddForeignKey
ALTER TABLE "AlertDeliveryLog" ADD CONSTRAINT "AlertDeliveryLog_alertChannelId_fkey" FOREIGN KEY ("alertChannelId") REFERENCES "AlertChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
