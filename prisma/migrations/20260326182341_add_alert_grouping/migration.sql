-- AlterTable
ALTER TABLE "AlertChannel" ADD COLUMN     "alertGrouping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "groupByFolder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "groupByTag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "groupWindowSec" INTEGER NOT NULL DEFAULT 300;

-- AlterTable
ALTER TABLE "AlertDeliveryLog" ADD COLUMN     "groupedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isGrouped" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AlertGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "monitorIds" TEXT NOT NULL,
    "firstAlertAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAlertAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "level" TEXT NOT NULL DEFAULT 'red',

    CONSTRAINT "AlertGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertGroup_userId_channelId_groupKey_idx" ON "AlertGroup"("userId", "channelId", "groupKey");

-- CreateIndex
CREATE INDEX "AlertGroup_userId_sentAt_idx" ON "AlertGroup"("userId", "sentAt");

-- AddForeignKey
ALTER TABLE "AlertGroup" ADD CONSTRAINT "AlertGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertGroup" ADD CONSTRAINT "AlertGroup_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "AlertChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
