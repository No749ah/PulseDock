-- CreateTable
CREATE TABLE "PublicStatusPage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "configJson" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicStatusPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicStatusPage_slug_key" ON "PublicStatusPage"("slug");

-- CreateIndex
CREATE INDEX "PublicStatusPage_userId_idx" ON "PublicStatusPage"("userId");

-- CreateIndex
CREATE INDEX "PublicStatusPage_publishedAt_idx" ON "PublicStatusPage"("publishedAt");

-- AddForeignKey
ALTER TABLE "PublicStatusPage" ADD CONSTRAINT "PublicStatusPage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
