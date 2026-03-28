-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "geoRegions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "MonitorRun" ADD COLUMN     "geoRegion" TEXT;
