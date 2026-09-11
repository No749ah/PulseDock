-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "scheduleDays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
ADD COLUMN     "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduleEndHour" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN     "scheduleStartHour" INTEGER NOT NULL DEFAULT 8;
