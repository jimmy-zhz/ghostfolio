-- AlterTable
ALTER TABLE "InvestmentPlanAllocation" ADD COLUMN "groupId" TEXT,
ADD COLUMN "name" TEXT;

-- Backfill: each pre-existing row becomes its own single-symbol group
UPDATE "InvestmentPlanAllocation" SET "groupId" = "id" WHERE "groupId" IS NULL;

ALTER TABLE "InvestmentPlanAllocation" ALTER COLUMN "groupId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "InvestmentPlanAllocation_planId_groupId_idx" ON "InvestmentPlanAllocation"("planId", "groupId");
