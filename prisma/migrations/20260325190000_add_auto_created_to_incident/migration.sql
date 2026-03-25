-- AddColumn: autoCreated flag to Incident
ALTER TABLE "Incident" ADD COLUMN "autoCreated" BOOLEAN NOT NULL DEFAULT false;
