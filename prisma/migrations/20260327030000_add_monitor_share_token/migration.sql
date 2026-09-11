-- AlterTable: Add shareToken to Monitor for public status.json endpoint
ALTER TABLE "Monitor" ADD COLUMN "shareToken" TEXT;

-- CreateIndex: Unique constraint on shareToken
CREATE UNIQUE INDEX "Monitor_shareToken_key" ON "Monitor"("shareToken");
