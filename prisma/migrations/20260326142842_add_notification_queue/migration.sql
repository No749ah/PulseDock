-- CreateTable
CREATE TABLE "NotificationQueueItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "monitorId" TEXT,
    "monitorName" TEXT,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationQueueItem_userId_idx" ON "NotificationQueueItem"("userId");

-- CreateIndex
CREATE INDEX "NotificationQueueItem_userId_sentAt_idx" ON "NotificationQueueItem"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "NotificationQueueItem_createdAt_idx" ON "NotificationQueueItem"("createdAt");

-- AddForeignKey
ALTER TABLE "NotificationQueueItem" ADD CONSTRAINT "NotificationQueueItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
