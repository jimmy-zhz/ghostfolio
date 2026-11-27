-- CreateEnum
CREATE TYPE "FundGroupKind" AS ENUM ('SOURCE', 'PURPOSE');

-- CreateEnum
CREATE TYPE "PriceAlertRuleType" AS ENUM ('PRICE', 'PCT_FROM_HIGH', 'PCT_FROM_COST', 'DAILY_CHANGE');

-- AlterTable
ALTER TABLE "PriceAlert" ADD COLUMN "ruleType" "PriceAlertRuleType" NOT NULL DEFAULT 'PRICE',
ADD COLUMN "lookbackDays" INTEGER,
ADD COLUMN "actionNote" TEXT;

-- CreateTable
CREATE TABLE "FundGroup" (
    "id" TEXT NOT NULL,
    "kind" "FundGroupKind" NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "principal" DOUBLE PRECISION,
    "isRemainder" BOOLEAN NOT NULL DEFAULT false,
    "targetAmount" DOUBLE PRECISION,
    "targetDate" TIMESTAMP(3),
    "tagId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundGroup_planId_idx" ON "FundGroup"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "FundGroup_planId_tagId_key" ON "FundGroup"("planId", "tagId");

-- AddForeignKey
ALTER TABLE "FundGroup" ADD CONSTRAINT "FundGroup_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundGroup" ADD CONSTRAINT "FundGroup_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InvestmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
