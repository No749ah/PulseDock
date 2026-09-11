-- AlterEnum
ALTER TYPE "MonitorType" ADD VALUE 'GRAPHQL';

-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "graphqlDataPath" TEXT,
ADD COLUMN     "graphqlExpectedValue" TEXT,
ADD COLUMN     "graphqlQuery" TEXT,
ADD COLUMN     "graphqlVariables" TEXT;
