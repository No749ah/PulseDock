-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "sliLatencyTarget" INTEGER,
ADD COLUMN     "sliLatencyWindow" INTEGER NOT NULL DEFAULT 7;
