-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "anomalyDetection" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "anomalyMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.0;
