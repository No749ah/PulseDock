-- AddColumn: auto-incident fields to Monitor
ALTER TABLE "Monitor" ADD COLUMN "autoIncident" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Monitor" ADD COLUMN "autoIncidentSeverity" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Monitor" ADD COLUMN "activeAutoIncidentId" TEXT;
