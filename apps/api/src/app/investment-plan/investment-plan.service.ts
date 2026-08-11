import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import {
  DcaSchedule,
  InvestmentPlan,
  InvestmentPlanAllocation,
  InvestmentSignal,
  PriceAlert,
  Prisma,
  SignalStatus
} from '@prisma/client';

export type PlanWithRelations = InvestmentPlan & {
  allocations: InvestmentPlanAllocation[];
  dcaSchedules: DcaSchedule[];
  priceAlerts: PriceAlert[];
};

@Injectable()
export class InvestmentPlanService {
  private readonly logger = new Logger(InvestmentPlanService.name);

  public constructor(private readonly prismaService: PrismaService) {}

  public async sendWebhook(webhookUrl: string, payload: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch(webhookUrl, {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      return response.ok;
    } catch (error) {
      this.logger.error(`Failed to send webhook to ${webhookUrl}: ${error}`);
      return false;
    }
  }

  public async getPlanByUserId(userId: string): Promise<PlanWithRelations | null> {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    return this.prismaService.investmentPlan.findUnique({
      include: {
        allocations: true,
        dcaSchedules: true,
        priceAlerts: {
          where: {
            OR: [{ isActive: true }, { triggeredAt: { gte: oneDayAgo } }]
          }
        }
      },
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
        cashBuffer: (data.cashBuffer as number) ?? 0,
        cashReserve: (data.cashReserve as number) ?? 0,
        deployedCapital: (data.deployedCapital as number) ?? 0,
        emailEnabled: (data.emailEnabled as boolean) ?? false,
        longTermGrowthTarget: (data.longTermGrowthTarget as number) ?? 0,
        notifyEmail: data.notifyEmail as string | undefined,
        notifyLanguage: (data.notifyLanguage as string) ?? 'en',
        preservationBucket: (data.preservationBucket as number) ?? 0,
        sipMonthlyBudget: (data.sipMonthlyBudget as number) ?? 0,
        subscribeDca: (data.subscribeDca as boolean) ?? true,
        subscribePriceAlert: (data.subscribePriceAlert as boolean) ?? true,
        subscribeRebalancing: (data.subscribeRebalancing as boolean) ?? true,
        webhookEnabled: (data.webhookEnabled as boolean) ?? false,
        webhookUrl: data.webhookUrl as string | undefined,
        userId
      },
      update: data,
      where: { userId }
    });
  }

  public async upsertAllocationGroup(
    planId: string,
    params: {
      groupId?: string;
      name?: string;
      rebalanceThreshold?: number;
      symbols: { name?: string; symbol: string }[];
      targetWeight: number;
    }
  ): Promise<InvestmentPlanAllocation[]> {
    const groupId = params.groupId ?? randomUUID();
    const rebalanceThreshold = params.rebalanceThreshold ?? 5;
    const symbols = params.symbols;

    const groupName =
      params.name?.trim() ||
      (symbols.length > 1
        ? `${symbols[0].name ?? symbols[0].symbol} + others`
        : (symbols[0].name ?? symbols[0].symbol));

    return this.prismaService.$transaction(async (tx) => {
      await tx.investmentPlanAllocation.deleteMany({
        where: {
          groupId,
          planId,
          symbol: { notIn: symbols.map(({ symbol }) => symbol) }
        }
      });

      return Promise.all(
        symbols.map(({ symbol }) =>
          tx.investmentPlanAllocation.upsert({
            create: {
              groupId,
              planId,
              rebalanceThreshold,
              symbol,
              targetWeight: params.targetWeight,
              name: groupName
            },
            update: {
              groupId,
              rebalanceThreshold,
              targetWeight: params.targetWeight,
              name: groupName
            },
            where: { planId_symbol: { planId, symbol } }
          })
        )
      );
    });
  }

  public async deleteAllocationGroup(planId: string, groupId: string): Promise<void> {
    await this.prismaService.investmentPlanAllocation.deleteMany({
      where: { groupId, planId }
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

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    return this.prismaService.investmentSignal.findMany({
      orderBy: { date: 'desc' },
      take: 50,
      where: {
        date: { gte: since },
        planId,
        OR: [{ status: SignalStatus.PENDING }, { date: { gte: oneDayAgo } }]
      }
    });
  }

  public async updateSignalStatus(id: string, status: SignalStatus): Promise<InvestmentSignal> {
    return this.prismaService.investmentSignal.update({
      data: { status },
      where: { id }
    });
  }

  public async syncEmergencyFundToUserSettings(
    userId: string,
    cashReserve: number
  ): Promise<void> {
    const existing = await this.prismaService.settings.findUnique({
      where: { userId }
    });
    const current = (existing?.settings as Record<string, unknown>) ?? {};
    await this.prismaService.settings.upsert({
      create: {
        settings: { ...current, emergencyFund: cashReserve } as any,
        user: { connect: { id: userId } }
      },
      update: {
        settings: { ...current, emergencyFund: cashReserve } as any
      },
      where: { userId }
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
      include: { allocations: true, dcaSchedules: true, priceAlerts: true }
    });
  }
}
