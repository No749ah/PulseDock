-- CreateTable
CREATE TABLE "AlertRoutingRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "matchTags" TEXT[],
    "matchTypes" TEXT[],
    "matchFolderIds" TEXT[],
    "matchLevels" TEXT[],
    "matchMonitorIds" TEXT[],
    "channelIds" TEXT[],
    "overrideNotifyOn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRoutingRule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AlertRoutingRule" ADD CONSTRAINT "AlertRoutingRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
