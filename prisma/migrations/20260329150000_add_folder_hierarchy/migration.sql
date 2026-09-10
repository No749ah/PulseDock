-- Add nested-folder fields that are present in the Prisma schema.
ALTER TABLE "Folder" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "Folder" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Folder_parentId_idx" ON "Folder"("parentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Folder_parentId_fkey'
  ) THEN
    ALTER TABLE "Folder"
      ADD CONSTRAINT "Folder_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "Folder"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
