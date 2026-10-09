-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('SYNTHETIC', 'FILE_IMPORT', 'API');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('NOT_CONNECTED', 'CONNECTED', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "District" AS ENUM ('ALATAU', 'ALMALY', 'AUEZOV', 'BOSTANDYK', 'ZHETYSU', 'MEDEU', 'NAURYZBAY', 'TURKSIB');

-- CreateEnum
CREATE TYPE "BuildingType" AS ENUM ('PANEL', 'BRICK', 'MONOLITH', 'OTHER');

-- CreateEnum
CREATE TYPE "ApartmentCondition" AS ENUM ('ROUGH_FINISH', 'NEEDS_REPAIR', 'AVERAGE', 'GOOD', 'EXCELLENT');

-- CreateEnum
CREATE TYPE "SellerType" AS ENUM ('OWNER', 'AGENT', 'DEVELOPER');

-- CreateEnum
CREATE TYPE "ValuationStatus" AS ENUM ('OK', 'INSUFFICIENT_DATA', 'INVALID_LISTING');

-- CreateEnum
CREATE TYPE "ComparableScope" AS ENUM ('SAME_COMPLEX', 'SAME_MICRODISTRICT', 'SAME_DISTRICT_SIMILAR_BUILDING', 'SAME_DISTRICT');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RunTrigger" AS ENUM ('SCHEDULED', 'MANUAL', 'CLI');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "providesFullSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "statusMessage" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "publishedAt" TIMESTAMP(3),
    "sourceUpdatedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),
    "priceKzt" BIGINT NOT NULL,
    "totalArea" DECIMAL(7,2) NOT NULL,
    "livingArea" DECIMAL(7,2),
    "kitchenArea" DECIMAL(7,2),
    "rooms" INTEGER NOT NULL,
    "district" "District" NOT NULL,
    "microdistrict" TEXT,
    "address" TEXT,
    "complexName" TEXT,
    "complexKey" TEXT,
    "buildingType" "BuildingType",
    "yearBuilt" INTEGER,
    "floor" INTEGER,
    "floorsTotal" INTEGER,
    "condition" "ApartmentCondition",
    "ceilingHeight" DECIMAL(4,2),
    "sellerType" "SellerType",
    "furnished" BOOLEAN,
    "description" TEXT,
    "fingerprint" TEXT NOT NULL,
    "duplicateOfId" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingPriceHistory" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "priceKzt" BIGINT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectionRunId" TEXT,

    CONSTRAINT "ListingPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Valuation" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "status" "ValuationStatus" NOT NULL,
    "method" TEXT NOT NULL,
    "valuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listingPriceKzt" BIGINT NOT NULL,
    "pricePerSqm" BIGINT,
    "estimatedPricePerSqm" BIGINT,
    "marketValue" BIGINT,
    "marketValueLow" BIGINT,
    "marketValueHigh" BIGINT,
    "potentialDifference" BIGINT,
    "discountPercent" DECIMAL(6,2),
    "comparablesCount" INTEGER NOT NULL DEFAULT 0,
    "comparableScope" "ComparableScope",
    "confidence" INTEGER,
    "confidenceLevel" "ConfidenceLevel",
    "dealScore" INTEGER,
    "riskLevel" "RiskLevel",
    "warnings" TEXT[],
    "explanation" JSONB NOT NULL,

    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuationComparable" (
    "valuationId" TEXT NOT NULL,
    "comparableListingId" TEXT NOT NULL,
    "pricePerSqm" BIGINT NOT NULL,
    "similarity" DECIMAL(5,4) NOT NULL,
    "excludedAsOutlier" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ValuationComparable_pkey" PRIMARY KEY ("valuationId","comparableListingId")
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "trigger" "RunTrigger" NOT NULL,
    "status" "RunStatus" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "deactivatedCount" INTEGER NOT NULL DEFAULT 0,
    "valuedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "errorSamples" JSONB,

    CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "pid" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastBeatAt" TIMESTAMP(3) NOT NULL,
    "currentTask" TEXT,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_key_key" ON "DataSource"("key");

-- CreateIndex
CREATE INDEX "Listing_status_district_rooms_idx" ON "Listing"("status", "district", "rooms");

-- CreateIndex
CREATE INDEX "Listing_fingerprint_idx" ON "Listing"("fingerprint");

-- CreateIndex
CREATE INDEX "Listing_complexKey_idx" ON "Listing"("complexKey");

-- CreateIndex
CREATE INDEX "Listing_lastSeenAt_idx" ON "Listing"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_sourceId_externalId_key" ON "Listing"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "ListingPriceHistory_listingId_observedAt_idx" ON "ListingPriceHistory"("listingId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Valuation_listingId_key" ON "Valuation"("listingId");

-- CreateIndex
CREATE INDEX "Valuation_status_dealScore_idx" ON "Valuation"("status", "dealScore");

-- CreateIndex
CREATE INDEX "Valuation_status_discountPercent_idx" ON "Valuation"("status", "discountPercent");

-- CreateIndex
CREATE INDEX "ValuationComparable_comparableListingId_idx" ON "ValuationComparable"("comparableListingId");

-- CreateIndex
CREATE INDEX "CollectionRun_sourceId_status_idx" ON "CollectionRun"("sourceId", "status");

-- CreateIndex
CREATE INDEX "CollectionRun_requestedAt_idx" ON "CollectionRun"("requestedAt");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPriceHistory" ADD CONSTRAINT "ListingPriceHistory_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPriceHistory" ADD CONSTRAINT "ListingPriceHistory_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationComparable" ADD CONSTRAINT "ValuationComparable_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "Valuation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationComparable" ADD CONSTRAINT "ValuationComparable_comparableListingId_fkey" FOREIGN KEY ("comparableListingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
