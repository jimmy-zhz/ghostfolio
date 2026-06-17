-- CreateEnum
CREATE TYPE "DcaType" AS ENUM ('INITIAL_POSITION', 'ADD_POSITION');

-- CreateEnum
CREATE TYPE "DcaSignalType" AS ENUM ('FIXED', 'MA5', 'RSI', 'COMBINED');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('DCA_BUY', 'DCA_WAIT', 'REBALANCE_BUY', 'REBALANCE_SELL');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('PENDING', 'EXECUTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "InvestmentPlan" (
    "id" TEXT NOT NULL,
    "capitalPool" DOUBLE PRECISION NOT NULL,
    "deployedCapital" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notifyEmail" TEXT,
    "notifyLanguage" TEXT NOT NULL DEFAULT 'en',
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "InvestmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentPlanAllocation" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "targetWeight" DOUBLE PRECISION NOT NULL,
    "rebalanceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "planId" TEXT NOT NULL,

    CONSTRAINT "InvestmentPlanAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DcaSchedule" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" "DcaType" NOT NULL DEFAULT 'ADD_POSITION',
    "weeklyBudget" DOUBLE PRECISION NOT NULL,
    "totalBudget" DOUBLE PRECISION,
    "signalType" "DcaSignalType" NOT NULL DEFAULT 'MA5',
    "deadlineDay" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "planId" TEXT NOT NULL,

    CONSTRAINT "DcaSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentSignal" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" "SignalType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SignalStatus" NOT NULL DEFAULT 'PENDING',
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" TEXT NOT NULL,

    CONSTRAINT "InvestmentSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentPlan_userId_key" ON "InvestmentPlan"("userId");

-- CreateIndex
CREATE INDEX "InvestmentPlanAllocation_planId_idx" ON "InvestmentPlanAllocation"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentPlanAllocation_planId_symbol_key" ON "InvestmentPlanAllocation"("planId", "symbol");

-- CreateIndex
CREATE INDEX "DcaSchedule_planId_idx" ON "DcaSchedule"("planId");

-- CreateIndex
CREATE INDEX "DcaSchedule_isActive_idx" ON "DcaSchedule"("isActive");

-- CreateIndex
CREATE INDEX "InvestmentSignal_planId_idx" ON "InvestmentSignal"("planId");

-- CreateIndex
CREATE INDEX "InvestmentSignal_date_idx" ON "InvestmentSignal"("date");

-- CreateIndex
CREATE INDEX "InvestmentSignal_status_idx" ON "InvestmentSignal"("status");

-- AddForeignKey
ALTER TABLE "InvestmentPlan" ADD CONSTRAINT "InvestmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentPlanAllocation" ADD CONSTRAINT "InvestmentPlanAllocation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InvestmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DcaSchedule" ADD CONSTRAINT "DcaSchedule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InvestmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentSignal" ADD CONSTRAINT "InvestmentSignal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InvestmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
