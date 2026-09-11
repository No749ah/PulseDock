-- AddColumn: monitor priority / criticality level
-- 0=unset, 1=P1 (critical), 2=P2 (high), 3=P3 (medium), 4=P4 (low)
ALTER TABLE "Monitor" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;
