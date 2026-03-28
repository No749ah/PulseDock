-- AlterTable
ALTER TABLE "MaintenanceWindow" ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "recurrence" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "recurrenceDays" TEXT,
ADD COLUMN     "recurrenceEndsAt" TIMESTAMP(3);
