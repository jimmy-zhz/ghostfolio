import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Injectable } from '@nestjs/common';
import {
  DcaSchedule,
  InvestmentPlan,
  InvestmentPlanAllocation,
  InvestmentSignal,
  Prisma,
  SignalStatus
} from '@prisma/client';

export type PlanWithRelations = InvestmentPlan & {
  allocations: InvestmentPlanAllocation[];
  dcaSchedules: DcaSchedule[];
};

@Injectable()
export class InvestmentPlanService {
  public constructor(private readonly prismaService: PrismaService) {}

  public async getPlanByUserId(userId: string): Promise<PlanWithRelations | null> {
    return this.prismaService.investmentPlan.findUnique({
      include: { allocations: true, dcaSchedules: true },
      where: { userId }
    });
  }

  public async upsertPlan(
    userId: string,
    data: Prisma.InvestmentPlanUncheckedUpdateInput
  ): Promise<InvestmentPlan> {
    return this.prismaService.investmentPlan.upsert({
      create: {
        capitalPool: data.capitalPool as number,
        deployedCapital: (data.deployedCapital as number) ?? 0,
        emailEnabled: (data.emailEnabled as boolean) ?? false,
        notifyEmail: data.notifyEmail as string | undefined,
        notifyLanguage: (data.notifyLanguage as string) ?? 'en',
        userId
      },
      update: data,
      where: { userId }
    });
  }

  public async upsertAllocation(
    planId: string,
    symbol: string,
    targetWeight: number,
    rebalanceThreshold = 5
  ): Promise<InvestmentPlanAllocation> {
    return this.prismaService.investmentPlanAllocation.upsert({
      create: { planId, rebalanceThreshold, symbol, targetWeight },
      update: { rebalanceThreshold, targetWeight },
      where: { planId_symbol: { planId, symbol } }
    });
  }

  public async deleteAllocation(planId: string, symbol: string): Promise<void> {
    await this.prismaService.investmentPlanAllocation.deleteMany({
      where: { planId, symbol }
    });
  }

  public async createDcaSchedule(
    planId: string,
    data: Omit<Prisma.DcaScheduleUncheckedCreateInput, 'planId'>
  ): Promise<DcaSchedule> {
    return this.prismaService.dcaSchedule.create({
      data: { ...data, planId }
    });
  }

  public async updateDcaSchedule(
    id: string,
    data: Prisma.DcaScheduleUpdateInput
  ): Promise<DcaSchedule> {
    return this.prismaService.dcaSchedule.update({ data, where: { id } });
  }

  public async deleteDcaSchedule(id: string): Promise<void> {
    await this.prismaService.dcaSchedule.delete({ where: { id } });
  }

  public async getPendingSignals(planId: string): Promise<InvestmentSignal[]> {
    return this.prismaService.investmentSignal.findMany({
      orderBy: { date: 'desc' },
      take: 20,
      where: { planId, status: SignalStatus.PENDING }
    });
  }

  public async getRecentSignals(planId: string, days = 30): Promise<InvestmentSignal[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return this.prismaService.investmentSignal.findMany({
      orderBy: { date: 'desc' },
      take: 50,
      where: { date: { gte: since }, planId }
    });
  }

  public async updateSignalStatus(id: string, status: SignalStatus): Promise<InvestmentSignal> {
    return this.prismaService.investmentSignal.update({
      data: { status },
      where: { id }
    });
  }

  public async markSignalsEmailSent(ids: string[]): Promise<void> {
    await this.prismaService.investmentSignal.updateMany({
      data: { emailSent: true },
      where: { id: { in: ids } }
    });
  }

  public async getAllActivePlans(): Promise<PlanWithRelations[]> {
    return this.prismaService.investmentPlan.findMany({
      include: { allocations: true, dcaSchedules: true }
    });
  }
}
