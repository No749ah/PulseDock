-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpRecoveryCodes" TEXT,
ADD COLUMN     "totpSecret" TEXT;
