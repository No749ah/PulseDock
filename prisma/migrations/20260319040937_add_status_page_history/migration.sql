-- CreateTable
CREATE TABLE "StatusPageHistory" (
    "id" TEXT NOT NULL,
    "statusPageId" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" TEXT,

    CONSTRAINT "StatusPageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusPageHistory_statusPageId_idx" ON "StatusPageHistory"("statusPageId");

-- CreateIndex
CREATE INDEX "StatusPageHistory_savedAt_idx" ON "StatusPageHistory"("savedAt");

-- AddForeignKey
ALTER TABLE "StatusPageHistory" ADD CONSTRAINT "StatusPageHistory_statusPageId_fkey" FOREIGN KEY ("statusPageId") REFERENCES "PublicStatusPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
