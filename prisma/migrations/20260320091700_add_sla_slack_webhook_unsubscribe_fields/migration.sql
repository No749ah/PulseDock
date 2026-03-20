-- AlterTable: Add SLA fields to Monitor
ALTER TABLE "Monitor" ADD COLUMN IF NOT EXISTS "slaTarget" DOUBLE PRECISION;
ALTER TABLE "Monitor" ADD COLUMN IF NOT EXISTS "slaPeriodDays" INTEGER DEFAULT 30;
ALTER TABLE "Monitor" ADD COLUMN IF NOT EXISTS "slaBreachAlertedAt" TIMESTAMP(3);

-- AlterTable: Add webhook fields to PublicStatusPage
ALTER TABLE "PublicStatusPage" ADD COLUMN IF NOT EXISTS "discordWebhookUrl" TEXT;
ALTER TABLE "PublicStatusPage" ADD COLUMN IF NOT EXISTS "slackWebhookUrl" TEXT;

-- AlterTable: Add unsubscribeToken to StatusPageSubscriber
ALTER TABLE "StatusPageSubscriber" ADD COLUMN IF NOT EXISTS "unsubscribeToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "StatusPageSubscriber_unsubscribeToken_key" ON "StatusPageSubscriber"("unsubscribeToken");

-- CreateTable: ToolTemplateFeedback
CREATE TABLE IF NOT EXISTS "ToolTemplateFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "toolId" TEXT NOT NULL,
    "monitorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolTemplateFeedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ToolTemplateFeedback_toolId_idx" ON "ToolTemplateFeedback"("toolId");
CREATE INDEX IF NOT EXISTS "ToolTemplateFeedback_userId_idx" ON "ToolTemplateFeedback"("userId");
ALTER TABLE "ToolTemplateFeedback" ADD CONSTRAINT "ToolTemplateFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
