-- AlterTable
ALTER TABLE "InvestmentPlan" ADD COLUMN     "subscribeRebalancing" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "subscribeDca" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "subscribePriceAlert" BOOLEAN NOT NULL DEFAULT true;
