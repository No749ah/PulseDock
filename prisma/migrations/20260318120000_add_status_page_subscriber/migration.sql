-- CreateTable
CREATE TABLE "StatusPageSubscriber" (
    "id" TEXT NOT NULL,
    "statusPageId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusPageSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatusPageSubscriber_statusPageId_email_key" ON "StatusPageSubscriber"("statusPageId", "email");

-- CreateIndex
CREATE INDEX "StatusPageSubscriber_statusPageId_idx" ON "StatusPageSubscriber"("statusPageId");
