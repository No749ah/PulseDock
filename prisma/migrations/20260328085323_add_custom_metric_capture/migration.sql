-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "metricAlertMax" DOUBLE PRECISION,
ADD COLUMN     "metricAlertMin" DOUBLE PRECISION,
ADD COLUMN     "metricName" TEXT,
ADD COLUMN     "metricPath" TEXT,
ADD COLUMN     "metricUnit" TEXT;

-- AlterTable
ALTER TABLE "MonitorRun" ADD COLUMN     "capturedMetricValue" DOUBLE PRECISION;
