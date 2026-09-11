-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('READ', 'WRITE', 'ADMIN');

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "scope" "ApiKeyScope" NOT NULL DEFAULT 'WRITE',
ADD COLUMN     "usageCount" INTEGER NOT NULL DEFAULT 0;
