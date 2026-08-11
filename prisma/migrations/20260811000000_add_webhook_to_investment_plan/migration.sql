-- AlterTable
ALTER TABLE "InvestmentPlan" ADD COLUMN "webhookUrl" TEXT,
ADD COLUMN "webhookEnabled" BOOLEAN NOT NULL DEFAULT false;
