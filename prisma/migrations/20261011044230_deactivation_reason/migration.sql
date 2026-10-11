-- CreateEnum
CREATE TYPE "DeactivationReason" AS ENUM ('REMOVED', 'STALE');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "deactivationReason" "DeactivationReason";
